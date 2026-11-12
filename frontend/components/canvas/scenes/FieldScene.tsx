"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { usePhysicsStore } from "@/hooks/usePhysicsState";
import { SIM } from "@/lib/simPalette";

const INK = SIM.primary;
const GRID_POINTS = 33;
const GRID_SPACING = 0.5;
const GRID_SIZE = (GRID_POINTS - 1) * GRID_SPACING;
const HAT_POINTS = 41;
const HAT_RANGE = 2.2;
const HAT_Z_SCALE = 0.16;
const BALL_COUNT = 3;

const wavePositions = new Float32Array(GRID_POINTS * GRID_POINTS * 3);
const waveGeometry = new THREE.BufferGeometry();
waveGeometry.setAttribute("position", new THREE.BufferAttribute(wavePositions, 3));

interface HatBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  jiggle: number;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export default function FieldScene() {
  const mode = usePhysicsStore((s) => s.field.mode);
  const amplitude = usePhysicsStore((s) => s.field.amplitude);
  const frequency = usePhysicsStore((s) => s.field.frequency);
  const coupling = usePhysicsStore((s) => s.field.coupling);
  const resetKey = usePhysicsStore((s) => s.resetKey);

  const pointsRef = useRef<THREE.Points>(null);
  const ballsRef = useRef<(THREE.Mesh | null)[]>([]);
  const hatBallsRef = useRef<HatBall[]>([]);
  const timeRef = useRef(0);

  // Valley radius follows the paper's vacuum value: amplitude ~= phi_0 renders
  // as v = 1 (the canonical hat); clamped so the shape stays readable.
  const vev = Math.min(1.8, Math.max(0.5, amplitude / 3.2));

  const hatGeometry = useMemo(() => {
    const positions = new Float32Array(HAT_POINTS * HAT_POINTS * 3);
    let i = 0;
    const v2 = vev * vev;
    for (let yi = 0; yi < HAT_POINTS; yi++) {
      const y = -HAT_RANGE + (2 * HAT_RANGE * yi) / (HAT_POINTS - 1);
      for (let xi = 0; xi < HAT_POINTS; xi++) {
        const x = -HAT_RANGE + (2 * HAT_RANGE * xi) / (HAT_POINTS - 1);
        const r2 = x * x + y * y;
        positions[i++] = x;
        positions[i++] = y;
        positions[i++] = (r2 - v2) * (r2 - v2) * HAT_Z_SCALE;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [vev]);

  useEffect(() => () => hatGeometry.dispose(), [hatGeometry]);

  useEffect(() => {
    if (mode !== "mexican-hat") return;
    const rand = seeded(12345 + resetKey * 7919);
    hatBallsRef.current = Array.from({ length: BALL_COUNT }, () => ({
      x: (rand() - 0.5) * 0.5,
      y: (rand() - 0.5) * 0.5,
      vx: (rand() - 0.5) * 0.4,
      vy: (rand() - 0.5) * 0.4,
      jiggle: rand() * Math.PI * 2,
    }));
  }, [mode, resetKey]);

  useFrame((_, delta) => {
    const store = usePhysicsStore.getState();
    if (store.paused) return;
    const dt = Math.min(delta, 0.05);
    timeRef.current += dt;

    if (mode === "wave") {
      const points = pointsRef.current;
      if (!points) return;
      const position = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = position.array as Float32Array;
      const omega = timeRef.current * frequency * 2.2 * amplitude;
      let i = 0;
      for (let yi = 0; yi < GRID_POINTS; yi++) {
        const y = -GRID_SIZE / 2 + yi * GRID_SPACING;
        for (let xi = 0; xi < GRID_POINTS; xi++) {
          const x = -GRID_SIZE / 2 + xi * GRID_SPACING;
          arr[i++] = x;
          arr[i++] = y;
          arr[i++] = amplitude * Math.sin(x * 1.1 - omega) * Math.cos(y * 0.9 - omega * 0.6);
        }
      }
      position.needsUpdate = true;
    } else {
      const lambda = coupling;
      const v2 = vev * vev;
      const balls = hatBallsRef.current;
      balls.forEach((ball, index) => {
        const r2 = ball.x * ball.x + ball.y * ball.y;
        const grad = 4 * (r2 - v2);
        ball.vx += -grad * ball.x * lambda * dt * 2;
        ball.vy += -grad * ball.y * lambda * dt * 2;
        ball.vx *= 0.985;
        ball.vy *= 0.985;
        ball.jiggle += dt * frequency * 3;
        const jitter = 0.25 * frequency * lambda * 0.3;
        ball.vx += Math.sin(ball.jiggle + index) * jitter * dt;
        ball.vy += Math.cos(ball.jiggle * 1.3 + index) * jitter * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        const mesh = ballsRef.current[index];
        if (mesh) {
          const rr2 = ball.x * ball.x + ball.y * ball.y;
          mesh.position.set(
            ball.x,
            ball.y,
            (rr2 - v2) * (rr2 - v2) * HAT_Z_SCALE + 0.15
          );
        }
      });
    }
  });

  return (
    <>
      {mode === "wave" ? (
        <points ref={pointsRef} geometry={waveGeometry} rotation-x={-Math.PI / 2.1}>
          <pointsMaterial color={INK} size={0.09} transparent opacity={0.85} sizeAttenuation />
        </points>
      ) : (
        <group rotation-x={-Math.PI / 2.1}>
          <mesh geometry={hatGeometry}>
            <meshBasicMaterial color={INK} wireframe transparent opacity={0.55} />
          </mesh>
          {/* Vacuum ring: the valley r = v where the field settles (the VEV). */}
          <mesh position={[0, 0, 0.03]}>
            <torusGeometry args={[vev, 0.028, 10, 72]} />
            <meshBasicMaterial color={SIM.accent} transparent opacity={0.9} />
          </mesh>
          {Array.from({ length: BALL_COUNT }, (_, i) => (
            <mesh
              key={i}
              ref={(m) => {
                ballsRef.current[i] = m;
              }}
            >
              <sphereGeometry args={[0.11, 14, 14]} />
              <meshBasicMaterial color={SIM.accent} />
            </mesh>
          ))}
        </group>
      )}
      <OrbitControls makeDefault enableDamping minDistance={5} maxDistance={60} />
    </>
  );
}
