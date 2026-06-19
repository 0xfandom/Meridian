"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const GREY = "#cfcfc9"; // light grey coin

// embossed "M" built from simple bars (no font needed)
function Emblem() {
  return (
    <group position={[0, 0, 0.045]}>
      <mesh position={[-0.52, 0, 0]}>
        <boxGeometry args={[0.17, 1.15, 0.12]} />
        <meshStandardMaterial color={GREY} metalness={0.05} roughness={0.85} />
      </mesh>
      <mesh position={[0.52, 0, 0]}>
        <boxGeometry args={[0.17, 1.15, 0.12]} />
        <meshStandardMaterial color={GREY} metalness={0.05} roughness={0.85} />
      </mesh>
      <mesh position={[-0.28, 0.04, 0]} rotation={[0, 0, 0.62]}>
        <boxGeometry args={[0.17, 0.95, 0.12]} />
        <meshStandardMaterial color={GREY} metalness={0.05} roughness={0.85} />
      </mesh>
      <mesh position={[0.28, 0.04, 0]} rotation={[0, 0, -0.62]}>
        <boxGeometry args={[0.17, 0.95, 0.12]} />
        <meshStandardMaterial color={GREY} metalness={0.05} roughness={0.85} />
      </mesh>
    </group>
  );
}

// plain matte coin: disc + raised rim + embossed M, 3/4 tilt like the reference
function Coin() {
  const g = useRef<THREE.Group>(null!);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (!g.current) return;
    // base pose + gentle wobble + a fast shiver
    // 3/4 tilt + continuous tumble spin about the face axis = falling, spinning coin
    g.current.rotation.x = 1.0 + Math.sin(t * 0.6) * 0.05 + Math.sin(t * 34) * 0.007;
    g.current.rotation.y = t * 0.7 + Math.sin(t * 41) * 0.007; // continuous spin
    g.current.rotation.z = 0.3 + Math.sin(t * 0.7) * 0.04 + Math.sin(t * 28) * 0.005;
    g.current.position.x = Math.sin(t * 47) * 0.01;
    g.current.position.y = Math.sin(t * 1.3) * 0.08 + Math.sin(t * 38) * 0.011;
  });

  return (
    <group ref={g} scale={0.56}>
      {/* body */}
      <mesh>
        <cylinderGeometry args={[1.5, 1.5, 0.28, 72]} />
        <meshStandardMaterial color={GREY} metalness={0.05} roughness={0.85} />
      </mesh>
      {/* raised rim + emblem on both faces */}
      {[0.141, -0.141].map((y) => (
        <group key={y} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <torusGeometry args={[1.3, 0.07, 14, 72]} />
            <meshStandardMaterial color={GREY} metalness={0.05} roughness={0.85} />
          </mesh>
          <Emblem />
        </group>
      ))}
    </group>
  );
}

type S = { x: number; w: number; h: number; speed: number; o: number; start: number; z: number };

const TOP = 3.4;
const BOT = -3.4;
const RANGE = TOP - BOT;
const FADE_IN = 0.45; // long, slow fade-in from the bottom
const FADE_OUT = 0.45; // long, slow fade-out toward the top (small bright plateau mid-travel)

// vertical streaks falling top → bottom; a few pass in front of the coin
function SpeedStreaks() {
  const refs = useRef<THREE.Mesh[]>([]);
  // soft gradient: transparent edges → solid centre across width, feathered ends
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    const W = 32;
    const H = 256;
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    for (let y = 0; y < H; y++) {
      const p = y / (H - 1);
      // envelope: narrows AND dims toward both ends → pointed needle, no flat ends
      const env = Math.pow(Math.sin(p * Math.PI), 1.4);
      const half = 0.5 * Math.max(env, 0.0001); // bright half-width shrinks to a point
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(Math.max(0, 0.5 - half), "rgba(255,255,255,0)");
      g.addColorStop(0.5, `rgba(255,255,255,${env})`);
      g.addColorStop(Math.min(1, 0.5 + half), "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y, W, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, []);
  const data = useMemo<S[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        x: (i - 8.5) * 0.24 + (i % 2 ? 0.08 : -0.08),
        w: 0.09 + (i % 3) * 0.05, // wider — the soft gradient edges read as glow
        h: 1.4 + (i % 4) * 0.55,
        speed: 7 + (i % 5) * 2.2,
        o: 0.82 + (i % 4) * 0.05,
        start: BOT + ((i * 1.9) % RANGE),
        z: i % 4 === 0 ? 0.9 : -1.2, // every 4th passes in front of the coin
      })),
    [],
  );
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    refs.current.forEach((m, i) => {
      if (!m) return;
      const d = data[i];
      m.position.y += d.speed * step; // bottom → top (coin falls, air rushes up)
      if (m.position.y > TOP) m.position.y -= RANGE;
      const norm = (m.position.y - BOT) / RANGE; // 0 bottom, 1 top
      // slow fade-in from the bottom (norm small), slow fade-out at the top
      const f = Math.max(0, Math.min(norm / FADE_IN, (1 - norm) / FADE_OUT, 1));
      (m.material as THREE.MeshBasicMaterial).opacity = d.o * f;
    });
  });
  return (
    <group>
      {data.map((d, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el as THREE.Mesh;
          }}
          position={[d.x, d.start, d.z]}
          rotation={[0, 0, 0.12]}
        >
          <planeGeometry args={[d.w, d.h]} />
          <meshBasicMaterial
            color="#56564f"
            map={tex}
            transparent
            opacity={d.o}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

export function CoinCanvas() {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0, 6], fov: 36 }}
    >
      {/* soft, even lighting — matte, no gloss */}
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 5, 4]} intensity={1.7} color="#ffffff" />
      <directionalLight position={[-3, 2, 2]} intensity={0.7} color="#ffffff" />

      <SpeedStreaks />
      <Coin />
    </Canvas>
  );
}
