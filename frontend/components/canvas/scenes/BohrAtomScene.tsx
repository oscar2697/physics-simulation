"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import ParticleControls from "@/components/canvas/ParticleControls";
import { electronLive, usePhysicsStore } from "@/hooks/usePhysicsState";
import { SIM } from "@/lib/simPalette";

const INK = SIM.primary;
const ORBIT_UNIT = 0.85;
const TRANSITION_DURATION = 1.6;
const MAX_LEVEL = 5;

function orbitRadius(n: number): number {
  return n * n * ORBIT_UNIT;
}

const NUCLEON_POSITIONS: [number, number, number][] = [
  [0.18, 0.18, 0.18],
  [-0.18, -0.18, 0.18],
  [-0.18, 0.18, -0.18],
  [0.18, -0.18, -0.18],
];

function gluonCurve(a: [number, number, number], b: [number, number, number]): [number, number, number][] {
  const points: [number, number, number][] = [];
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  dir.normalize();
  const perp = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
  perp.normalize();
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const wave = Math.sin(t * Math.PI * 6) * 0.07;
    const p = new THREE.Vector3(a[0], a[1], a[2])
      .addScaledVector(dir, t * len)
      .addScaledVector(perp, wave);
    points.push([p.x, p.y, p.z]);
  }
  return points;
}

function ringPoints(radius: number, segments = 96): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
  }
  return points;
}

function Nucleus({ visible, showGluons }: { visible: boolean; showGluons: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const paused = usePhysicsStore.getState().paused;
    if (group && visible && !paused) group.rotation.y += delta * 0.3;
  });

  const gluonLines = useMemo(() => {
    if (!showGluons) return null;
    const lines: { key: string; points: [number, number, number][] }[] = [];
    NUCLEON_POSITIONS.forEach((p1, i) => {
      NUCLEON_POSITIONS.slice(i + 1).forEach((p2, j) => {
        lines.push({ key: `${i}-${j}`, points: gluonCurve(p1, p2) });
      });
    });
    return lines;
  }, [showGluons]);

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      {NUCLEON_POSITIONS.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.3, 12, 8]} />
          <meshBasicMaterial color={INK} wireframe transparent opacity={0.9} />
        </mesh>
      ))}
      {gluonLines?.map(({ key, points }) => (
        <Line key={key} points={points} color={SIM.accent} lineWidth={1} dashed dashSize={0.06} gapSize={0.045} transparent opacity={0.75} />
      ))}
    </group>
  );
}

function EnergyRings({ visible, activeN }: { visible: boolean; activeN: number }) {
  const rings = useMemo(
    () =>
      Array.from({ length: MAX_LEVEL }, (_, idx) => ({
        n: idx + 1,
        points: ringPoints(orbitRadius(idx + 1)),
      })),
    []
  );

  if (!visible) return null;

  return (
    <group>
      {rings.map(({ n, points }) => (
        <Line
          key={n}
          points={points}
          color={n === activeN ? SIM.accent : INK}
          lineWidth={n === activeN ? 2.4 : 1}
          transparent
          opacity={n === activeN ? 1 : 0.4}
        />
      ))}
    </group>
  );
}

function Electron({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const [obj, setObj] = useState<THREE.Group | null>(null);
  const draggingRef = useRef(false);
  const angleRef = useRef(0);
  const animRef = useRef({
    active: false,
    t: 0,
    fromRadius: 1,
    toRadius: 1,
    fromAngle: 0,
    toAngle: 0,
  });

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || !visible) return;
    if (draggingRef.current) {
      electronLive.position = [group.position.x, group.position.y, group.position.z];
      return;
    }
    const store = usePhysicsStore.getState();
    if (store.paused) return;
    const dt = Math.min(delta, 0.05);
    const pending = store.bohr.pendingTransition;

    if (pending && !animRef.current.active) {
      const pos = electronLive.position;
      const currentRadius = Math.hypot(pos[0], pos[2]) || orbitRadius(pending.from);
      const startAngle = Math.atan2(pos[2], pos[0]);
      animRef.current = {
        active: true,
        t: 0,
        fromRadius: currentRadius,
        toRadius: orbitRadius(pending.to),
        fromAngle: startAngle,
        toAngle: startAngle + Math.PI * 0.75,
      };
    }

    if (animRef.current.active) {
      const anim = animRef.current;
      anim.t = Math.min(1, anim.t + dt / TRANSITION_DURATION);
      const ease = anim.t < 0.5 ? 2 * anim.t * anim.t : 1 - Math.pow(-2 * anim.t + 2, 2) / 2;
      const radius = anim.fromRadius + (anim.toRadius - anim.fromRadius) * ease;
      const angle = anim.fromAngle + (anim.toAngle - anim.fromAngle) * ease;
      group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      if (anim.t >= 1) {
        animRef.current.active = false;
        angleRef.current = anim.toAngle;
        usePhysicsStore.getState().setBohrParam({ pendingTransition: null });
      }
    } else {
      const speed = 1.4 / store.bohr.energyLevelN;
      angleRef.current += speed * dt;
      const radius = orbitRadius(store.bohr.energyLevelN);
      group.position.set(Math.cos(angleRef.current) * radius, 0, Math.sin(angleRef.current) * radius);
    }

    electronLive.position = [group.position.x, group.position.y, group.position.z];
  });

  const updateLiveFromObject = useCallback(() => {
    const group = groupRef.current;
    if (group) electronLive.position = [group.position.x, group.position.y, group.position.z];
  }, []);

  const handleDragEnd = useCallback(() => {
    draggingRef.current = false;
    const group = groupRef.current;
    if (!group) return;
    const position: [number, number, number] = [group.position.x, group.position.y, group.position.z];
    const radial = Math.hypot(position[0], position[2]);
    const targetN = Math.max(1, Math.min(MAX_LEVEL + 1, Math.round(Math.sqrt(radial / ORBIT_UNIT))));
    const current = usePhysicsStore.getState().bohr.energyLevelN;
    if (targetN !== current) {
      usePhysicsStore.getState().requestTransition(current, targetN);
    } else {
      angleRef.current = Math.atan2(position[2], position[0]);
    }
  }, []);

  if (!visible) return null;

  return (
    <>
      <group
        ref={(node) => {
          groupRef.current = node;
          setObj(node);
        }}
      >
        <mesh>
          <sphereGeometry args={[0.2, 20, 20]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      </group>
      {obj && (
        <ParticleControls
          object={obj}
          onDragStart={() => {
            draggingRef.current = true;
          }}
          onDragEnd={handleDragEnd}
          onChange={updateLiveFromObject}
        />
      )}
    </>
  );
}

function ElectronCloud({ visible, n }: { visible: boolean; n: number }) {
  const groupRef = useRef<THREE.Group>(null);

  const geometry = useMemo(() => {
    let state = (n * 7919 + 13) >>> 0;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const count = 600;
    const positions = new Float32Array(count * 3);
    const shellRadius = orbitRadius(n);
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const y = rand() * 2 - 1;
      const planar = Math.sqrt(1 - y * y);
      const r = shellRadius + (rand() - 0.5) * 0.9;
      positions[i * 3] = Math.cos(theta) * planar * r;
      positions[i * 3 + 1] = y * r * 0.6;
      positions[i * 3 + 2] = Math.sin(theta) * planar * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [n]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const store = usePhysicsStore.getState();
    if (group && visible && !store.paused) group.rotation.y += delta * 0.15;
  });

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      <points geometry={geometry}>
        <pointsMaterial color={INK} size={0.05} transparent opacity={0.35} sizeAttenuation depthWrite={false} />
      </points>
    </group>
  );
}

function PhotonBurst() {
  const meshRef = useRef<THREE.Mesh>(null);
  const lastTransitionRef = useRef("");
  const animRef = useRef({ t: 1, dir: new THREE.Vector3(1, 0, 0) });

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const store = usePhysicsStore.getState();
    const pending = store.bohr.pendingTransition;
    const key = pending ? `${pending.from}->${pending.to}` : "";
    if (key && key !== lastTransitionRef.current) {
      lastTransitionRef.current = key;
      const pos = electronLive.position;
      const dir = new THREE.Vector3(pos[0], pos[1], pos[2]);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
      animRef.current = { t: 0, dir: dir.normalize() };
    }
    if (animRef.current.t < 1) {
      if (store.paused) return;
      animRef.current.t = Math.min(1, animRef.current.t + Math.min(delta, 0.05) / 1.2);
      const { t, dir } = animRef.current;
      const dist = 0.4 + t * 11;
      mesh.visible = true;
      mesh.position.set(dir.x * dist, dir.y * dist, dir.z * dist);
      mesh.scale.setScalar(0.14 * (1 - t * 0.5));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    } else {
      mesh.visible = false;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshBasicMaterial color={SIM.accent} transparent opacity={0} />
    </mesh>
  );
}

const BOSON_COUNT = 14;

interface BosonParticle {
  t: number;
  dir: THREE.Vector3;
  speed: number;
}

function Bosons({ visible }: { visible: boolean }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const particlesRef = useRef<BosonParticle[]>([]);

  useEffect(() => {
    particlesRef.current = Array.from({ length: BOSON_COUNT }, () => ({
      t: Math.random(),
      dir: new THREE.Vector3().randomDirection(),
      speed: 0.4 + Math.random() * 0.4,
    }));
  }, []);

  useFrame((_, delta) => {
    if (!visible || particlesRef.current.length === 0) return;
    const store = usePhysicsStore.getState();
    if (store.paused) return;
    const dt = Math.min(delta, 0.05);
    particlesRef.current.forEach((particle, i) => {
      particle.t += (particle.speed * dt) / 6;
      if (particle.t > 1) {
        particle.t = 0;
        particle.dir.randomDirection();
      }
      const mesh = refs.current[i];
      if (mesh) {
        const dist = 0.5 + particle.t * 14;
        mesh.position.set(particle.dir.x * dist, particle.dir.y * dist, particle.dir.z * dist);
        mesh.scale.setScalar(0.1 * (1 - particle.t * 0.7));
      }
    });
  });

  if (!visible) return null;

  return (
    <group>
      {Array.from({ length: BOSON_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
        >
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color={SIM.accent} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

export default function BohrAtomScene() {
  const bohr = usePhysicsStore((s) => s.bohr);
  const energyLevelN = bohr.energyLevelN;

  return (
    <>
      <Nucleus visible={bohr.showNucleus} showGluons={bohr.showGluons} />
      <EnergyRings visible={bohr.showEnergyRings} activeN={energyLevelN} />
      <Electron visible={bohr.showElectron} />
      <ElectronCloud visible={bohr.showElectronCloud} n={energyLevelN} />
      <PhotonBurst />
      <Bosons visible={bohr.showBosons} />
      <OrbitControls makeDefault enableDamping minDistance={4} maxDistance={60} />
    </>
  );
}
