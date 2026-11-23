# Interactive Physics Reader

Next.js frontend for reading physics papers beside a scroll-synchronized 3D stage and AI tutor.

## Run locally

1. From `frontend/`, install the locked dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
3. Start the backend as described in `../backend/`.
4. Run `npm run dev` and open `http://localhost:3000`.

PDFs can be opened from disk or selected from the backend's `content/lectures/` folder. Unknown
documents are interpreted by the backend. Interpretation uses extractable PDF text and is limited
to the first 120 pages; scanned pages without a text layer are not OCR'd.

## Project checks

- `npm run lint` runs ESLint.
- `npm run build` creates a production build.

The stage supports authored cue maps and AI-generated cue maps. Generated scalar-potential scenes
are intentionally bounded to two spatial coordinates and up to eight particles. Labeled
interaction links are diagrammatic, not dynamically solved. Each AI cue shows its assumptions; this
visualization is not a general-purpose physics solver.
