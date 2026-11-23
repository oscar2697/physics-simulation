# Project Context: Interactive 3D Physics & AI Tutor Platform

## 1. Executive Summary
This project is an interactive, web-based educational platform inspired by the "Feynman Lectures with AI Demos" concept. It bridges theoretical physics literature — primarily **The Feynman Lectures on Physics** (PDF) — with real-time interactive 3D physics simulations powered by Three.js and an intelligent AI Physics Tutor. As the user scrolls through the lecture, the 3D scene **progressively evolves** to mirror the concepts being read.

## 2. Core Objectives
- **Split-Screen Interactive Layout:** Side-by-side view featuring a document reader on the left and a 3D Canvas on the right.
- **3D Physical Manipulations:** Allow users to directly grab, move, and manipulate physical entities (e.g., atoms, charge particles, quantum potentials) in 3D space.
- **Scroll-Driven Progressive Scene Evolution:** The 3D scene changes and acts according to the paragraph being read. Example: when the text describes the atom as composed of protons, neutrons and electrons, the scene shows exactly that; when scrolling further introduces gluons, bosons, etc., the atom visually "grows" and gains new interactions.
- **Bi-directional State Synchronization:** Changes in 3D parameters update theoretical metrics in real time; reading (scrolling to) specific sections updates the 3D scene state.
- **Context-Aware AI Tutor:** An intelligent backend agent that understands both the textbook/paper context and the current live 3D physics state to provide precise explanations.

## 3. Key Features
- **Interactive PDF Reader:** Renders PDF documents (react-pdf / pdf.js) with scroll-position tracking and section sync anchors. Markdown + KaTeX ($KaTeX$) rendering supported as a secondary format.
- **React Three Fiber (R3F) Canvas:** High-performance 3D scene rendering with mouse/touch raycasting and orbit/transform controls.
- **Graph-Based Agentic Backend:** Python FastAPI server hosting a LangGraph agent workflow capable of state evaluation, physical reasoning, and contextual QA.

## 4. Target Stack
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, React Three Fiber (`@react-three/fiber`), `@react-three/drei`, Three.js, `react-pdf` (pdf.js), KaTeX / Markdown parser.
- **Backend:** Python 3.11+, FastAPI, LangGraph / LangChain (OpenAI-compatible client pointed at NVIDIA NIM), NumPy, SciPy, PyTorch (optional for complex physics/surrogates).
- **LLM Provider:** NVIDIA Build (NIM) API — OpenAI-compatible endpoint `https://integrate.api.nvidia.com/v1`. Model configurable via environment variables (`NVIDIA_API_KEY`, `NIM_MODEL_ID`), e.g. Kimi K2 or DeepSeek V3/V4. The provider is abstracted so it can be swapped later without code changes.
- **Communication:** WebSockets or Server-Sent Events (SSE) for low-latency streaming of agent responses and 3D state sync.

## 5. MVP Scope (v1) — Agreed Decisions
- **Full flow MVP:** Reader (PDF) + interactive Stage (demo canvas) + context-aware AI Tutor, all working together.
- **Simulations:** the five named 3D demos plus a generated scalar-potential scene. The generated scene can accumulate particles while the same system is being discussed and replace the scene when the paper changes topic. Labeled links and vertices can illustrate interactions; they are diagrammatic and do not calculate pairwise forces or quantum amplitudes. This bounded visualization model is not a general-purpose solver; its assumptions and omitted physics must be visible.
- **Reader format:** users can open local PDFs or choose served documents. Clearly identified "Atoms in Motion" chapter-one files and explicitly named Bohr papers get hand-authored keyword cues; other physics PDFs are interpreted by the AI, which generates page-anchored scene cues and model assumptions (`POST /api/interpret/stream`). Text extraction and interpretation cover up to 120 pages; scanned PDFs without an extractable text layer are not OCR'd.
- **Layout & style:** Stage (demo) on the left, reader on the right. Aged-book print aesthetic: cream paper (#f8f3e5), warm ink (#2b2620), pen-blue accent (#35618f), serif prose, ink wireframes, dotted graph-paper canvas.
- **UI language:** English controls and scene descriptions; the tutor answers in the language of the user's question.
- **Compute split:** Real-time physics runs in the browser (JS, 60 FPS); heavy calculations (SciPy/NumPy validation, solver routines) and LLM interpretation run in the Python backend.
- **Dev environment:** Local development only (`npm run dev` + `uvicorn`); no Docker for now.
- **Tutor controls:** answer questions using the current page and scene, then offer supported scene changes for explicit user acceptance.
- **MVP limits:** generated scenes currently support scalar potentials in two spatial coordinates with at most eight particles. Other systems use fixed demos; unsupported dynamics are represented as diagrams and disclosed as assumptions rather than presented as solved physics.
- **Roadmap:** broaden the generated-scene vocabulary and physical interactions, improve scanned-PDF support, and add automated frontend/backend coverage.
