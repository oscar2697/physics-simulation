"use client";

import { TransformControls } from "@react-three/drei";
import type { Object3D } from "three";

interface ParticleControlsProps {
  object: Object3D;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onChange?: () => void;
}

export default function ParticleControls({ object, onDragStart, onDragEnd, onChange }: ParticleControlsProps) {
  return (
    <TransformControls
      object={object}
      mode="translate"
      size={0.6}
      onMouseDown={onDragStart}
      onMouseUp={onDragEnd}
      onObjectChange={onChange}
    />
  );
}
