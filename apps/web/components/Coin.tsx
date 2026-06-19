"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { makeCoinTextures, mixHex, type CoinSymbol } from "@/lib/textures";

export interface CoinProps {
  position: [number, number, number];
  color: string;
  symbol: CoinSymbol;
  radius?: number;
  tiltY?: number;
  tiltZ?: number;
  seed?: number;
  amp?: number;
  speed?: number;
}

export function Coin({
  position,
  color,
  symbol,
  radius = 1.4,
  tiltY = 0.25,
  tiltZ = 0.12,
  seed = 0,
  amp = 0.22,
  speed = 0.35,
}: CoinProps) {
  const pos = useRef<THREE.Group>(null);
  const rot = useRef<THREE.Group>(null);

  const geo = useMemo(
    () => new THREE.CylinderGeometry(radius, radius, radius * 0.17, 110, 1),
    [radius],
  );

  const materials = useMemo(() => {
    const { map, bump } = makeCoinTextures(symbol, color);
    const face = new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      map,
      bumpMap: bump,
      bumpScale: 0.045,
      metalness: 0.25,
      roughness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.15,
    });
    const rim = new THREE.MeshPhysicalMaterial({
      color: mixHex(color, "#0b1020", 0.32),
      metalness: 0.8,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.5,
    });
    // CylinderGeometry groups: [0]=side, [1]=top cap, [2]=bottom cap
    return [rim, face, face];
  }, [symbol, color]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (pos.current) {
      pos.current.position.y = position[1] + Math.sin(t * speed + seed) * amp;
      pos.current.position.x = position[0] + Math.cos(t * speed * 0.6 + seed) * amp * 0.35;
    }
    if (rot.current) {
      rot.current.rotation.y = tiltY + Math.sin(t * 0.22 + seed) * 0.12;
      rot.current.rotation.z = tiltZ + Math.cos(t * 0.18 + seed) * 0.04;
    }
  });

  return (
    <group ref={pos} position={position}>
      <group ref={rot} rotation={[0, tiltY, tiltZ]}>
        {/* oriented so the circular face points toward the camera */}
        <mesh
          geometry={geo}
          material={materials}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        />
      </group>
    </group>
  );
}
