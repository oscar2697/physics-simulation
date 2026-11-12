"""Two-agent document interpretation:

  Agent 1 — Physics Analyst: reads the paper page by page and extracts a structured
            analysis: topic, key concepts with page references, formulas and quantities.
  Agent 2 — Simulation Designer: turns the analysis into a cue map — which demo to run,
            with which parameters, at which reading point.

The pipeline is robust: chunked analysis for long papers, strict-JSON retries for
chatty replies, and hard provider failures (dead/unauthorized model) surfaced as
InterpretError instead of a silent empty result.
"""

import json
import re
import time
from typing import Any

from pydantic import BaseModel, Field

from app.llm.provider import get_llm

MAX_PAGES = 120
MAX_PAGE_CHARS = 4000
MAX_CONCEPTS = 30
MAX_CUES = 14
CHUNK_SIZE = 4

# Bump when prompts or staging semantics change so stale cached cue maps
# (which were designed under older rules) are never reused.
PIPELINE_VERSION = "v3-faithful-coverage"


class InterpretError(RuntimeError):
    """Raised when the LLM call fails for a reason other than malformed JSON.

    Distinguishing a dead/unauthorized/model-retired provider error from a bad
    model reply is important: the former must surface to the caller instead of
    silently degrading to "0 cues".
    """


# HTTP statuses worth a single retry before giving up.
_TRANSIENT_STATUS = {429, 500, 502, 503, 504}


DEMOS_VOCAB = """Available demos and their parameters:

1. demo "bohr" — 3D Bohr atom (atomic structure, energy levels, transitions, orbitals, particles):
   params: {"showNucleus": bool, "showElectron": bool, "showEnergyRings": bool,
            "showElectronCloud": bool (probability cloud), "showGluons": bool, "showBosons": bool,
            "energyLevelN": int 1-5,
            "pendingTransition": null | {"from": int 1-5, "to": int 1-5}}

2. demo "atoms-box" — 3D cube of atoms bouncing (kinetic theory, gas, states of matter,
   thermodynamics, evaporation, pressure, phase transitions):
   params: {"phase": "gas" | "liquid", "atomCount": int 20-240,
            "temperature": float 0.2-3.0, "escaping": bool}

3. demo "field" — 3D scalar field (field theory, waves, QFT, potentials, symmetry breaking,
   Higgs-like mechanisms):
   params: {"mode": "wave" (traveling wave) | "mexican-hat" (V = lambda*(|phi|^2 - v^2)^2 with balls
            rolling from the symmetric top into the valley),
            "amplitude": float 0.5-4.0, "frequency": float 0.2-3.0, "coupling": float 0.5-3.0}

   Staging notes the designer must know:
   - "mexican-hat" renders the V = lambda*(r^2 - v^2)^2 surface: unstable symmetric peak at
     the center, valley ring (the vacuum states) with an accent marker on the vacuum ring,
     and balls that start at the symmetric top and roll down into the valley.
     The valley radius v follows "amplitude" (the paper's vacuum value, e.g. phi_0 = 3.2,
     renders as v = 1) and the steepness follows "coupling" (lambda).
   - "wave" renders a traveling ripple grid — only for propagating waves/excitations.

4. demo "orbit" — 3D two-body orbit (gravity, central forces, Kepler, planetary motion,
   bound systems, binaries):
   params: {"massRatio": float 0.1-10, "eccentricity": float 0-0.9, "speed": float 0.2-3.0}

5. demo "oscillator" — 3D pendulum (harmonic motion, oscillations, resonance, damping,
   small-angle approximations, driven systems):
   params: {"gravity": float 0.5-20, "length": float 0.5-4,
            "damping": float 0-1, "driven": bool}"""

ANALYST_PROMPT = """You are a physics reading agent. Analyze this excerpt of a physics document and extract
its key physical content.

Document: "{title}" (excerpt: pages {first_page}–{last_page} of {total_pages}).

The text was extracted from a PDF, so math is degraded. Reconstruct it:
- digits glued to a symbol are usually exponents or subscripts ("E2" = E², "φ0" = φ_0,
  "c2" = c², "r2" = r²);
- fractions and roots are often split across lines ("h" then "2π" = h/(2π); "√" then "10" = √10);
- reconstruct the intended formula in plain readable notation (use ^ for powers, _ for
  subscripts, / for fractions, * for multiplication, sqrt() for roots).

For each important concept in the excerpt, report:
- the page where it is discussed,
- a short name,
- the formula in plain notation if one is given (keep the paper's symbols; if no formula
  is stated, use an empty string),
- a one-sentence description of what the text says about it,
- an importance from 1 (incidental) to 5 (central to the paper).

Pay special attention to equations and formula-like lines — they anchor what a simulation
should show. Cover the excerpt from beginning to end, in page order.

Respond with ONLY a JSON object, no markdown fences:
{{"concepts": [{{"page": <int>, "name": "<str>", "formula": "<str or empty>", "note": "<str>", "importance": <int 1-5>}}]}}

Excerpt text by page:
{pages}"""

DESIGNER_PROMPT = """You are a simulation director. A physics analyst has read the paper "{title}" and extracted
these concepts (in page order, with formulas and importance 1–5):

{concepts}

Your job: design an interactive reading experience. For each concept worth simulating (importance
>= 3, or lower if it anchors a formula), pick the demo that best illustrates it and set its
parameters using the demo vocabulary below. When the paper gives concrete numbers (a frequency,
a coupling, a mass ratio, a damping, an eccentricity…), USE THEM to set the corresponding
parameter. When it does not, choose pedagogically sensible values.

{vocab}

Rules:
- 4 to {max_cues} cues, in page order, covering the paper from beginning to end.
- FAITHFULNESS FIRST — the stage must show the paper's own objects, not a loose analogy:
  * Any discussion of a potential V(phi), symmetry breaking, vacuum states, vacuum
    expectation value, or minima MUST use demo "field" with mode "mexican-hat".
  * Couplings and numbers from the paper (g', lambda, vev, masses) MUST set "coupling"
    (and amplitude/frequency where they genuinely correspond). Never leave defaults
    when the paper gives a number. Vary parameters cue by cue — copy-pasted identical
    params across all cues is a defect.
  * Avoid "oscillator" (a mechanical pendulum) and "atoms-box" (a kinetic gas) unless
    the paper is actually about oscillations/mechanics or kinetic/statistical matter.
    "orbit" only for genuine two-body/gravitational/central-force systems.
  * COVERAGE: the cues must span the whole paper — early, middle AND late sections
    (e.g. consequences, uncertainty arguments, reformulations, summary). Do not cluster
    all cues in the first half. If a late section has no natural demo, use the closest
    "field" mode and make the note say exactly what each visual element stands for.
  * "wave" only for genuinely propagating waves or field excitations.
- Titles: max 40 chars. Notes: max 180 chars, plain English, referencing what that part of the text says.
  Each note must name the paper's object shown on stage (e.g. "the ball rolls from the
  symmetric top into the valley — the vacuum of Fig. 1").
- Only use parameter names from the vocabulary. Omit parameters you don't need.

Respond with ONLY a JSON object, no markdown fences:
{{"cues": [{{"page": <int>, "demo": "bohr"|"atoms-box"|"field"|"orbit"|"oscillator", "title": "<str>", "note": "<str>", "params": {{...}}}}]}}"""

STRICT_SUFFIX = """

Your previous reply was not valid JSON. Now respond with ONLY the raw JSON object — no markdown
fences, no explanations, no text before or after. Start with {{ and end with }}."""

VALID_DEMOS = ("bohr", "atoms-box", "field", "orbit", "oscillator")


class Concept(BaseModel):
    page: int = Field(ge=1)
    name: str
    formula: str = ""
    note: str
    importance: int = Field(default=3, ge=1, le=5)


class Analysis(BaseModel):
    concepts: list[Concept] = Field(default_factory=list)


class InterpretedCue(BaseModel):
    page: int = Field(ge=1)
    demo: str
    title: str
    note: str
    params: dict[str, Any] = Field(default_factory=dict)


class InterpretResult(BaseModel):
    cues: list[InterpretedCue] = Field(default_factory=list)
    cached: bool = False


def _extract_json(text: str) -> dict[str, Any] | None:
    # Strip markdown fences first (non-greedy capture would truncate nested JSON).
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    raw = fenced.group(1) if fenced else text
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None


def _response_text(response: Any) -> str:
    """Best-effort extraction of the model's text from a LangChain message."""
    content = getattr(response, "content", None)
    if isinstance(content, str) and content:
        return content
    if isinstance(content, list):
        joined = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part) for part in content
        )
        if joined:
            return joined
    # `text` is a property that is deprecated to *call* in newer LangChain.
    text = getattr(response, "text", None)
    if isinstance(text, str):
        return text
    if callable(text):
        try:
            return text()
        except TypeError:
            return ""
    return ""


def _call_llm(llm: Any, prompt: str) -> str:
    """Invoke the model, retrying transient failures and raising InterpretError on hard ones."""
    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            return _response_text(llm.invoke(prompt))
        except Exception as exc:  # noqa: BLE001 — classify then re-raise
            status = getattr(exc, "status_code", None)
            if status in _TRANSIENT_STATUS and attempt == 0:
                last_exc = exc
                time.sleep(1.5)
                continue
            raise InterpretError(
                f"LLM request failed ({type(exc).__name__}"
                + (f", HTTP {status}" if status else "")
                + f"): {exc}"
            ) from exc
    raise InterpretError(f"LLM request failed after retry: {last_exc}")


def _invoke_json(prompt: str) -> dict[str, Any] | None:
    """Return parsed JSON from the model, retrying once with a strict-JSON suffix.

    Provider/transport failures raise InterpretError; only malformed replies return None.
    """
    llm = get_llm(temperature=0.2)
    for attempt in (prompt, prompt + STRICT_SUFFIX):
        text = _call_llm(llm, attempt)
        payload = _extract_json(text)
        if payload is not None:
            return payload
    return None


def _chunk_pages(pages: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    return [pages[i : i + CHUNK_SIZE] for i in range(0, len(pages), CHUNK_SIZE)]


def _analyze_chunk(title: str, chunk: list[dict[str, Any]], total_pages: int) -> list[Concept]:
    pages_block = "\n".join(f"[page {p['page']}]\n{p['text']}" for p in chunk)
    prompt = ANALYST_PROMPT.format(
        title=title,
        first_page=chunk[0]["page"],
        last_page=chunk[-1]["page"],
        total_pages=total_pages,
        pages=pages_block,
    )
    payload = _invoke_json(prompt)
    concepts: list[Concept] = []
    if payload is None:
        return concepts
    for raw in payload.get("concepts", []):
        if not isinstance(raw, dict):
            continue
        try:
            concept = Concept(
                page=max(1, int(raw.get("page", chunk[0]["page"]))),
                name=str(raw.get("name", ""))[:80],
                formula=str(raw.get("formula", ""))[:160],
                note=str(raw.get("note", ""))[:240],
                importance=int(raw.get("importance", 3)),
            )
        except (ValueError, TypeError):
            continue
        if concept.name and concept.note:
            concepts.append(concept)
    return concepts


def _coerce_cue(raw: Any, max_page: int) -> InterpretedCue | None:
    if not isinstance(raw, dict):
        return None
    demo = raw.get("demo")
    if demo not in VALID_DEMOS:
        return None
    try:
        cue = InterpretedCue(
            page=max(1, min(int(raw.get("page", 1)), max_page)),
            demo=demo,
            title=str(raw.get("title", ""))[:60] or "Demo",
            note=str(raw.get("note", ""))[:220],
            params=raw.get("params") if isinstance(raw.get("params"), dict) else {},
        )
    except (ValueError, TypeError):
        return None
    return cue if cue.note else None


def _design_cues(title: str, concepts: list[Concept], total_pages: int) -> list[InterpretedCue]:
    concepts_block = "\n".join(
        f"- p.{c.page} [{c.importance}/5] {c.name}"
        + (f" — formula: {c.formula}" if c.formula else "")
        + f" — {c.note}"
        for c in concepts[:MAX_CONCEPTS]
    )
    prompt = DESIGNER_PROMPT.format(
        title=title,
        concepts=concepts_block,
        vocab=DEMOS_VOCAB,
        max_cues=MAX_CUES,
    )
    payload = _invoke_json(prompt)
    if payload is None:
        return []
    cues: list[InterpretedCue] = []
    for raw in payload.get("cues", []):
        cue = _coerce_cue(raw, max_page=total_pages)
        if cue is not None:
            cues.append(cue)
    return cues[:MAX_CUES]


def interpret_document(
    title: str,
    pages: list[dict[str, Any]],
    on_progress: Any | None = None,
) -> InterpretResult:
    """Run the analyst → designer pipeline over the document.

    on_progress, when given, is called as on_progress(phase, done, total) where
    phase is "analyzing" or "designing" — used by the SSE endpoint to stream
    live progress to the reader UI.
    """

    def emit(phase: str, done: int, total: int) -> None:
        if on_progress is not None:
            on_progress(phase, done, total)

    trimmed: list[dict[str, Any]] = []
    for entry in pages[:MAX_PAGES]:
        text = (entry.get("text") or "")[:MAX_PAGE_CHARS]
        trimmed.append({"page": entry.get("page"), "text": text})
    if not trimmed:
        return InterpretResult(cues=[])

    chunks = _chunk_pages(trimmed)
    concepts: list[Concept] = []
    emit("analyzing", 0, len(chunks))
    for i, chunk in enumerate(chunks, start=1):
        concepts.extend(_analyze_chunk(title, chunk, len(trimmed)))
        emit("analyzing", i, len(chunks))
    if not concepts:
        return InterpretResult(cues=[])

    emit("designing", 0, 1)
    cues = _design_cues(title, concepts, len(trimmed))
    emit("designing", 1, 1)
    return InterpretResult(cues=cues)
