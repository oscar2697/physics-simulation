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
- **Simulations:** five 3D demos — Bohr atom model (energy levels, transitions), "atoms in a box" (gas/liquid, kinetic theory), a scalar field demo (traveling wave / Mexican-hat potential V(φ) = λ(|φ|²−v²)²), a two-body orbit (Kepler, gravity), and a pendulum (harmonic motion, damping, driving).
- **Reader format:** PDF-only; the demo is driven by declarative **cue maps**. Known documents (Feynman Vol. I) get hand-authored keyword cues; **any other physics PDF is interpreted by the AI**: the backend reads the extracted text and generates the cue map (`POST /api/interpret`) — this is the hybrid strategy.
- **Layout & style:** Stage (demo) on the left, reader on the right. Aged-book print aesthetic: cream paper (#f8f3e5), warm ink (#2b2620), pen-blue accent (#35618f), serif prose, ink wireframes, dotted graph-paper canvas.
- **UI language:** English (reader content and tutor explanations in English).
- **Compute split:** Real-time physics runs in the browser (JS, 60 FPS); heavy calculations (SciPy/NumPy validation, solver routines) and LLM interpretation run in the Python backend.
- **Dev environment:** Local development only (`npm run dev` + `uvicorn`); no Docker for now.
- **Roadmap:** more demos per chapter (orbital mechanics, waves, E&M), richer cue vocabulary for the LLM interpreter, pre-render caching of interpreted cues.
