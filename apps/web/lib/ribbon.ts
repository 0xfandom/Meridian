import * as THREE from "three";

/** Control points for the giant S / valley curve (edge-to-edge). */
export const RIBBON_POINTS: [number, number, number][] = [
  [-11.0, -0.4, -0.9],
  [-8.0, -1.9, 0.3],
  [-4.8, -3.05, 0.95],
  [-1.2, -2.25, 0.2],
  [2.2, -0.7, -0.6],
  [5.4, 1.05, -0.2],
  [8.2, 2.5, 0.6],
  [11.0, 3.0, 0.15],
];

export interface RibbonBuild {
  geometry: THREE.BufferGeometry;
  leftCurve: THREE.CatmullRomCurve3;
  rightCurve: THREE.CatmullRomCurve3;
  uvLengthRepeat: number;
}

/**
 * Build a flat ribbon that follows the curve with its broad face toward the
 * camera (+z). Width spans an in-plane "side" vector so the ribbon never
 * twists away from the viewer. Edge curves are returned for the dark rails.
 */
export function buildRibbon(width = 2.5, N = 340): RibbonBuild {
  const curve = new THREE.CatmullRomCurve3(
    RIBBON_POINTS.map((p) => new THREE.Vector3(...p)),
    false,
    "catmullrom",
    0.5,
  );

  const pts = curve.getSpacedPoints(N);
  const half = width / 2;
  const Z = new THREE.Vector3(0, 0, 1);

  const positions: number[] = [];
  const uvs: number[] = [];
  const leftPts: THREE.Vector3[] = [];
  const rightPts: THREE.Vector3[] = [];

  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();

  // approximate ribbon length for UV repeat (fewer repeats = larger panels)
  let length = 0;
  for (let i = 1; i <= N; i++) length += pts[i].distanceTo(pts[i - 1]);
  const uvLengthRepeat = Math.max(2, Math.round(length / (width * 3.4)));

  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(N, i + 1)];
    tangent.subVectors(b, a).normalize();
    side.crossVectors(tangent, Z).normalize().multiplyScalar(half);

    const lx = p.x + side.x,
      ly = p.y + side.y,
      lz = p.z + side.z;
    const rx = p.x - side.x,
      ry = p.y - side.y,
      rz = p.z - side.z;

    positions.push(lx, ly, lz, rx, ry, rz);
    // S (x) runs along ribbon length (repeats); T (y) spans width 0..1 (clamps)
    const u = (i / N) * uvLengthRepeat;
    uvs.push(u, 0, u, 1);

    leftPts.push(new THREE.Vector3(lx, ly, lz));
    rightPts.push(new THREE.Vector3(rx, ry, rz));
  }

  const indices: number[] = [];
  for (let i = 0; i < N; i++) {
    const l0 = i * 2;
    const r0 = i * 2 + 1;
    const l1 = (i + 1) * 2;
    const r1 = (i + 1) * 2 + 1;
    indices.push(l0, r0, l1);
    indices.push(r0, r1, l1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const leftCurve = new THREE.CatmullRomCurve3(leftPts);
  const rightCurve = new THREE.CatmullRomCurve3(rightPts);

  return { geometry, leftCurve, rightCurve, uvLengthRepeat };
}
