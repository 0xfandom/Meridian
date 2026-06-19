"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildRibbon } from "@/lib/ribbon";
import { makeRibbonTextures } from "@/lib/textures";

export function Ribbon() {
  const group = useRef<THREE.Group>(null);

  const { geometry, leftCurve, rightCurve } = useMemo(() => buildRibbon(3.1, 400), []);
  const { map, bump } = useMemo(() => makeRibbonTextures(), []);

  const railGeoL = useMemo(
    () => new THREE.TubeGeometry(leftCurve, 400, 0.2, 16, false),
    [leftCurve],
  );
  const railGeoR = useMemo(
    () => new THREE.TubeGeometry(rightCurve, 400, 0.2, 16, false),
    [rightCurve],
  );

  useFrame((state, delta) => {
    // slow flowing data — texture drifts along the ribbon length
    const d = Math.min(delta, 0.05);
    map.offset.x -= d * 0.013;
    bump.offset.x = map.offset.x;
    // near-imperceptible living sway (~25s cycle)
    if (group.current) {
      const t = state.clock.elapsedTime;
      group.current.rotation.z = Math.sin(t * 0.25) * 0.012;
      group.current.position.y = Math.sin(t * 0.2) * 0.06;
    }
  });

  return (
    <group ref={group}>
      {/* light architectural-mesh surface */}
      <mesh geometry={geometry} castShadow={false} receiveShadow>
        <meshPhysicalMaterial
          map={map}
          bumpMap={bump}
          bumpScale={0.015}
          metalness={0.45}
          roughness={0.3}
          clearcoat={0.7}
          clearcoatRoughness={0.3}
          envMapIntensity={1.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* dark glossy edge rails — define the shape */}
      <mesh geometry={railGeoL}>
        <meshPhysicalMaterial
          color="#0b1020"
          metalness={0.92}
          roughness={0.16}
          clearcoat={1}
          clearcoatRoughness={0.08}
          envMapIntensity={1.5}
        />
      </mesh>
      <mesh geometry={railGeoR}>
        <meshPhysicalMaterial
          color="#0b1020"
          metalness={0.92}
          roughness={0.16}
          clearcoat={1}
          clearcoatRoughness={0.08}
          envMapIntensity={1.5}
        />
      </mesh>
    </group>
  );
}
