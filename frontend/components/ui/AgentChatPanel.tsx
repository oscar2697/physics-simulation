"use client";

import { useEffect, useRef, useState } from "react";

import { buildSceneStatePayload, streamTutor } from "@/hooks/useAgentSocket";
import { electronLive, usePhysicsStore } from "@/hooks/usePhysicsState";
import type { ChatMessage, SceneAdjustment } from "@/types/physics";

function isApplicableAdjustment(adjustment: SceneAdjustment): boolean {
  if (adjustment.target === "energy_level_n") {
    return (
      typeof adjustment.value === "number" &&
      Number.isInteger(adjustment.value) &&
      adjustment.value >= 1 &&
      adjustment.value <= 5
    );
  }
  return (
    ["show_gluons", "show_bosons", "show_electron_cloud"].includes(adjustment.target) &&
    typeof adjustment.value === "boolean"
  );
}

export default function AgentChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [appliedAdjustments, setAppliedAdjustments] = useState<Record<string, number[]>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const setChatOpen = usePhysicsStore((s) => s.setChatOpen);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const send = async () => {
    const query = input.trim();
    if (!query || busy) return;
    setInput("");
    setBusy(true);

    const store = usePhysicsStore.getState();
    const activeCue =
      store.activeCueIndex !== null ? store.cues[store.activeCueIndex] : null;
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: query },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);

    await streamTutor(
      {
        query,
        scene_state: buildSceneStatePayload({
          activeSectionId: activeCue?.id ?? null,
          activeCue: activeCue
            ? {
                title: activeCue.title,
                note: activeCue.note,
                assumptions: activeCue.assumptions || "No scene-level assumptions were provided; treat this as a qualitative illustration.",
                demo: activeCue.demo,
              }
            : null,
          visiblePage: store.visiblePage,
          totalPages: store.totalPages,
          scrollProgress: store.scrollProgress,
          energyLevelN: store.bohr.energyLevelN,
          electronPosition: electronLive.position,
          atomParams: {
            demo: store.currentDemo,
            bohr: store.bohr,
            box: store.box,
            field: store.field,
            orbit: store.orbit,
            oscillator: store.osc,
            engine: store.engineSpec,
            engineSpeed: store.engineSpeed,
            engineDamping: store.engineDamping,
            pending_transition: store.bohr.pendingTransition,
          },
        }),
        document_context: store.documentContext || null,
      },
      {
        onToken: (delta) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m))
          ),
        onPhysics: (physics) => {
          usePhysicsStore.getState().setLastPhysics(physics);
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, physics } : m)));
        },
        onFinal: (payload) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: payload.answer, streaming: false, adjustments: payload.adjustments }
                : m
            )
          );
        },
        onError: (message) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content ? `${m.content}\n\n${message}` : message, streaming: false }
                : m
            )
          ),
      }
    );

    setBusy(false);
  };

  return (
    <div className="tutor-card">
      <div className="tutor-head">
        <span>AI Physics Tutor</span>
        <span className="spacer" />
        <button
          onClick={() => setChatOpen(false)}
          title="Hide the tutor"
          style={{ border: "none", padding: "0 4px", background: "none" }}
        >
          ×
        </button>
      </div>

      <div ref={listRef} className="tutor-body">
        {messages.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>
            Ask about what you are reading — the tutor sees the current section and the live demo state.
          </p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`bubble ${message.role === "user" ? "user" : ""}`}>
              {message.content}
              {message.streaming && <span className="muted">…</span>}
              {message.adjustments && message.adjustments.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {message.adjustments.map((adjustment, i) => {
                    const applied = appliedAdjustments[message.id]?.includes(i) ?? false;
                    return isApplicableAdjustment(adjustment) ? (
                      <button
                        key={i}
                        className="chip"
                        title={adjustment.reason ?? "Apply this tutor suggestion to the scene"}
                        disabled={applied}
                        onClick={() => {
                          usePhysicsStore.getState().applyTutorAdjustment(adjustment);
                          setAppliedAdjustments((current) => ({
                            ...current,
                            [message.id]: [...(current[message.id] ?? []), i],
                          }));
                        }}
                      >
                        {applied ? "Applied" : "Apply"}: {adjustment.target} → {String(adjustment.value)}
                      </button>
                    ) : (
                      <span key={i} className="chip" title={adjustment.reason ?? "This suggestion is not supported by the current MVP."}>
                        Suggestion unavailable: {adjustment.target}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="tutor-input">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Ask the tutor…"
          disabled={busy}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button onClick={() => void send()} disabled={busy || !input.trim()}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}
