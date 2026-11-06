# Developer Agent Skills & Competencies Required

To execute this codebase efficiently, the developer agent (OpenCode) must apply and adhere to the following skills and best practices:

## 1. Next.js & React Three Fiber (R3F) Architecture
- **Skill:** Build responsive Split-Pane UI using Tailwind CSS and `react-resizable-panels`.
- **Skill:** Construct declarative 3D scenes using `@react-three/fiber` and `@react-three/drei`.
- **Best Practice:** Keep 3D scene state separate from heavy React re-renders. Use `useFrame` loops and refs for smooth 60 FPS performance.
- **Best Practice:** Implement dynamic client-side imports for R3F components in Next.js to prevent SSR/window hydration errors (`ssr: false`).

## 2. PDF Reader (react-pdf / pdf.js)
- **Skill:** Render PDF documents with `react-pdf` (pdf.js worker) inside the reader pane, client-side only.
- **Best Practice:** The Feynman Lectures PDFs are large (hundreds of pages). Lazy-load and virtualize page rendering (render only pages near the viewport) to keep memory and scroll performance healthy.
- **Best Practice:** Track scroll progress and map visible pages/paragraphs to document sections via section sync anchors (per-document scene map).

## 3. Scroll-Driven Scene Sync
- **Skill:** Implement a scroll-position observer (IntersectionObserver / scroll progress) in the reader that detects the active section and emits scene patches to the 3D canvas.
- **Skill:** Design scene state patches as declarative data (section ID → scene state) so new simulations can be added without rewriting sync logic.
- **Best Practice:** Debounce/throttle section-change events; animate transitions between scene states instead of snapping.

## 4. Python FastAPI & LangGraph Orchestration
- **Skill:** Design stateful multi-node agent graphs using `langgraph`.
- **Skill:** Implement custom Pydantic schemas for strict state synchronization between frontend and backend.
- **Best Practice:** Maintain a structured `AgentState` containing `document_context`, `current_section`, `scene_3d_state` (position, velocity, energy levels), and `user_query_history`.
- **Best Practice:** Stream agent responses via SSE (Server-Sent Events) or WebSockets for real-time interactivity.

## 5. LLM Provider (NVIDIA NIM, OpenAI-Compatible)
- **Skill:** Integrate the LLM through an OpenAI-compatible client (`langchain-openai` with custom `base_url`) pointed at `https://integrate.api.nvidia.com/v1` (NVIDIA Build / NIM).
- **Best Practice:** Read `NVIDIA_API_KEY` and `NIM_MODEL_ID` from environment variables; never hardcode keys or model IDs.
- **Best Practice:** Abstract the provider behind an interface so it can be swapped later (e.g., Kimi K2 ↔ DeepSeek V3/V4 ↔ another vendor) without code changes.

## 6. Physics Simulation Logic & 3D Math
- **Skill:** Translate physical formulas (e.g., Bohr energy levels E_n = -13.6 eV / n², Coulomb's Law, harmonic oscillators, atomic orbital wavefunctions) into real-time 3D vector math using `three.Vector3` or backend SciPy/NumPy computations.
- **Skill:** Implement interactive object controls using `@react-three/drei`'s `PivotControls` or `TransformControls`.
- **Best Practice:** Real-time physics runs in the browser (60 FPS); heavy validation/solver routines run in the Python backend.

## 7. Code Quality & Modularity
- Maintain strict TypeScript types for all 3D scene props and API payloads.
- Modularize 3D scenes into reusable components under `components/canvas/`.
- Modularize agent nodes under `backend/agents/nodes/`.
