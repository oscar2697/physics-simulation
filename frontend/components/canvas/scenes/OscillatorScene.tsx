"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { usePhysicsStore } from "@/hooks/usePhysicsState";
import { SIM } from "@/lib/simPalette";

const rodGeometry = new THREE.BufferGeometry();
rodGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
const rodLine = new THREE.Line(rodGeometry, new THREE.LineBasicMaterial({ color: SIM.primary }));

const PIVOT_Y = 3;

export default function OscillatorScene() {
  const gravity = usePhysicsStore((s) => s.osc.gravity);
  const length = usePhysicsStore((s) => s.osc.length);
  const damping = usePhysicsStore((s) => s.osc.damping);
  const driven = usePhysicsStore((s) => s.osc.driven);
  const resetKey = usePhysicsStore((s) => s.resetKey);

  const bobRef = useRef<THREE.Mesh>(null);
  const stateRef = useRef({ theta: 0.8, omega: 0 });
  const timeRef = useRef(0);

  useEffect(() => {
    stateRef.current = { theta: 0.8, omega: 0 };
    timeRef.current = 0;
  }, [resetKey, length, gravity, damping, driven]);

  useFrame((_, delta) => {
    const store = usePhysicsStore.getState();
    if (store.paused) return;
    const dt = Math.min(delta, 0.05);
    timeRef.current += dt;
    const s = stateRef.current;
    const params = store.osc;

    let alpha = -(params.gravity / params.length) * Math.sin(s.theta) - params.damping * s.omega;
    if (params.driven) {
      alpha += (params.gravity / params.length) * 0.55 * Math.sin(2.2 * timeRef.current);
    }
    s.omega += alpha * dt;
    s.theta += s.omega * dt;

    const x = Math.sin(s.theta) * params.length;
    const y = PIVOT_Y - Math.cos(s.theta) * params.length;

    const bob = bobRef.current;
    if (bob) bob.position.set(x, y, 0);

    const position = rodGeometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = position.array as Float32Array;
    arr[0] = 0;
    arr[1] = PIVOT_Y;
    arr[2] = 0;
    arr[3] = x;
    arr[4] = y;
    arr[5] = 0;
    position.needsUpdate = true;
  });

  const angleTicks = useMemo(() => {
    const ticks: [number, number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      ticks.push([Math.sin(angle) * 3.1, PIVOT_Y - Math.cos(angle) * 3.1, 0]);
    }
    return ticks;
  }, []);

  return (
    <>
      <Line points={angleTicks} color={SIM.primary} lineWidth={1} transparent opacity={0.14} />
      <mesh position={[0, PIVOT_Y, 0]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshBasicMaterial color={SIM.accent} />
      </mesh>
      <mesh ref={bobRef}>
        <sphereGeometry args={[0.34, 20, 20]} />
        <meshBasicMaterial color={SIM.primary} />
      </mesh>
      <primitive object={rodLine} />
      <OrbitControls makeDefault enableDamping minDistance={4} maxDistance={40} />
    </>
  );
}
