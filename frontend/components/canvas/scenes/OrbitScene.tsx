"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { usePhysicsStore } from "@/hooks/usePhysicsState";
import { SIM } from "@/lib/simPalette";

const TRAIL_POINTS = 140;
const SEMI_MAJOR = 9;

const trailPositions = new Float32Array(TRAIL_POINTS * 3);
const trailGeometry = new THREE.BufferGeometry();
trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
const trailLine = new THREE.Line(
  trailGeometry,
  new THREE.LineBasicMaterial({ color: SIM.primary, transparent: true, opacity: 0.35 })
);

export default function OrbitScene() {
  const massRatio = usePhysicsStore((s) => s.orbit.massRatio);
  const eccentricity = usePhysicsStore((s) => s.orbit.eccentricity);
  const resetKey = usePhysicsStore((s) => s.resetKey);

  const planetRef = useRef<THREE.Mesh>(null);
  const centerRef = useRef<THREE.Mesh>(null);
  const thetaRef = useRef(0);

  useEffect(() => {
    thetaRef.current = 0;
    trailPositions.fill(0);
    trailGeometry.attributes.position.needsUpdate = true;
  }, [resetKey, massRatio, eccentricity]);

  const orbitPath = useMemo(() => {
    const points: [number, number, number][] = [];
    const a = SEMI_MAJOR;
    const b = a * Math.sqrt(1 - eccentricity * eccentricity);
    const c = a * eccentricity;
    for (let i = 0; i <= 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      points.push([Math.cos(t) * a - c, 0, Math.sin(t) * b]);
    }
    return points;
  }, [eccentricity]);

  useFrame((_, delta) => {
    const store = usePhysicsStore.getState();
    if (store.paused) return;
    const dt = Math.min(delta, 0.05);
    const a = SEMI_MAJOR;
    const e = store.orbit.eccentricity;
    const c = a * e;
    const p = a * (1 - e * e);

    const angular = store.orbit.speed * 1.6 * Math.sqrt(1 + store.orbit.massRatio * 0.5);
    thetaRef.current += angular * dt;
    const theta = thetaRef.current;
    const r = p / (1 + e * Math.cos(theta));
    const x = Math.cos(theta) * r - c;
    const z = Math.sin(theta) * r;

    const planet = planetRef.current;
    if (planet) planet.position.set(x, 0, z);

    const center = centerRef.current;
    if (center) {
      const wobble = 1 / (1 + store.orbit.massRatio);
      center.position.set(-x * wobble, 0, -z * wobble);
      center.scale.setScalar(0.7 + Math.min(1.3, store.orbit.massRatio * 0.35));
    }

    const positions = trailPositions;
    for (let i = 0; i < TRAIL_POINTS - 1; i++) {
      positions[i * 3] = positions[(i + 1) * 3];
      positions[i * 3 + 1] = positions[(i + 1) * 3 + 1];
      positions[i * 3 + 2] = positions[(i + 1) * 3 + 2];
    }
    positions[TRAIL_POINTS * 3 - 3] = x;
    positions[TRAIL_POINTS * 3 - 2] = 0;
    positions[TRAIL_POINTS * 3 - 1] = z;
    trailGeometry.attributes.position.needsUpdate = true;
  });

  return (
    <>
      <Line points={orbitPath} color={SIM.primary} lineWidth={1} transparent opacity={0.55} />
      <mesh ref={centerRef}>
        <sphereGeometry args={[0.9, 24, 24]} />
        <meshBasicMaterial color={SIM.accent} wireframe />
      </mesh>
      <mesh ref={planetRef}>
        <sphereGeometry args={[0.32, 20, 20]} />
        <meshBasicMaterial color={SIM.primary} />
      </mesh>
      <primitive object={trailLine} />
      <OrbitControls makeDefault enableDamping minDistance={5} maxDistance={60} />
    </>
  );
}
