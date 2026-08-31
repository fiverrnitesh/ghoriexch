import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  BODY_HEIGHT,
  FELT_RX,
  FELT_RZ,
  FELT_Y,
  RAIL_HEIGHT,
  TABLE_RX,
  TABLE_RZ,
  createFeltBumpCanvas,
  createFeltCanvas,
  createRailBumpCanvas,
  createRailCanvas,
  createRimTube,
  ellipseShape,
  extrudeShape,
  feltLipShape,
  projectWorldUVs,
  railRingShape,
} from './tableGeometry';

/** Inset border width on the felt, in world units, converted to per-axis texture margins. */
const FELT_BORDER = 0.22;

function useCanvasTexture(
  factory: () => HTMLCanvasElement,
  repeat: [number, number],
  srgb = true,
) {
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(factory());
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export function CasinoTableMesh() {
  const feltMap = useCanvasTexture(
    () => createFeltCanvas(FELT_BORDER / (2 * FELT_RX), FELT_BORDER / (2 * FELT_RZ)),
    [1, 1],
  );
  const feltBump = useCanvasTexture(createFeltBumpCanvas, [14, 6], false);
  const railMap = useCanvasTexture(createRailCanvas, [7, 3.2]);
  const railBump = useCanvasTexture(createRailBumpCanvas, [7, 3.2], false);

  const geos = useMemo(() => {
    // World-projected UVs keep the leather grain continuous instead of banding
    // along the extruded side walls.
    const rail = extrudeShape(railRingShape(), RAIL_HEIGHT, 0.08, 160);
    projectWorldUVs(rail, TABLE_RX, TABLE_RZ);

    // Inset so the rail overhangs it; the reference only shows a sliver of body.
    const body = extrudeShape(
      ellipseShape(TABLE_RX - 0.2, TABLE_RZ - 0.18),
      BODY_HEIGHT,
      0.06,
      160,
    );
    projectWorldUVs(body, TABLE_RX, TABLE_RZ);

    const skirt = extrudeShape(
      ellipseShape(TABLE_RX - 0.9, TABLE_RZ - 0.7),
      0.42,
      0.05,
      128,
    );

    const felt = extrudeShape(
      ellipseShape(FELT_RX, FELT_RZ),
      0.035,
      0.008,
      160,
    );
    projectWorldUVs(felt, FELT_RX, FELT_RZ);

    const lip = extrudeShape(feltLipShape(), 0.014, 0.004, 160);

    // Padded roll where the rail turns down into the felt.
    const innerRoll = createRimTube(
      FELT_RX + 0.08,
      FELT_RZ + 0.08,
      RAIL_HEIGHT - 0.05,
      0.10,
    );

    // Cream piping line along the outer edge of the rail.
    const piping = createRimTube(
      TABLE_RX - 0.05,
      TABLE_RZ - 0.05,
      RAIL_HEIGHT - 0.05,
      0.062,
    );

    // Dark band under the rail so the outer face reads as an edge, not a slab.
    const edgeBand = createRimTube(
      TABLE_RX - 0.02,
      TABLE_RZ - 0.02,
      -0.05,
      0.07,
    );

    return { rail, body, skirt, felt, lip, innerRoll, piping, edgeBand };
  }, []);

  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose());
    },
    [geos],
  );

  return (
    <group>
      <mesh geometry={geos.skirt} position={[0, -BODY_HEIGHT - 0.38, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#3d2a0a" roughness={0.75} metalness={0.2} />
      </mesh>

      <mesh geometry={geos.body} position={[0, -BODY_HEIGHT + 0.02, 0]} castShadow receiveShadow>
        <meshStandardMaterial
          map={railMap}
          color="#6b4e0a"
          roughness={0.55}
          metalness={0.45}
          envMapIntensity={0.5}
        />
      </mesh>

      <mesh geometry={geos.rail} position={[0, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial
          map={railMap}
          bumpMap={railBump}
          bumpScale={0.006}
          color="#D9A01B"
          roughness={0.32}
          metalness={0.72}
          envMapIntensity={1.1}
          emissive="#3d2a00"
          emissiveIntensity={0.06}
        />
      </mesh>

      <mesh geometry={geos.innerRoll} castShadow receiveShadow>
        <meshStandardMaterial
          map={railMap}
          bumpMap={railBump}
          bumpScale={0.005}
          color="#b8960b"
          roughness={0.38}
          metalness={0.65}
          envMapIntensity={0.9}
        />
      </mesh>

      <mesh geometry={geos.edgeBand}>
        <meshStandardMaterial color="#4a3508" roughness={0.6} metalness={0.35} />
      </mesh>

      <mesh geometry={geos.piping}>
        <meshStandardMaterial
          color="#f5d76e"
          roughness={0.28}
          metalness={0.8}
          envMapIntensity={1.2}
        />
      </mesh>

      <mesh geometry={geos.lip} position={[0, FELT_Y + 0.018, 0]}>
        <meshStandardMaterial
          color="#e8c547"
          roughness={0.3}
          metalness={0.75}
          envMapIntensity={0.95}
        />
      </mesh>

      <mesh geometry={geos.felt} position={[0, FELT_Y, 0]} receiveShadow>
        <meshStandardMaterial
          map={feltMap}
          bumpMap={feltBump}
          bumpScale={0.016}
          color="#ffffff"
          roughness={0.98}
          metalness={0}
          envMapIntensity={0.06}
        />
      </mesh>
    </group>
  );
}
