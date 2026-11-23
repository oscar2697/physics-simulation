"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";

import AgentChatPanel from "@/components/ui/AgentChatPanel";
import StageControls from "@/components/ui/StageControls";
import AtomsBoxScene from "@/components/canvas/scenes/AtomsBoxScene";
import BohrAtomScene from "@/components/canvas/scenes/BohrAtomScene";
import EngineScene from "@/components/canvas/scenes/EngineScene";
import FieldScene from "@/components/canvas/scenes/FieldScene";
import OrbitScene from "@/components/canvas/scenes/OrbitScene";
import OscillatorScene from "@/components/canvas/scenes/OscillatorScene";
import { usePhysicsStore } from "@/hooks/usePhysicsState";

export default function PhysicsCanvas() {
  const currentDemo = usePhysicsStore((s) => s.currentDemo);
  const resetKey = usePhysicsStore((s) => s.resetKey);
  const chatOpen = usePhysicsStore((s) => s.chatOpen);
  const demoTitle = usePhysicsStore((s) => s.demoTitle);
  const demoNote = usePhysicsStore((s) => s.demoNote);
  const demoAssumptions = usePhysicsStore((s) => s.demoAssumptions);
  const engineSpec = usePhysicsStore((s) => s.engineSpec);
  const engineKey = engineSpec ? JSON.stringify(engineSpec) : "none";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="stage-head">
        <div className="demo-title">{demoTitle}</div>
        <div className="demo-note">{demoNote}</div>
        <div className="muted text-[11px]">
          Model assumptions: {demoAssumptions}
        </div>
      </div>

      <div className="canvas-grid relative min-h-0 flex-1 overflow-hidden">
        <Canvas
          key={currentDemo}
          camera={{ position: [0, 10, 30], fov: 50 }}
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true }}
        >
          <Suspense fallback={null}>
            {currentDemo === "bohr" ? (
              <BohrAtomScene key={resetKey} />
            ) : currentDemo === "atoms-box" ? (
              <AtomsBoxScene key={resetKey} />
            ) : currentDemo === "field" ? (
              <FieldScene key={resetKey} />
            ) : currentDemo === "orbit" ? (
              <OrbitScene key={resetKey} />
            ) : currentDemo === "engine" && engineSpec ? (
              <EngineScene key={`${resetKey}-${engineKey}`} spec={engineSpec} />
            ) : (
              <OscillatorScene key={resetKey} />
            )}
          </Suspense>
        </Canvas>
        {chatOpen && <AgentChatPanel />}
      </div>

      <StageControls />
    </div>
  );
}
