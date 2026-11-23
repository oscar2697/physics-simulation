# Feynman Lectures Interactive

An educational physics reader for students and physicists. Read a physics PDF beside a 3D stage;
the scene follows AI-generated or authored cue points as you scroll. The tutor answers questions
using the page text and live scene, and offers supported changes for explicit user acceptance.

## Start locally

Requirements: Node.js, Python 3.11+, and a working NVIDIA NIM API key/model for AI interpretation
and tutoring.

1. Configure the backend in PowerShell:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   Copy-Item .env.example .env
   ```

   Add `NVIDIA_API_KEY` and a live, enabled `NIM_MODEL_ID` to `backend/.env`.

2. In a second terminal, configure the frontend:

   ```powershell
   cd frontend
   npm ci
   Copy-Item .env.example .env.local
   npm run dev
   ```

3. In the backend terminal, start the API:

   ```powershell
   uvicorn app.main:app --reload
   ```

   Open `http://localhost:3000`. Choose a server PDF from `content/lectures/` or open one from
   your computer.

## MVP boundaries

- AI interpretation uses extractable PDF text, up to 120 pages and 4,000 characters per page.
  Scanned pages without a text layer are not OCR'd.
- Generated scenes currently show a two-dimensional scalar potential with up to eight particles.
  Labeled interaction links can animate as diagram edges; they do not calculate pairwise forces or
  quantum amplitudes. Cue assumptions identify omitted physics and qualitative approximations.
- Deterministic backend calculations currently cover Bohr hydrogen levels and emission transitions.
- The service is configured for local development; deployment and user accounts are outside the MVP.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system flow and [CONTEXT.md](CONTEXT.md) for product
scope and current limitations. Component-specific setup is in [frontend/README.md](frontend/README.md)
and [backend/README.md](backend/README.md).
