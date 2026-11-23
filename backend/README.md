# Physics tutor backend

FastAPI service for PDF listing, AI cue generation and the context-aware tutor.

## Run locally

From `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Add a working NVIDIA NIM key and model ID to `.env`, then start the service:

```powershell
uvicorn app.main:app --reload
```

The API listens on port 8000 by default. Put server-listed PDFs in `../content/lectures/`;
users can also open local PDFs directly in the frontend. The AI interpreter accepts up to 120
pages and 4,000 extracted characters per page. PDFs need a text layer; OCR is not included.

The deterministic physics evaluator currently validates Bohr hydrogen levels and emission
transitions. Other simulations are browser-side visual models. Generated scalar-potential scenes
are limited to two spatial coordinates and eight particles; interaction links and vertices are
diagrammatic and do not calculate pairwise forces or quantum amplitudes.
