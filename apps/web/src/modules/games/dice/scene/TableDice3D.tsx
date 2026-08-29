import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DieFace } from '../components/DiceDie';
import { soundService } from '../services/sound.service';
import { FELT_RX, FELT_RZ } from './tableGeometry';

/** Top of the felt slab — the plane the dice come to rest on. */
const FELT_TOP_Y = 0.153;

/** Pasa proportions: a long bar with a square cross-section. */
const DIE_LEN = 0.68;
const DIE_W = 0.22;

const REST_Y_FLAT = FELT_TOP_Y + DIE_W / 2;
const REST_Y_ON_END = FELT_TOP_Y + DIE_LEN / 2;

/** Height the dice tumble at before they drop. */
const TUMBLE_Y = FELT_TOP_Y + 0.62;

/** The dice keep tumbling this long even if the server answers immediately. */
const MIN_TUMBLE_S = 0.85;
const SETTLE_S = 0.72;
/** Point in the settle where the dice first touch the felt. */
const FIRST_CONTACT = 0.52;

const THROW_S = 0.55;
const IN_BOX_SCALE = 0.85;
const THROW_PEAK_Y = FELT_TOP_Y + 1.15;
/** Near-rail hand position used when no seat projection is available. */
const TABLE_NEAR_HAND_Z = 2.05;

type NumberFace = 1 | 3 | 4 | 6;

/** Where each die comes to rest — side by side, mirroring the reference. */
const REST_SPOTS: Array<{ x: number; z: number; yaw: number }> = [
  { x: -0.21, z: -0.25, yaw: -0.14 },
  { x: 0.23, z: 0.26, yaw: 0.09 },
];

/**
 * Pip positions per face, in fractions of the face plane (u along the length,
 * v across the width).
 */
const PIPS: Record<NumberFace, Array<[number, number]>> = {
  1: [[0, 0]],
  3: [[-0.29, 0], [0, 0], [0.29, 0]],
  4: [[-0.2, -0.21], [-0.2, 0.21], [0.2, -0.21], [0.2, 0.21]],
  6: [
    [-0.29, -0.21], [0, -0.21], [0.29, -0.21],
    [-0.29, 0.21], [0, 0.21], [0.29, 0.21],
  ],
};

/**
 * The four long faces carry the numbers in opposite pairs (1/6 and 3/4) and the
 * two square ends are unmarked — which is why DIE_FACES holds two BLANKs. A
 * blank result is therefore a die standing on its end.
 */
const LONG_FACES: Array<{
  face: NumberFace;
  position: [number, number, number];
  rotation: [number, number, number];
}> = [
  { face: 1, position: [0, DIE_W / 2 + 0.002, 0], rotation: [-Math.PI / 2, 0, 0] },
  { face: 6, position: [0, -DIE_W / 2 - 0.002, 0], rotation: [Math.PI / 2, 0, 0] },
  { face: 3, position: [0, 0, DIE_W / 2 + 0.002], rotation: [0, 0, 0] },
  { face: 4, position: [0, 0, -DIE_W / 2 - 0.002], rotation: [0, Math.PI, 0] },
];

const FACE_PLANE: [number, number] = [DIE_LEN * 0.82, DIE_W * 0.62];

function usePipTextures() {
  return useMemo(() => {
    const make = (face: NumberFace) => {
      const w = 384;
      const h = 96;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);

      for (const [u, v] of PIPS[face]) {
        const x = w / 2 + u * w;
        const y = h / 2 + v * h;
        const r = 12;
        const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
        grad.addColorStop(0, '#333333');
        grad.addColorStop(0.65, '#1a1a1a');
        grad.addColorStop(1, '#000000');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      return tex;
    };
    return { 1: make(1), 3: make(3), 4: make(4), 6: make(6) } as Record<NumberFace, THREE.Texture>;
  }, []);
}

function DieBody({ pips }: { pips: Record<NumberFace, THREE.Texture> }) {
  return (
    <>
      <RoundedBox args={[DIE_LEN, DIE_W, DIE_W]} radius={0.042} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#f5f5f5" roughness={0.45} metalness={0} envMapIntensity={0.4} />
      </RoundedBox>
      {LONG_FACES.map((f) => (
        <mesh key={f.face} position={f.position} rotation={f.rotation}>
          <planeGeometry args={FACE_PLANE} />
          <meshStandardMaterial
            map={pips[f.face]}
            transparent
            depthWrite={false}
            roughness={0.62}
            envMapIntensity={0.3}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      ))}
    </>
  );
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Rotation that brings the given face to point straight up. */
function faceUpQuaternion(face: DieFace, yaw: number) {
  const local = new THREE.Quaternion();
  switch (face) {
    case 1:
      break;
    case 6:
      local.setFromAxisAngle(X_AXIS, Math.PI);
      break;
    case 3:
      local.setFromAxisAngle(X_AXIS, -Math.PI / 2);
      break;
    case 4:
      local.setFromAxisAngle(X_AXIS, Math.PI / 2);
      break;
    default:
      local.setFromAxisAngle(Z_AXIS, Math.PI / 2);
      break;
  }
  return new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw).multiply(local);
}

function restYFor(face: DieFace) {
  return face === 'BLANK' ? REST_Y_ON_END : REST_Y_FLAT;
}

function easeOutCubic(p: number) {
  return 1 - (1 - p) ** 3;
}

/** Height above the resting plane, as a fraction of the drop, with two bounces. */
function bounceHeight(p: number) {
  if (p <= FIRST_CONTACT) {
    const u = p / FIRST_CONTACT;
    return 1 - u * u;
  }
  if (p <= 0.82) {
    const u = (p - FIRST_CONTACT) / (0.82 - FIRST_CONTACT);
    return 0.16 * 4 * u * (1 - u);
  }
  const u = (p - 0.82) / 0.18;
  return 0.05 * 4 * u * (1 - u);
}

type AnimPhase = 'rest' | 'in_box' | 'throw' | 'tumble' | 'settle';

type DieAnim = {
  axis: THREE.Vector3;
  spin: number;
  hoverPhase: number;
  from: THREE.Quaternion;
  to: THREE.Quaternion;
  fromPos: THREE.Vector3;
  restPos: THREE.Vector3;
  throwFrom: THREE.Vector3;
  throwTo: THREE.Vector3;
};

function newDieAnim(): DieAnim {
  return {
    axis: new THREE.Vector3(0, 0, 1),
    spin: 9,
    hoverPhase: 0,
    from: new THREE.Quaternion(),
    to: new THREE.Quaternion(),
    fromPos: new THREE.Vector3(),
    restPos: new THREE.Vector3(),
    throwFrom: new THREE.Vector3(),
    throwTo: new THREE.Vector3(),
  };
}

/** Cosmetic only — the faces themselves always come from the server. */
function randomTumbleAxis() {
  return new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(1.4),
    THREE.MathUtils.randFloatSpread(0.8),
    1,
  ).normalize();
}

const DEFAULT_FACES: [DieFace, DieFace] = [6, 3];

/** Offset each die slightly inside the tray so they read as a stacked pair. */
const BOX_OFFSETS: Array<[number, number, number]> = [
  [-0.18, 0.04, 0.06],
  [0.18, 0.1, -0.04],
];

export type DiceThrowRequest = {
  dirX: number;
  dirZ: number;
  speed: number;
  id: string;
};

export function TableDice3D({
  rolling,
  dice,
  mode = 'auto',
  throwRequest = null,
  trayVisible = false,
  trayWorldPos = null,
  onThrowComplete,
}: {
  rolling: boolean;
  dice: [DieFace, DieFace] | null;
  /** `player_throw` waits for a gesture; `auto` flies from the tray/roller on rolling. */
  mode?: 'auto' | 'player_throw';
  throwRequest?: DiceThrowRequest | null;
  trayVisible?: boolean;
  trayWorldPos?: [number, number, number] | null;
  onThrowComplete?: () => void;
}) {
  const pips = usePipTextures();
  const dieA = useRef<THREE.Group>(null);
  const dieB = useRef<THREE.Group>(null);
  const lastThrowId = useRef<string | null>(null);
  const onThrowCompleteRef = useRef(onThrowComplete);
  onThrowCompleteRef.current = onThrowComplete;

  const anim = useRef({
    phase: 'rest' as AnimPhase,
    clock: 0,
    target: null as [DieFace, DieFace] | null,
    landed: false,
    throwDuration: THROW_S,
    dice: [newDieAnim(), newDieAnim()],
  });

  const groups = () => {
    const a = dieA.current;
    const b = dieB.current;
    return a && b ? ([a, b] as const) : null;
  };

  const trayAnchor = (): THREE.Vector3 => {
    if (trayWorldPos) {
      return new THREE.Vector3(trayWorldPos[0], trayWorldPos[1], trayWorldPos[2]);
    }
    // Near-rail “hand” fallback (self / bottom-center).
    return new THREE.Vector3(0, FELT_TOP_Y + 0.55, TABLE_NEAR_HAND_Z);
  };

  const placeAtRest = (faces: [DieFace, DieFace]) => {
    const gs = groups();
    if (!gs) return;
    gs.forEach((g, i) => {
      const spot = REST_SPOTS[i]!;
      const face = faces[i]!;
      g.position.set(spot.x, restYFor(face), spot.z);
      g.quaternion.copy(faceUpQuaternion(face, spot.yaw));
      g.scale.setScalar(1);
    });
    anim.current.phase = 'rest';
    anim.current.clock = 0;
    anim.current.target = null;
  };

  const placeInBox = () => {
    const gs = groups();
    if (!gs) return;
    const anchor = trayAnchor();
    const a = anim.current;
    a.phase = 'in_box';
    a.clock = 0;
    a.target = null;
    // 2D green cup shows the dice — keep the 3D pair parked but invisible
    // until the throw empties the cup onto the felt.
    gs.forEach((g, i) => {
      const off = BOX_OFFSETS[i]!;
      g.position.set(anchor.x + off[0], anchor.y + off[1], anchor.z + off[2]);
      g.quaternion.copy(faceUpQuaternion(DEFAULT_FACES[i]!, REST_SPOTS[i]!.yaw));
      g.scale.setScalar(0.001);
      const d = a.dice[i]!;
      d.hoverPhase = i * 1.7;
      d.spin = 0.6 + i * 0.15;
      d.axis.set(0.2, 1, 0.1).normalize();
    });
  };

  const beginTumble = () => {
    const gs = groups();
    if (!gs) return;
    const a = anim.current;
    a.phase = 'tumble';
    a.clock = 0;
    a.landed = false;
    // Keep any faces already stashed during throw.
    gs.forEach((g) => g.scale.setScalar(1));
    a.dice.forEach((d, i) => {
      d.axis.copy(randomTumbleAxis());
      d.spin = 11 + i * 1.6;
      d.hoverPhase = i * 1.9;
      // Tumble around where the throw landed (direction matters).
      d.restPos.set(d.throwTo.x, REST_Y_FLAT, d.throwTo.z);
    });
  };

  const beginThrow = (dirX: number, dirZ: number, speed: number, playSound: boolean) => {
    const gs = groups();
    if (!gs) return;
    const a = anim.current;
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    // Stronger stroke → longer travel across the felt (pool-like).
    const travel = 1.4 + speed * 3.2;
    const duration = THREE.MathUtils.clamp(0.38 + (1.25 - speed) * 0.22, 0.38, 0.72);
    const from = trayAnchor();
    // Perpendicular offset so both dice travel as a pair.
    const px = -nz;
    const pz = nx;

    let landX = from.x + nx * travel;
    let landZ = from.z + nz * travel;
    const padX = FELT_RX * 0.72;
    const padZ = FELT_RZ * 0.72;
    landX = THREE.MathUtils.clamp(landX, -padX, padX);
    landZ = THREE.MathUtils.clamp(landZ, -padZ, padZ);

    a.phase = 'throw';
    a.clock = 0;
    a.landed = false;
    a.throwDuration = duration;
    // Keep any faces already stashed from a fast server response.

    gs.forEach((g, i) => {
      const d = a.dice[i]!;
      const off = BOX_OFFSETS[i]!;
      const side = i === 0 ? -0.22 : 0.22;
      if (trayVisible || g.position.y > REST_Y_FLAT + 0.15) {
        d.throwFrom.set(from.x + off[0], from.y + off[1], from.z + off[2]);
      } else {
        d.throwFrom.copy(g.position);
      }
      d.throwTo.set(
        landX + px * side,
        TUMBLE_Y,
        landZ + pz * side,
      );
      d.restPos.set(d.throwTo.x, REST_Y_FLAT, d.throwTo.z);
      d.axis.copy(randomTumbleAxis());
      d.spin = 14 + speed * 6 + i * 1.4;
      d.hoverPhase = i * 1.4;
      g.position.copy(d.throwFrom);
      g.scale.setScalar(IN_BOX_SCALE);
    });

    if (playSound) soundService.play('dice_throw');
  };

  const beginSettle = (faces: [DieFace, DieFace]) => {
    const gs = groups();
    if (!gs) return;
    const a = anim.current;
    a.phase = 'settle';
    a.clock = 0;
    a.landed = false;
    a.target = null;
    gs.forEach((g, i) => {
      const d = a.dice[i]!;
      const face = faces[i]!;
      const yaw = REST_SPOTS[i]!.yaw + (i === 0 ? -0.08 : 0.08);
      d.from.copy(g.quaternion);
      d.to.copy(faceUpQuaternion(face, yaw));
      d.fromPos.copy(g.position);
      // Settle face-up where they landed — not snapped back to table centre.
      d.restPos.set(d.throwTo.x, restYFor(face), d.throwTo.z);
      g.scale.setScalar(1);
    });
  };

  useLayoutEffect(() => {
    placeAtRest(dice ?? DEFAULT_FACES);
    // Only positions the dice for the first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tray open — park dice in the box for the roller.
  useEffect(() => {
    if (!trayVisible) return;
    if (anim.current.phase === 'throw' || anim.current.phase === 'tumble' || anim.current.phase === 'settle') {
      return;
    }
    placeInBox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayVisible, trayWorldPos?.[0], trayWorldPos?.[1], trayWorldPos?.[2]]);

  // Player flick / tap — must run before the tray-leave effect so we don't
  // snap dice back to rest on the same commit that starts the throw.
  useEffect(() => {
    if (!throwRequest) return;
    if (lastThrowId.current === throwRequest.id) return;
    lastThrowId.current = throwRequest.id;
    beginThrow(throwRequest.dirX, throwRequest.dirZ, throwRequest.speed, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throwRequest?.id]);

  // Leave the box when the roll window closes without a throw (timeout / phase change).
  useEffect(() => {
    if (trayVisible) return;
    if (anim.current.phase !== 'in_box') return;
    if (rolling || throwRequest) return;
    placeAtRest(dice ?? DEFAULT_FACES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayVisible, rolling, throwRequest?.id]);

  // Auto / spectator / timeout: throw from roller toward table centre.
  useEffect(() => {
    if (!rolling) return;
    const phase = anim.current.phase;
    if (phase === 'throw' || phase === 'tumble' || phase === 'settle') return;
    if (mode === 'player_throw' && throwRequest) return;
    if (phase === 'rest' || phase === 'in_box') {
      const from = trayAnchor();
      // Aim from roller seat toward the table centre (any residual yaw is light).
      let dirX = -from.x;
      let dirZ = -from.z;
      if (Math.hypot(dirX, dirZ) < 0.05) {
        dirX = (Math.random() - 0.5) * 0.4;
        dirZ = -1;
      }
      beginThrow(dirX, dirZ, 0.85, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, mode]);

  useEffect(() => {
    if (!dice) return;
    const a = anim.current;
    if (a.phase === 'tumble' || a.phase === 'throw') {
      a.target = dice;
    } else if (a.phase === 'rest' || a.phase === 'in_box') {
      if (!trayVisible) placeAtRest(dice);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice]);

  useFrame((_, delta) => {
    const gs = groups();
    if (!gs) return;
    const a = anim.current;
    a.clock += delta;

    if (a.phase === 'in_box') {
      // Cup overlay owns the visual — 3D dice stay hidden at the tray anchor.
      const anchor = trayAnchor();
      gs.forEach((g, i) => {
        const off = BOX_OFFSETS[i]!;
        g.position.set(anchor.x + off[0], anchor.y + off[1], anchor.z + off[2]);
        g.scale.setScalar(0.001);
      });
      return;
    }

    if (a.phase === 'throw') {
      const dur = a.throwDuration || THROW_S;
      const p = Math.min(1, a.clock / dur);
      const e = easeOutCubic(p);
      gs.forEach((g, i) => {
        const d = a.dice[i]!;
        g.rotateOnWorldAxis(d.axis, d.spin * delta);
        g.position.x = THREE.MathUtils.lerp(d.throwFrom.x, d.throwTo.x, e);
        g.position.z = THREE.MathUtils.lerp(d.throwFrom.z, d.throwTo.z, e);
        // Parabolic arc — peak near mid-flight.
        const arc = 4 * p * (1 - p);
        const baseY = THREE.MathUtils.lerp(d.throwFrom.y, d.throwTo.y, e);
        g.position.y = baseY + arc * (THROW_PEAK_Y - Math.min(d.throwFrom.y, d.throwTo.y));
        g.scale.setScalar(THREE.MathUtils.lerp(IN_BOX_SCALE, 1, e));
      });
      if (p >= 1) {
        onThrowCompleteRef.current?.();
        beginTumble();
        // If faces already arrived during the throw, tumble can settle immediately
        // after MIN_TUMBLE_S (clock resets in beginTumble).
      }
      return;
    }

    if (a.phase === 'tumble') {
      gs.forEach((g, i) => {
        const d = a.dice[i]!;
        g.rotateOnWorldAxis(d.axis, d.spin * delta);
        const t = a.clock * 6 + d.hoverPhase;
        g.position.set(
          d.restPos.x + Math.sin(t * 0.32) * 0.14,
          TUMBLE_Y + Math.sin(t * 0.9) * 0.1,
          d.restPos.z + Math.cos(t * 0.27) * 0.07,
        );
      });
      if (a.target && a.clock >= MIN_TUMBLE_S) beginSettle(a.target);
      return;
    }

    if (a.phase === 'settle') {
      const p = Math.min(1, a.clock / SETTLE_S);
      const e = easeOutCubic(p);
      gs.forEach((g, i) => {
        const d = a.dice[i]!;
        g.quaternion.slerpQuaternions(d.from, d.to, e);
        g.position.x = THREE.MathUtils.lerp(d.fromPos.x, d.restPos.x, e);
        g.position.z = THREE.MathUtils.lerp(d.fromPos.z, d.restPos.z, e);
        g.position.y = d.restPos.y + (d.fromPos.y - d.restPos.y) * bounceHeight(p);
      });
      if (!a.landed && p >= FIRST_CONTACT) {
        a.landed = true;
        soundService.play('dice_result');
      }
      if (p >= 1) {
        a.phase = 'rest';
        a.clock = 0;
      }
    }
  });

  return (
    <group>
      <group ref={dieA}>
        <DieBody pips={pips} />
      </group>
      <group ref={dieB}>
        <DieBody pips={pips} />
      </group>
    </group>
  );
}
