"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import { boxLive, usePhysicsStore } from "@/hooks/usePhysicsState";
import { SIM } from "@/lib/simPalette";

const INK = SIM.primary;
const MAX_ATOMS = 240;
const CUBE = 16;
const HALF = CUBE / 2;
const BASE_SPEED = 4.5;

interface Atom {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  escaped: boolean;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomInBand(rand: () => number, spread: number): number {
  return (rand() - 0.5) * spread;
}

export default function AtomsBoxScene() {
  const atomCount = usePhysicsStore((s) => s.box.atomCount);
  const phase = usePhysicsStore((s) => s.box.phase);
  const temperature = usePhysicsStore((s) => s.box.temperature);
  const resetKey = usePhysicsStore((s) => s.resetKey);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const atomsRef = useRef<Atom[]>([]);
  const pressureRef = useRef(0);

  const edgesGeometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(CUBE, CUBE, CUBE)),
    []
  );

  useEffect(() => () => edgesGeometry.dispose(), [edgesGeometry]);

  useEffect(() => {
    const rand = seeded(12345 + resetKey * 7919);
    const spread = phase === "liquid" ? CUBE * 0.42 : CUBE - 1.5;
    const atoms: Atom[] = [];
    for (let i = 0; i < atomCount; i++) {
      const speed =
        BASE_SPEED * (phase === "liquid" ? 0.55 : 1) * temperature * (0.6 + rand() * 0.8);
      const theta = rand() * Math.PI * 2;
      const z = rand() * 2 - 1;
      const planar = Math.sqrt(1 - z * z);
      atoms.push({
        x: randomInBand(rand, spread),
        y: randomInBand(rand, spread),
        z: randomInBand(rand, spread),
        vx: Math.cos(theta) * planar * speed,
        vy: Math.sin(theta) * planar * speed,
        vz: z * speed,
        escaped: false,
      });
    }
    atomsRef.current = atoms;
    pressureRef.current = 0;
  }, [atomCount, phase, temperature, resetKey]);

  useFrame((_, delta) => {
    const store = usePhysicsStore.getState();
    if (store.paused) return;
    const mesh = meshRef.current;
    const atoms = atomsRef.current;
    if (!mesh || atoms.length === 0) return;

    const dt = Math.min(delta, 0.05);
    const params = store.box;
    const target = BASE_SPEED * params.temperature;

    let comX = 0;
    let comY = 0;
    let comZ = 0;
    for (const atom of atoms) {
      comX += atom.x;
      comY += atom.y;
      comZ += atom.z;
    }
    comX /= atoms.length;
    comY /= atoms.length;
    comZ /= atoms.length;

    let avgSpeed = 0;
    for (const atom of atoms) avgSpeed += Math.hypot(atom.vx, atom.vy, atom.vz);
    avgSpeed /= atoms.length;
    const thermostat = avgSpeed > 1e-4 ? Math.pow(target / avgSpeed, 0.08) : 1;

    let hits = 0;
    const matrix = new THREE.Matrix4();

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      atom.vx *= thermostat;
      atom.vy *= thermostat;
      atom.vz *= thermostat;

      if (params.phase === "liquid") {
        atom.vx += (comX - atom.x) * 2.2 * dt;
        atom.vy += (comY - atom.y) * 2.2 * dt;
        atom.vz += (comZ - atom.z) * 2.2 * dt;
        atom.vx *= 0.992;
        atom.vy *= 0.992;
        atom.vz *= 0.992;
      }

      atom.x += atom.vx * dt;
      atom.y += atom.vy * dt;
      atom.z += atom.vz * dt;

      if (!atom.escaped) {
        if (atom.x < -HALF) {
          atom.x = -HALF;
          atom.vx = Math.abs(atom.vx);
          hits++;
        } else if (atom.x > HALF) {
          atom.x = HALF;
          atom.vx = -Math.abs(atom.vx);
          hits++;
        }
        if (atom.z < -HALF) {
          atom.z = -HALF;
          atom.vz = Math.abs(atom.vz);
          hits++;
        } else if (atom.z > HALF) {
          atom.z = HALF;
          atom.vz = -Math.abs(atom.vz);
          hits++;
        }
        if (atom.y < -HALF) {
          atom.y = -HALF;
          atom.vy = Math.abs(atom.vy);
          hits++;
        } else if (atom.y > HALF) {
          if (params.escaping && atom.vy > target * 0.9 && atom.y > HALF * 0.55) {
            atom.escaped = true;
          } else {
            atom.y = HALF;
            atom.vy = -Math.abs(atom.vy);
            hits++;
          }
        }
      } else if (atom.y > HALF + CUBE * 0.75) {
        atom.escaped = false;
        atom.x = randomInBand(Math.random, CUBE - 1.5);
        atom.y = -HALF + Math.random() * CUBE * 0.3;
        atom.z = randomInBand(Math.random, CUBE - 1.5);
        const theta = Math.random() * Math.PI * 2;
        const z = Math.random() * 2 - 1;
        const planar = Math.sqrt(1 - z * z);
        const speed = target * (0.6 + Math.random() * 0.8);
        atom.vx = Math.cos(theta) * planar * speed;
        atom.vy = Math.sin(theta) * planar * speed;
        atom.vz = z * speed;
      }

      matrix.makeTranslation(atom.x, atom.y, atom.z);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.count = atoms.length;
    mesh.instanceMatrix.needsUpdate = true;

    const hitsPerSecond = hits / Math.max(dt, 1 / 240);
    pressureRef.current = pressureRef.current * 0.92 + hitsPerSecond * 0.08;
    boxLive.pressure = pressureRef.current;
    boxLive.avgSpeed = avgSpeed;
  });

  return (
    <>
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={SIM.accent} />
      </lineSegments>
      <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_ATOMS]} frustumCulled={false}>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshBasicMaterial color={INK} />
      </instancedMesh>
      <OrbitControls makeDefault enableDamping minDistance={8} maxDistance={60} />
    </>
  );
}
