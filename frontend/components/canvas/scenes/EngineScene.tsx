"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { usePhysicsStore } from "@/hooks/usePhysicsState";
import { SIM } from "@/lib/simPalette";
import { compileExpr } from "@/lib/expr";
import type { EngineSceneSpec } from "@/types/physics";

const GRID = 48;
const MAX_PARTICLES = 8;
const TRAIL = 90;

// Module-level mutable buffers (same lint-safe pattern as the other scenes:
// hook-created values are never mutated; only refs and module singletons are).
const trailPositions = new Float32Array(MAX_PARTICLES * TRAIL * 3);
const trailGeometry = new THREE.BufferGeometry();
trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));

interface LiveParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  label: string;
  kind: "scalar" | "fermion" | "boson";
}

function sanitizeSpec(spec: EngineSceneSpec): {
  fn: (x: number, y: number) => number;
  range: number;
  zScale: number;
  inits: { p: [number, number]; v: [number, number]; label: string; kind: "scalar" | "fermion" | "boson" }[];
  interactions: NonNullable<EngineSceneSpec["interactions"]>;
  damping: number;
  speed: number;
} {
  let fn: (x: number, y: number) => number = () => 0;
  try {
    const compiled = compileExpr(spec.surface.expr);
    // Probe once: reject expressions that blow up on ordinary input.
    const probe = compiled({ x: 0.5, y: -0.5 });
    fn = Number.isFinite(probe) ? (x, y) => compiled({ x, y }) : () => 0;
  } catch {
    fn = () => 0;
  }
  const range = Math.min(10, Math.max(0.5, spec.surface.range ?? 2.2));
  const zScale = Math.min(2, Math.max(0.02, spec.surface.z ?? 0.16));
  const inits = spec.particles.slice(0, MAX_PARTICLES).map((pt) => ({
    p: [
      Math.min(range * 1.5, Math.max(-range * 1.5, pt.p[0] ?? 0)),
      Math.min(range * 1.5, Math.max(-range * 1.5, pt.p[1] ?? 0)),
    ] as [number, number],
    v: [pt.v?.[0] ?? 0, pt.v?.[1] ?? 0] as [number, number],
    label: pt.label?.slice(0, 40) || "particle",
    kind: pt.kind ?? "scalar",
  }));
  return {
    fn,
    range,
    zScale,
    inits,
    interactions: (spec.interactions ?? []).slice(0, 16),
    damping: Math.min(1, Math.max(0, spec.sim?.damping ?? 0.02)),
    speed: Math.min(3, Math.max(0.1, spec.sim?.speed ?? 1)),
  };
}

export default function EngineScene({ spec }: { spec: EngineSceneSpec }) {
  const resetKey = usePhysicsStore((s) => s.resetKey);
  const camera = useThree((s) => s.camera);

  const live = useMemo(() => sanitizeSpec(spec), [spec]);
  const partsRef = useRef<LiveParticle[]>([]);
  const trailHeadRef = useRef<number[]>([]);
  const frameRef = useRef(0);
  const meshesRef = useRef<(THREE.Mesh | null)[]>([]);
  const vertexMeshesRef = useRef<(THREE.Mesh | null)[]>([]);
  const labelIndices = useMemo(
    () => new Map(live.inits.map((particle, index) => [particle.label, index] as const)),
    [live.inits]
  );
  const interactionGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(live.interactions.length * 6);
    const attribute = new THREE.BufferAttribute(positions, 3);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", attribute);
    return geometry;
  }, [live.interactions.length]);

  useEffect(() => {
    camera.position.set(0, live.range * 2.4, live.range * 3.4);
    camera.lookAt(0, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    partsRef.current = live.inits.map((init) => ({
      x: init.p[0],
      y: init.p[1],
      vx: init.v[0],
      vy: init.v[1],
      label: init.label,
      kind: init.kind,
    }));
    trailHeadRef.current = live.inits.map(() => 0);
    frameRef.current = 0;
    trailPositions.fill(0);
    trailGeometry.getAttribute("position").needsUpdate = true;
  }, [live, resetKey]);

  const surfaceGeometry = useMemo(() => {
    const positions = new Float32Array(GRID * GRID * 3);
    let i = 0;
    for (let gy = 0; gy < GRID; gy++) {
      const y = -live.range + (2 * live.range * gy) / (GRID - 1);
      for (let gx = 0; gx < GRID; gx++) {
        const x = -live.range + (2 * live.range * gx) / (GRID - 1);
        let z = 0;
        try {
          const v = live.fn(x, y);
          z = Number.isFinite(v) ? v * live.zScale : 0;
        } catch {
          z = 0;
        }
        positions[i++] = x;
        positions[i++] = y;
        positions[i++] = Math.min(8, Math.max(-8, z));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [live]);

  useEffect(() => () => surfaceGeometry.dispose(), [surfaceGeometry]);
  useEffect(() => () => interactionGeometry.dispose(), [interactionGeometry]);

  useFrame((_, delta) => {
    const store = usePhysicsStore.getState();
    if (store.paused) return;
    const dt = Math.min(delta, 0.05) * store.engineSpeed;
    const damp = store.engineDamping;
    const eps = 0.002;
    const parts = partsRef.current;
    const R = live.range;
    frameRef.current += 1;
    const record = frameRef.current % 2 === 0;

    for (let k = 0; k < parts.length; k++) {
      const pt = parts[k];
      if (!pt) continue;
      let gx = 0;
      let gy = 0;
      try {
        const vxp = live.fn(pt.x + eps, pt.y);
        const vxm = live.fn(pt.x - eps, pt.y);
        const vyp = live.fn(pt.x, pt.y + eps);
        const vym = live.fn(pt.x, pt.y - eps);
        gx = (Number.isFinite(vxp) && Number.isFinite(vxm) ? (vxp - vxm) / (2 * eps) : 0) * live.zScale;
        gy = (Number.isFinite(vyp) && Number.isFinite(vym) ? (vyp - vym) / (2 * eps) : 0) * live.zScale;
      } catch {
        gx = 0;
        gy = 0;
      }
      pt.vx = (pt.vx - gx * dt) * (1 - damp * dt);
      pt.vy = (pt.vy - gy * dt) * (1 - damp * dt);
      const sp = Math.hypot(pt.vx, pt.vy);
      if (sp > 10) {
        pt.vx = (pt.vx / sp) * 10;
        pt.vy = (pt.vy / sp) * 10;
      }
      pt.x = Math.min(R * 1.6, Math.max(-R * 1.6, pt.x + pt.vx * dt));
      pt.y = Math.min(R * 1.6, Math.max(-R * 1.6, pt.y + pt.vy * dt));

      const mesh = meshesRef.current[k];
      if (mesh) {
        let z = 0;
        try {
          const v = live.fn(pt.x, pt.y);
          z = Number.isFinite(v) ? v * live.zScale : 0;
        } catch {
          z = 0;
        }
        mesh.position.set(pt.x, pt.y, Math.min(8, Math.max(-8, z)) + 0.12);
      }
      if (record) {
        const head = (trailHeadRef.current[k] ?? 0) % TRAIL;
        trailHeadRef.current[k] = head + 1;
        const o = (k * TRAIL + head) * 3;
        trailPositions[o] = pt.x;
        trailPositions[o + 1] = pt.y;
        trailPositions[o + 2] = 0.06;
      }
    }
    if (record) trailGeometry.getAttribute("position").needsUpdate = true;

    const linkPositions = interactionGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < live.interactions.length; i++) {
      const interaction = live.interactions[i];
      if (!interaction) continue;
      const fromIndex = labelIndices.get(interaction.from);
      const toIndex = labelIndices.get(interaction.to);
      const from = fromIndex === undefined ? undefined : parts[fromIndex];
      const to = toIndex === undefined ? undefined : parts[toIndex];
      if (!from || !to) continue;
      let fromZ = 0.12;
      let toZ = 0.12;
      try {
        fromZ += live.fn(from.x, from.y) * live.zScale;
        toZ += live.fn(to.x, to.y) * live.zScale;
      } catch {
        // Keep diagram vertices on the baseline if the generated surface is undefined here.
      }
      const clampedFromZ = Math.min(8, Math.max(-8, fromZ));
      const clampedToZ = Math.min(8, Math.max(-8, toZ));
      linkPositions.setXYZ(i * 2, from.x, from.y, clampedFromZ);
      linkPositions.setXYZ(i * 2 + 1, to.x, to.y, clampedToZ);
      vertexMeshesRef.current[i]?.position.set(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2,
        (clampedFromZ + clampedToZ) / 2
      );
    }
    if (live.interactions.length > 0) linkPositions.needsUpdate = true;
  });

  return (
    <group rotation-x={-Math.PI / 2.1}>
      <points geometry={surfaceGeometry}>
        <pointsMaterial color={SIM.primary} size={0.07} transparent opacity={0.8} sizeAttenuation />
      </points>
      <points geometry={trailGeometry}>
        <pointsMaterial color={SIM.accent} size={0.05} transparent opacity={0.55} sizeAttenuation />
      </points>
      {live.interactions.length > 0 && (
        <lineSegments geometry={interactionGeometry}>
          <lineBasicMaterial color={SIM.accent} transparent opacity={0.8} />
        </lineSegments>
      )}
      {live.interactions.map((interaction, i) => (
        <mesh
          key={`vertex-${interaction.from}-${interaction.to}-${i}`}
          ref={(mesh) => {
            vertexMeshesRef.current[i] = mesh;
          }}
        >
          <sphereGeometry args={[0.07, 10, 10]} />
          <meshBasicMaterial color={SIM.accent} />
          {interaction.label && (
            <Html position={[0, 0.16, 0]} center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
              <span style={{ background: "rgba(255,255,255,0.85)", color: "#111", fontSize: 10, padding: "1px 3px" }}>
                {interaction.label}
              </span>
            </Html>
          )}
        </mesh>
      ))}
      {live.inits.map((particle, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshesRef.current[i] = m;
          }}
        >
          {particle.kind === "boson" ? (
            <octahedronGeometry args={[0.16, 0]} />
          ) : particle.kind === "fermion" ? (
            <sphereGeometry args={[0.12, 14, 14]} />
          ) : (
            <icosahedronGeometry args={[0.14, 0]} />
          )}
          <meshBasicMaterial color={particle.kind === "boson" ? SIM.accent : SIM.primary} />
          <Html position={[0, 0.25, 0]} center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
            <span style={{ background: "rgba(255,255,255,0.85)", color: "#111", fontSize: 11, padding: "1px 4px" }}>
              {particle.label}
            </span>
          </Html>
        </mesh>
      ))}
      <OrbitControls makeDefault enableDamping minDistance={3} maxDistance={80} />
    </group>
  );
}
