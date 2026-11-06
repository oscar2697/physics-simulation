"use client";

import type {
  DemoId,
  SceneStatePayload,
  TutorFinalPayload,
  TutorRequestPayload,
} from "@/types/physics";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface TutorStreamHandlers {
  onToken?: (delta: string) => void;
  onPhysics?: (physics: NonNullable<TutorFinalPayload["physics"]>) => void;
  onFinal?: (payload: TutorFinalPayload) => void;
  onError?: (message: string) => void;
}

interface SseEvent {
  event: string;
  data: string;
}

function parseSseChunk(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return { events, rest };
}

export async function listDocuments(): Promise<{ filename: string; size_bytes: number }[]> {
  const response = await fetch(`${API_URL}/api/documents`);
  if (!response.ok) throw new Error(`Backend error ${response.status}`);
  return response.json();
}

export function documentFileUrl(filename: string): string {
  return `${API_URL}/api/documents/${encodeURIComponent(filename)}/file`;
}

export interface InterpretedCue {
  page: number;
  demo: DemoId;
  title: string;
  note: string;
  params: Record<string, unknown>;
}

export async function interpretDocument(
  filename: string,
  pages: { page: number; text: string }[]
): Promise<InterpretedCue[]> {
  const response = await fetch(`${API_URL}/api/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, pages }),
  });
  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { detail?: unknown };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      // keep the raw body
    }
    throw new Error(detail.slice(0, 300) || `Backend error ${response.status}`);
  }
  const payload = (await response.json()) as { cues: InterpretedCue[] };
  return payload.cues ?? [];
}

export interface InterpretStreamHandlers {
  onProgress?: (phase: string, done: number, total: number) => void;
  onFinal?: (cues: InterpretedCue[], cached: boolean) => void;
  onError?: (message: string) => void;
}

export async function interpretDocumentStream(
  filename: string,
  pages: { page: number; text: string }[],
  handlers: InterpretStreamHandlers
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/interpret/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, pages }),
    });
  } catch {
    handlers.onError?.(
      "Cannot reach the backend. Start it with: cd backend && uvicorn app.main:app --reload"
    );
    return;
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    let message = detail;
    try {
      const parsed = JSON.parse(detail) as { detail?: unknown };
      if (typeof parsed.detail === "string") message = parsed.detail;
    } catch {
      // keep the raw body
    }
    handlers.onError?.(message.slice(0, 300) || `Backend error ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;

    for (const sse of events) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(sse.data);
      } catch {
        continue;
      }
      switch (sse.event) {
        case "progress":
          if (typeof parsed.phase === "string") {
            handlers.onProgress?.(
              parsed.phase,
              typeof parsed.done === "number" ? parsed.done : 0,
              typeof parsed.total === "number" ? parsed.total : 0
            );
          }
          break;
        case "final":
          handlers.onFinal?.(
            (parsed.cues as InterpretedCue[]) ?? [],
            parsed.cached === true
          );
          break;
        case "error":
          handlers.onError?.(String(parsed.error ?? "Unknown backend error"));
          break;
      }
    }
  }
}

export async function streamTutor(
  payload: TutorRequestPayload,
  handlers: TutorStreamHandlers
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/tutor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    handlers.onError?.(
      "Cannot reach the backend. Start it with: cd backend && uvicorn app.main:app --reload"
    );
    return;
  }

  if (!response.ok || !response.body) {
    handlers.onError?.(`Backend error ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;

    for (const sse of events) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(sse.data);
      } catch {
        continue;
      }
      switch (sse.event) {
        case "token":
          if (typeof parsed.delta === "string") handlers.onToken?.(parsed.delta);
          break;
        case "physics":
          handlers.onPhysics?.(parsed as NonNullable<TutorFinalPayload["physics"]>);
          break;
        case "final":
          handlers.onFinal?.(parsed as unknown as TutorFinalPayload);
          break;
        case "error":
          handlers.onError?.(String(parsed.error ?? "Unknown backend error"));
          break;
      }
    }
  }
}

export function buildSceneStatePayload(state: {
  activeSectionId: string | null;
  visiblePage: number | null;
  totalPages: number | null;
  scrollProgress: number | null;
  energyLevelN: number;
  electronPosition: [number, number, number];
  atomParams: Record<string, unknown>;
}): SceneStatePayload {
  return {
    active_section: state.activeSectionId,
    visible_page: state.visiblePage,
    total_pages: state.totalPages,
    scroll_progress: state.scrollProgress,
    energy_level_n: state.energyLevelN,
    electron_position: state.electronPosition,
    atom_params: state.atomParams,
  };
}
