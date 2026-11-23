"""Generative scene specs: the Designer no longer only picks a fixed demo — for any
paper that defines a potential, energy landscape or field with an equation, it
emits a declarative scene (surface expression + particles with initial
conditions) that the frontend engine canvas builds and integrates live.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

UNICODE_MATH = {
    "²": "^2",
    "³": "^3",
    "−": "-",
    "–": "-",
    "×": "*",
    "·": "*",
    "√": "sqrt",
    "π": "pi",
    "φ": "x",
    "η": "y",
}


def normalize_expr(expr: str) -> str:
    """Best-effort ASCII normalization of an LLM-transcribed formula."""
    out = str(expr)
    for uni, ascii_ in UNICODE_MATH.items():
        out = out.replace(uni, ascii_)
    return out.strip()[:500]


def _num_list(value: Any, length: int) -> list[float] | None:
    if not isinstance(value, (list, tuple)):
        return None
    nums: list[float] = []
    for item in value:
        try:
            nums.append(float(item))
        except (TypeError, ValueError):
            return None
    if len(nums) < length:
        nums.extend([0.0] * (length - len(nums)))
    return nums[:length]


def normalize_scene(raw: Any) -> dict[str, Any] | None:
    """Repair common LLM shape slips; return None only when unrecoverable."""
    if not isinstance(raw, dict):
        return None
    surface = raw.get("surface")
    if not isinstance(surface, dict):
        return None
    expr = normalize_expr(surface.get("expr", ""))
    if not expr:
        return None
    particles = raw.get("particles")
    if not isinstance(particles, list) or not particles:
        return None
    clean_particles = []
    used_labels: set[str] = set()
    for index, pt in enumerate(particles[:8]):
        if not isinstance(pt, dict):
            continue
        p = _num_list(pt.get("p"), 2)
        v = _num_list(pt.get("v", [0.0, 0.0]), 2)
        if p is None or v is None:
            continue
        label = str(pt.get("label", f"particle-{index + 1}"))[:40].strip()
        label = label or f"particle-{index + 1}"
        if label in used_labels:
            label = f"{label[:32]}-{index + 1}"
        used_labels.add(label)
        kind = pt.get("kind") if pt.get("kind") in ("scalar", "fermion", "boson") else "scalar"
        clean_particles.append({"p": p, "v": v, "label": label, "kind": kind})
    if not clean_particles:
        return None
    interactions = []
    raw_interactions = raw.get("interactions")
    if isinstance(raw_interactions, list):
        for edge in raw_interactions[:16]:
            if not isinstance(edge, dict):
                continue
            source = str(edge.get("from", ""))[:40]
            target = str(edge.get("to", ""))[:40]
            label = str(edge.get("label", ""))[:60]
            if source and target and source != target:
                interactions.append({"from": source, "to": target, "label": label})
    sim = raw.get("sim") if isinstance(raw.get("sim"), dict) else {}
    try:
        damping = float(sim.get("damping", 0.02))
    except (TypeError, ValueError):
        damping = 0.02
    try:
        speed = float(sim.get("speed", 1.0))
    except (TypeError, ValueError):
        speed = 1.0
    try:
        span = float(surface.get("range", 2.2))
    except (TypeError, ValueError):
        span = 2.2
    try:
        z = float(surface.get("z", 0.16))
    except (TypeError, ValueError):
        z = 0.16
    return {
        "mode": raw.get("mode", "replace") if raw.get("mode") in ("replace", "extend") else "replace",
        "surface": {
            "expr": expr,
            "range": min(10.0, max(0.5, span)),
            "z": min(2.0, max(0.02, z)),
        },
        "particles": clean_particles,
        "interactions": interactions,
        "sim": {
            "damping": min(1.0, max(0.0, damping)),
            "speed": min(3.0, max(0.1, speed)),
        },
    }


class SceneSurface(BaseModel):
    expr: str = Field(min_length=1, max_length=500)
    range: float = Field(default=2.2, ge=0.5, le=10.0)
    z: float = Field(default=0.16, ge=0.02, le=2.0)


class SceneParticle(BaseModel):
    p: list[float] = Field(min_length=2, max_length=2)
    v: list[float] = Field(default_factory=lambda: [0.0, 0.0], min_length=2, max_length=2)
    label: str = Field(default="particle", max_length=40)
    kind: Literal["scalar", "fermion", "boson"] = "scalar"


class SceneInteraction(BaseModel):
    source: str = Field(alias="from", max_length=40)
    target: str = Field(alias="to", max_length=40)
    label: str = Field(default="", max_length=60)


class SceneSim(BaseModel):
    damping: float = Field(default=0.02, ge=0.0, le=1.0)
    speed: float = Field(default=1.0, ge=0.1, le=3.0)


class SceneSpec(BaseModel):
    mode: Literal["replace", "extend"] = "replace"
    surface: SceneSurface
    particles: list[SceneParticle] = Field(min_length=1, max_length=8)
    interactions: list[SceneInteraction] = Field(default_factory=list, max_length=16)
    sim: SceneSim = Field(default_factory=SceneSim)


def coerce_scene(raw: Any) -> dict[str, Any] | None:
    """Validate a designer-provided scene; return sanitized dict or None.

    Structural slips (extra coordinates, string numbers, out-of-range values,
    unicode math) are repaired; only a missing/empty surface or zero usable
    particles is unrecoverable.
    """
    normalized = normalize_scene(raw)
    if normalized is None:
        return None
    try:
        spec = SceneSpec.model_validate(normalized)
    except Exception:
        return None
    if not spec.surface.expr.strip():
        return None
    return spec.model_dump(by_alias=True)
