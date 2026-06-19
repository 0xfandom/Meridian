"use client";

import { Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

function Rig() {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    state.camera.position.x = Math.sin(t * 0.08) * 0.5;
    state.camera.position.y = 0.4 + Math.sin(t * 0.06) * 0.16;
    state.camera.lookAt(0, -0.4, 0);
  });
  return null;
}

function StudioEnv() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer
        form="rect"
        intensity={2.0}
        color="#ffffff"
        position={[0, 6, -3]}
        scale={[12, 10, 1]}
      />
      <Lightformer
        form="rect"
        intensity={1.3}
        color="#dfe7ff"
        position={[-6, 3, 3]}
        rotation={[0, Math.PI / 4, 0]}
        scale={[7, 9, 1]}
      />
      <Lightformer
        form="rect"
        intensity={1.3}
        color="#ffffff"
        position={[6, 3, 3]}
        rotation={[0, -Math.PI / 4, 0]}
        scale={[7, 9, 1]}
      />
      <Lightformer
        form="rect"
        intensity={0.8}
        color="#f3f5ff"
        position={[0, -3, 5]}
        scale={[12, 5, 1]}
      />
    </Environment>
  );
}

export function Scene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.4, 14], fov: 34 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[-6, 8, 5]} intensity={1.0} color="#ffffff" />
        <directionalLight position={[6, 6, 3]} intensity={0.5} color="#eef2ff" />

        <ContactShadows
          position={[0, -3.5, 0]}
          opacity={0.22}
          blur={2.8}
          scale={26}
          far={7}
          color="#1a2240"
          resolution={1024}
        />

        <StudioEnv />
      </Suspense>
      <Rig />
    </Canvas>
  );
}
