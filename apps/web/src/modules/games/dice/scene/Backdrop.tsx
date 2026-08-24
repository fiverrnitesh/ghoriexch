import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createRoomCanvas } from './tableGeometry';

const CANVAS_ASPECT = 1600 / 800;
const BACKDROP_DISTANCE = 60;

/**
 * The reference room is a flat decorative wallpaper, not a receding floor, so the
 * pattern keeps a constant scale across the frame. It is drawn on a plane locked to
 * the camera and cover-fitted to the viewport.
 */
function Wallpaper() {
  const ref = useRef<THREE.Mesh>(null);
  const { camera, size } = useThree();

  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(createRoomCanvas());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  useEffect(() => {
    const viewAspect = size.width / Math.max(1, size.height);
    if (viewAspect < CANVAS_ASPECT) {
      const r = viewAspect / CANVAS_ASPECT;
      texture.repeat.set(r, 1);
      texture.offset.set((1 - r) / 2, 0);
    } else {
      const r = CANVAS_ASPECT / viewAspect;
      texture.repeat.set(1, r);
      texture.offset.set(0, (1 - r) / 2);
    }
    texture.needsUpdate = true;
  }, [texture, size.width, size.height]);

  useFrame(() => {
    const mesh = ref.current;
    const cam = camera as THREE.PerspectiveCamera;
    if (!mesh) return;
    mesh.position.copy(cam.position);
    mesh.quaternion.copy(cam.quaternion);
    mesh.translateZ(-BACKDROP_DISTANCE);
    const height = 2 * BACKDROP_DISTANCE * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    mesh.scale.set(height * cam.aspect, height, 1);
  });

  return (
    <mesh ref={ref} renderOrder={-1000} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export function Backdrop({ floorY }: { floorY: number }) {
  return (
    <>
      <Wallpaper />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} receiveShadow>
        <planeGeometry args={[40, 26]} />
        <shadowMaterial transparent opacity={0.55} color="#0d0214" />
      </mesh>
    </>
  );
}
