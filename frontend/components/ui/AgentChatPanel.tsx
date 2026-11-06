"use client";

import { useEffect, useRef, useState } from "react";

import { buildSceneStatePayload, streamTutor } from "@/hooks/useAgentSocket";
import { electronLive, usePhysicsStore } from "@/hooks/usePhysicsState";
import type { ChatMessage } from "@/types/physics";

export default function AgentChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
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
          visiblePage: store.visiblePage,
          totalPages: store.totalPages,
          scrollProgress: store.scrollProgress,
          energyLevelN: store.bohr.energyLevelN,
          electronPosition: electronLive.position,
          atomParams: { demo: store.currentDemo, bohr: store.bohr, box: store.box },
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
                <div>
                  {message.adjustments.map((adjustment, i) => (
                    <span key={i} className="chip" title={adjustment.reason ?? undefined}>
                      {adjustment.target} → {String(adjustment.value)}
                    </span>
                  ))}
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
