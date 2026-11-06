"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Group, Panel, Separator } from "react-resizable-panels";

import { usePhysicsStore } from "@/hooks/usePhysicsState";

const PdfReader = dynamic(() => import("@/components/reader/PdfReader"), {
  ssr: false,
  loading: () => <p className="muted p-6 text-center">Loading reader…</p>,
});
const PhysicsCanvas = dynamic(() => import("@/components/canvas/PhysicsCanvas"), {
  ssr: false,
  loading: () => <p className="muted p-6 text-center">Loading demo…</p>,
});

function BackendStatus() {
  const [status, setStatus] = useState<{ llm_configured: boolean; model_id: string } | null>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    fetch(`${apiUrl}/api/health`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  return (
    <span className="muted tabular hidden text-[11px] sm:inline" title={status?.llm_configured ? "LLM configured" : "Set NVIDIA_API_KEY in backend/.env to enable the tutor"}>
      <span
        className="mr-1 inline-block h-[7px] w-[7px] rounded-full align-middle"
        style={{ background: status?.llm_configured ? "#2e7d32" : "#c77700" }}
      />
      {status ? status.model_id : "backend offline"}
    </span>
  );
}

const SHORTCUTS: [string, string][] = [
  ["J / K", "Next / previous demo point in the text"],
  ["Space", "Play / pause the demo"],
  ["R", "Restart the demo"],
  ["H", "Hold the current demo while scrolling"],
  ["Drag / scroll on demo", "Orbit · zoom (3D) or pan · zoom (2D)"],
];

export default function AppShell() {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target && (/^(input|select|textarea)$/i.test(target.tagName) || target.isContentEditable);
      if (typing) return;
      const store = usePhysicsStore.getState();
      if (event.key === " ") {
        if (target?.tagName === "BUTTON") return;
        event.preventDefault();
        store.togglePause();
      } else if (event.key.toLowerCase() === "r") {
        store.requestRestart();
      } else if (event.key.toLowerCase() === "h") {
        store.toggleHold();
      } else if (event.key === "?") {
        setHelpOpen((open) => !open);
      } else if (event.key === "Escape") {
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visiblePage = usePhysicsStore((s) => s.visiblePage);
  const totalPages = usePhysicsStore((s) => s.totalPages);
  const hold = usePhysicsStore((s) => s.hold);
  const chatOpen = usePhysicsStore((s) => s.chatOpen);
  const toggleHold = usePhysicsStore((s) => s.toggleHold);
  const setChatOpen = usePhysicsStore((s) => s.setChatOpen);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className="flex flex-wrap items-center gap-2.5 px-3.5 py-1.5"
        style={{ borderBottom: "1px solid var(--ink)" }}
      >
        <div className="serif flex items-center text-[15px] font-semibold">
          <span className="brand-dot" />
          Feynman Lectures <span className="muted ml-2 font-normal">Interactive</span>
        </div>
        <span className="muted tabular text-[11px]">
          {visiblePage !== null && totalPages ? `p. ${visiblePage}/${totalPages}` : ""}
        </span>
        <span style={{ flex: 1 }} />
        <BackendStatus />
        <button onClick={toggleHold} aria-pressed={hold} title="Keep the current demo while you scroll (H)">
          Hold demo
        </button>
        <button onClick={() => setChatOpen(!chatOpen)} aria-pressed={chatOpen} title="Show / hide the AI tutor">
          Tutor
        </button>
        <button onClick={() => setHelpOpen((open) => !open)} title="Keyboard shortcuts (?)">
          ?
        </button>
      </header>

      <main className="min-h-0 flex-1">
        <Group orientation="horizontal" className="h-full">
          <Panel defaultSize="46%" minSize="25%">
            <PhysicsCanvas />
          </Panel>
          <Separator className="w-[5px] cursor-col-resize border-l border-[var(--ink)] transition-colors hover:bg-[#eee]" />
          <Panel minSize="25%">
            <PdfReader />
          </Panel>
        </Group>
      </main>

      {helpOpen && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center"
          style={{ background: "rgba(17,17,17,0.18)" }}
          onClick={() => setHelpOpen(false)}
        >
          <div className="app-card max-w-md p-5" onClick={(event) => event.stopPropagation()}>
            <h3 className="serif mb-3 text-lg font-semibold">Shortcuts</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
              {SHORTCUTS.map(([key, description]) => (
                <div key={key} className="contents">
                  <dt className="tabular font-semibold">{key}</dt>
                  <dd className="muted">{description}</dd>
                </div>
              ))}
            </dl>
            <p className="muted mt-3 text-[12px]">
              The diamonds in the left margin of the pages show where a demo changes. Click one to jump
              there.
            </p>
            <button className="mt-4" onClick={() => setHelpOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
