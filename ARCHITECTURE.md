# System Architecture & Technical Specifications

## 1. System Overview
The architecture follows a dual-pane client-server model, inspired by the reference project "Feynman Lectures Vol. I, interactive" (mishig/feynman-interactive) but **interactive and AI-augmented**. The **Stage (left pane)** hosts the scroll-synced WebGL demo with transport controls and sliders; the **Reader (right pane)** renders the lecture PDF as paper-white pages with cue marks in the left margin. The Python backend uses FastAPI and LangGraph to process physics equations and manage the context-aware AI tutor (LLM via NVIDIA NIM, OpenAI-compatible endpoint).

Visual style is a minimalist print aesthetic: paper white (`#fff`) on a warm gray surround (`#f4f4f2`), near-black ink (`#111`), hairline rules, serif prose vs sans UI, ink wireframe demos on a white canvas.

```
+-----------------------------------------------------------------------+
|  HEADER: brand · page label · backend status · Hold demo · Tutor · ?  |
+-----------------------------------------------------------------------+
|  STAGE (left, ~46%, resizable) | divider |  READER (right)            |
|  +---------------------------+          +-------------------------+ |
|  | demo title + note         |          | read-line (sticky 32%)  | |
|  | +---------------------+   |          | paper pages (pdf.js)    | |
|  | | WebGL canvas (ink)  |   |          | with cue marks ◇ in the | |
|  | | bohr / atoms-box    |   |          | left margin (clickable) | |
|  | +---------------------+   |          +-------------------------+ |
|  | transport: pause/restart/ |                                        |
|  |   restore/hold/prev-next   |                                        |
|  | sliders (params) + readout |                                        |
|  | tutor overlay card (AI)    |                                        |
|  +---------------------------+                                        |
+-----------------------------------------------------------------------+
|  HTTP / SSE                                                             |
|  PYTHON BACKEND (FastAPI + LangGraph): tutor graph, physics engine,   |
|  document listing/serving (content/lectures/), NVIDIA NIM LLM         |
+-----------------------------------------------------------------------+
```

## 2. Directory Structure
```
.
├── frontend/                     # Next.js Application
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx              # Renders AppShell
│   ├── components/
│   │   ├── AppShell.tsx          # Header + split layout + shortcuts
│   │   ├── reader/
│   │   │   └── PdfReader.tsx     # pdf.js reader, cue marks, read-line
│   │   ├── canvas/
│   │   │   ├── PhysicsCanvas.tsx # Stage: title/note, canvas, controls
│   │   │   ├── ParticleControls.tsx
│   │   │   └── scenes/
│   │   │       ├── BohrAtomScene.tsx   # 3D perspective, ink wireframes
│   │   │       ├── EngineScene.tsx     # Generated scalar potential + particles
│   │   │       └── AtomsBoxScene.tsx   # 2D ortho gas/liquid (ch. 1)
│   │   └── ui/
│   │       ├── StageControls.tsx      # Transport + sliders + readouts
│   │       └── AgentChatPanel.tsx      # Tutor overlay card
│   ├── hooks/
│   │   ├── usePhysicsState.ts    # Zustand store: cues, hold, params…
│   │   └── useAgentSocket.ts     # SSE client for the tutor
│   ├── lib/
│   │   └── cues.ts               # Declarative cue maps (Feynman ch.1 + bohr)
│   ├── types/
│   │   └── physics.ts            # Cue, DemoId, payloads, constants
│   └── .env.local                # NEXT_PUBLIC_API_URL
│
├── backend/                      # Python Service
│   ├── app/
│   │   ├── main.py               # FastAPI entrypoint
│   │   ├── core/config.py        # Pydantic settings (env vars)
│   │   ├── api/routes.py         # /api/tutor (SSE), /api/documents
│   │   ├── agents/               # LangGraph graph + nodes
│   │   ├── llm/provider.py       # NVIDIA NIM client (OpenAI-compatible)
│   │   └── physics_engine/       # atomic_models.py, potentials.py
│   ├── requirements.txt
│   └── .env                      # NVIDIA_API_KEY, NIM_MODEL_ID
│
└── content/lectures/             # User-provided lecture PDFs (served)
```

## 3. Cue-Driven Scene Sync (from the PDF)
Scroll drives the demo through **declarative cues**, resolved against the actual PDF text:

1. **Reading position:** a sticky read-line at 32% of the reader viewport marks the reading position (page + offset).
2. **Cue maps:** per-document sets of cues (`lib/cues.ts`), each `{ demo, at: {page | keywords}, title, note, params }`.
   - **Hand-authored** (kind `authored`): clearly identified "Atoms in Motion" chapter-one files and explicitly named Bohr papers get keyword-anchored maps. Other files, including general Feynman Vol. I extracts and hydrogen papers, go through AI interpretation.
   - **AI-interpreted** (kind `llm`): other physics PDFs run a **two-agent pipeline** (`POST /api/interpret/stream`, `app/llm/interpret.py`):
     - **Agent 1 — Physics Analyst**: reads the paper in chunks (line-structured text so formulas survive) and extracts concepts with page references, formulas and importance scores.
     - **Agent 2 — Simulation Designer**: maps the analysis to demo cues, **using the paper's own numbers** (frequencies, couplings, mass ratios, eccentricities…) to set simulation parameters. It can generate a scalar-potential scene, extend the same system with new particles, or replace it when the topic changes. Cues include assumptions and model limits.
3. **Anchor pinning:** the reader extracts each page's text in the background and pins keyword-anchored cues to the first matching page (word-boundary matching, one cue per page). AI cues arrive pre-pinned to their pages. Pinned cues show as diamonds ◇ in the left margin; clicking jumps there.
4. **Sticky activation:** the active cue is the last cue pinned at-or-before the reading position. On change, the stage applies the cue's demo + params, title, note and assumptions. Engine cues marked `extend` carry forward prior particles for the same system; `replace` starts a new system. `Hold demo` (H) freezes sync; J/K jump between cue points.
5. **Bi-directional:** sliders on the stage modify demo params live ("Back to text values" restores the cue's canonical params). In the Bohr demo the electron can be dragged between orbits, triggering a physical transition.
6. **LLM layer (tutor):** the AI tutor receives the current page text, the active cue and the live demo state; it can answer questions and suggest scene adjustments (streamed via SSE). Supported adjustments are presented for user acceptance before being applied.

**Demos:** `bohr` (3D atom), `atoms-box` (3D cube of bouncing atoms), `field` (3D scalar field), `orbit` (3D two-body Kepler orbit), `oscillator` (3D pendulum), and `engine` (generated scalar potential with particles moving under its gradient). The generated engine is limited to a 2D scalar potential and up to eight particles; labeled interaction links and vertices animate as diagram edges, not as calculated forces or quantum amplitudes. Cue assumptions disclose these limits and other qualitative approximations. All demos use a two-color vintage-plate palette on a dotted graph-paper canvas.

## 4. Agentic Workflow (LangGraph State Machine)
1. State Ingestion (AgentState): Captures `user_query`, `scene_state` (active cue, page, energy level, demo params), and `document_context` (extracted text of the page at the reading line).
2. Node 1 (parse_and_compute): Executes Python physical validation routines (e.g., Bohr model energy levels E_n = -13.6 eV / n², orbital radius r_n = n² a₀ via SciPy/NumPy).
3. Node 2 (generate_explanation): Feeds context and physics calculation output into the LLM (NVIDIA NIM — configurable via env) to synthesize a concise, pedagogical explanation.
4. Node 3 (emit_payload): Streams the response back to the tutor card and emits parameter adjustments if optimal states are suggested.

## 5. Configuration (Environment Variables)
| Variable | Location | Description |
|---|---|---|
| `NVIDIA_API_KEY` | `backend/.env` | API key for NVIDIA Build (NIM) |
| `NIM_MODEL_ID` | `backend/.env` | Model ID, e.g. `nvidia/nemotron-3-ultra-550b-a55b` (see `backend/.env.example` for verified options; NIM retires models — re-verify liveness) |
| `NIM_BASE_URL` | `backend/.env` | Defaults to `https://integrate.api.nvidia.com/v1` |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` | Backend URL for the frontend (default `http://localhost:8000`) |

## 6. Development (Local Only)
- Frontend: `cd frontend && npm run dev` (Next.js on :3000)
- Backend: `cd backend && uvicorn app.main:app --reload` (FastAPI on :8000)
- No Docker for now; documents go in `content/lectures/`.
