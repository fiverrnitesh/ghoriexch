import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DieFace } from '../components/DiceDie';
import { soundService } from '../services/sound.service';
import {
  DICE_PASS_S,
  DICE_ROLL_S,
  DICE_SETTLE_S,
  DICE_THROW_S,
  MIN_READY_BEFORE_AUTO_THROW_MS,
} from '../utils/diceAnimTiming';
import { clampToFeltSurface } from './tableGeometry';

/** Top of the felt slab — the plane the dice come to rest on. */
const FELT_TOP_Y = 0.153;

/** Pasa proportions: a long bar with a square cross-section. */
const DIE_LEN = 0.48;
const DIE_W = 0.16;

const REST_Y_FLAT = FELT_TOP_Y + DIE_W / 2;
const REST_Y_ON_END = FELT_TOP_Y + DIE_LEN / 2;

/** Peak of the toss arc — dice stay on the felt until the throw starts. */
const THROW_PEAK_Y = FELT_TOP_Y + 0.92;

/** Point in the settle where the dice first touch the felt. */
const FIRST_CONTACT = 0.52;
/** Near-rail hand position used when no seat projection is available. */
const TABLE_NEAR_HAND_Z = 2.05;

function clampXZ(vec: THREE.Vector3) {
  const p = clampToFeltSurface(vec.x, vec.z);
  vec.x = p.x;
  vec.z = p.z;
  return vec;
}

function clampLanding(x: number, z: number) {
  return clampToFeltSurface(x, z, 0.62);
}

type NumberFace = 1 | 3 | 4 | 6;

/** Where each die comes to rest at initial load — comfortably separated in the middle of the table. */
const REST_SPOTS: Array<{ x: number; z: number; yaw: number }> = [
  { x: -0.30, z: 0.03, yaw: -0.22 },
  { x: 0.30, z: 0.03, yaw: 0.18 },
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
      <RoundedBox args={[DIE_LEN, DIE_W, DIE_W]} radius={0.03} smoothness={4} castShadow receiveShadow>
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

type AnimPhase = 'rest' | 'in_box' | 'ready' | 'pass' | 'throw' | 'roll' | 'settle';

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
  rollFrom: THREE.Vector3;
  rollAxis: THREE.Vector3;
  passFrom: THREE.Vector3;
  passTo: THREE.Vector3;
  restYaw: number;
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
    rollFrom: new THREE.Vector3(),
    rollAxis: new THREE.Vector3(),
    passFrom: new THREE.Vector3(),
    passTo: new THREE.Vector3(),
    restYaw: 0,
  };
}

/** Axis for tumbling in the air on the way down. */
function randomAirTumbleAxis() {
  return new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(1.2),
    THREE.MathUtils.randFloatSpread(0.5),
    THREE.MathUtils.randFloatSpread(1.2),
  ).normalize();
}

/** Axis for rolling along the felt — perpendicular to travel direction. */
function rollAxisForTravel(dx: number, dz: number) {
  const len = Math.hypot(dx, dz) || 1;
  return new THREE.Vector3(-dz / len, 0, dx / len);
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
  handoffActive = false,
  handoffTargetSeat = null,
  onThrowComplete,
}: {
  rolling: boolean;
  dice: [DieFace, DieFace] | null;
  /** `player_throw` waits for a gesture; `auto` flies from the tray/roller on rolling. */
  mode?: 'auto' | 'player_throw';
  throwRequest?: DiceThrowRequest | null;
  trayVisible?: boolean;
  trayWorldPos?: [number, number, number] | null;
  /** Dice slide to the roller before the 5s roll window. */
  handoffActive?: boolean;
  handoffTargetSeat?: number | null;
  onThrowComplete?: () => void;
}) {
  const pips = usePipTextures();
  const dieA = useRef<THREE.Group>(null);
  const dieB = useRef<THREE.Group>(null);
  const lastThrowId = useRef<string | null>(null);
  const lastHandoffKey = useRef<string | null>(null);
  const throwStartedRef = useRef(false);
  const pendingAutoThrowRef = useRef(false);
  const readyEnteredAtRef = useRef<number | null>(null);
  const lockedTrayAnchorRef = useRef<[number, number, number] | null>(null);
  const rollingRef = useRef(rolling);
  const diceRef = useRef(dice);
  const modeRef = useRef(mode);
  const throwRequestRef = useRef(throwRequest);
  const trayWorldPosRef = useRef(trayWorldPos);
  const trayVisibleRef = useRef(trayVisible);
  rollingRef.current = rolling;
  diceRef.current = dice;
  modeRef.current = mode;
  throwRequestRef.current = throwRequest;
  trayWorldPosRef.current = trayWorldPos;
  trayVisibleRef.current = trayVisible;
  const onThrowCompleteRef = useRef(onThrowComplete);
  onThrowCompleteRef.current = onThrowComplete;

  const anim = useRef({
    phase: 'rest' as AnimPhase,
    clock: 0,
    target: null as [DieFace, DieFace] | null,
    landed: false,
    throwDuration: DICE_THROW_S,
    dice: [newDieAnim(), newDieAnim()],
  });

  const lockTrayAnchor = () => {
    const pos = trayWorldPosRef.current;
    if (pos) lockedTrayAnchorRef.current = [...pos] as [number, number, number];
  };

  const unlockTrayAnchor = () => {
    lockedTrayAnchorRef.current = null;
  };

  const markReadyEntered = () => {
    readyEnteredAtRef.current = Date.now();
  };

  const readyElapsedMs = () => {
    const t = readyEnteredAtRef.current;
    return t == null ? 0 : Date.now() - t;
  };

  const isAnimChainPhase = (phase: AnimPhase) =>
    phase === 'pass' || phase === 'throw' || phase === 'roll' || phase === 'settle';

  const groups = () => {
    const a = dieA.current;
    const b = dieB.current;
    return a && b ? ([a, b] as const) : null;
  };

  const trayAnchor = (): THREE.Vector3 => {
    const src = lockedTrayAnchorRef.current ?? trayWorldPosRef.current;
    if (src) {
      const p = clampToFeltSurface(src[0], src[2]);
      return new THREE.Vector3(p.x, src[1], p.z);
    }
    // Near-rail “hand” fallback (self / bottom-center).
    const p = clampToFeltSurface(0, TABLE_NEAR_HAND_Z - 1.4);
    return new THREE.Vector3(p.x, FELT_TOP_Y + 0.55, p.z);
  };

  const placeAtRest = (faces: [DieFace, DieFace]) => {
    const gs = groups();
    if (!gs) return;
    gs.forEach((g, i) => {
      const spot = REST_SPOTS[i]!;
      const face = faces[i]!;
      const p = clampLanding(spot.x, spot.z);
      g.position.set(p.x, restYFor(face), p.z);
      g.quaternion.copy(faceUpQuaternion(face, spot.yaw));
      g.scale.setScalar(1);
    });
    anim.current.phase = 'rest';
    anim.current.clock = 0;
    anim.current.target = null;
    unlockTrayAnchor();
    readyEnteredAtRef.current = null;
  };

  const placeInBox = () => {
    const gs = groups();
    if (!gs) return;
    const anchor = trayAnchor();
    const a = anim.current;
    a.phase = trayVisible ? 'in_box' : 'ready';
    a.clock = 0;
    a.target = null;
    markReadyEntered();
    gs.forEach((g, i) => {
      const off = BOX_OFFSETS[i]!;
      if (trayVisible) {
        // 2D cup owns the visual — hide the 3D pair.
        g.position.set(anchor.x + off[0], anchor.y + off[1], anchor.z + off[2]);
        g.scale.setScalar(0.001);
      } else {
        parkAtRollerHand(g, i, anchor);
      }
      const d = a.dice[i]!;
      d.hoverPhase = i * 1.7;
      d.spin = 0.6 + i * 0.15;
      d.axis.set(0.2, 1, 0.1).normalize();
    });
  };

  const parkAtRollerHand = (g: THREE.Group, i: number, anchor = trayAnchor()) => {
    const off = BOX_OFFSETS[i]!;
    const p = clampXZ(new THREE.Vector3(anchor.x + off[0], 0, anchor.z + off[2]));
    g.position.set(p.x, REST_Y_FLAT, p.z);
    g.quaternion.copy(faceUpQuaternion(DEFAULT_FACES[i]!, REST_SPOTS[i]!.yaw));
    g.scale.setScalar(1);
  };

  const autoThrowDirection = () => {
    const from = trayAnchor();
    let dirX = -from.x;
    let dirZ = -from.z;
    if (Math.hypot(dirX, dirZ) < 0.05) {
      dirX = 0;
      dirZ = -1;
    }
    return { dirX, dirZ };
  };

  const parkAllAtRollerHand = () => {
    const gs = groups();
    if (!gs) return;
    const anchor = trayAnchor();
    const a = anim.current;
    a.phase = 'ready';
    a.clock = 0;
    markReadyEntered();
    gs.forEach((g, i) => parkAtRollerHand(g, i, anchor));
  };

  const tryScheduleAutoThrow = () => {
    if (!rollingRef.current || throwStartedRef.current) return;
    if (modeRef.current === 'player_throw' && throwRequestRef.current) return;
    const phase = anim.current.phase;
    if (phase === 'pass' || phase === 'throw' || phase === 'roll' || phase === 'settle') return;

    if (phase === 'ready' || phase === 'in_box') {
      if (readyElapsedMs() < MIN_READY_BEFORE_AUTO_THROW_MS) return;
      throwStartedRef.current = true;
      pendingAutoThrowRef.current = false;
      const { dirX, dirZ } = autoThrowDirection();
      beginThrow(dirX, dirZ, 0.45, true);
      return;
    }

    if (phase === 'rest' && trayWorldPosRef.current) {
      lockTrayAnchor();
      parkAllAtRollerHand();
      pendingAutoThrowRef.current = true;
    }
  };

  const beginRollOnFelt = () => {
    const gs = groups();
    if (!gs) return;
    const a = anim.current;
    a.phase = 'roll';
    a.clock = 0;
    a.landed = false;
    gs.forEach((g) => g.scale.setScalar(1));
    a.dice.forEach((d, i) => {
      d.rollFrom.copy(d.throwTo);
      const dx = d.restPos.x - d.rollFrom.x;
      const dz = d.restPos.z - d.rollFrom.z;
      d.rollAxis.copy(rollAxisForTravel(dx, dz));
      d.axis.copy(randomAirTumbleAxis());
      d.spin = 10 + i * 2.2;
      d.hoverPhase = i * 1.4;
    });
    soundService.play('dice_result');
  };

  const beginThrow = (dirX: number, dirZ: number, speed: number, playSound: boolean) => {
    const gs = groups();
    if (!gs) return;
    const a = anim.current;
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    // Perpendicular vector for lateral dispersion
    const px = -nz;
    const pz = nx;
    const from = trayAnchor();

    // Natural forward travel distance across the felt
    const baseTravel = 1.2 + speed * 2.8;
    const duration = THREE.MathUtils.clamp(
      DICE_THROW_S + (1.25 - speed) * 0.12,
      DICE_THROW_S * 0.85,
      DICE_THROW_S * 1.25,
    );

    // Natural random separation between dice:
    // 1. Lateral gap between dice centers: randomly from 0.42 to 0.82 units
    // (sometimes closer, sometimes wider apart, but never overlapping)
    const lateralGap = 0.42 + Math.random() * 0.40;
    const sideA = -lateralGap / 2 + (Math.random() - 0.5) * 0.08;
    const sideB = lateralGap / 2 + (Math.random() - 0.5) * 0.08;

    // 2. Longitudinal stagger along the throw direction
    const stagger = (Math.random() - 0.5) * 0.36;
    const travelA = baseTravel + stagger;
    const travelB = baseTravel - stagger;

    let landAX = from.x + nx * travelA + px * sideA;
    let landAZ = from.z + nz * travelA + pz * sideA;
    let landBX = from.x + nx * travelB + px * sideB;
    let landBZ = from.z + nz * travelB + pz * sideB;

    // 3. Landing bounds — ellipse inset from the gold rail
    const landA = clampLanding(landAX, landAZ);
    const landB = clampLanding(landBX, landBZ);
    landAX = landA.x;
    landAZ = landA.z;
    landBX = landB.x;
    landBZ = landB.z;

    // 4. Strict collision separation guarantee:
    // With DIE_LEN = 0.48, distance between centers must be at least 0.42
    const MIN_SEP = 0.44;
    const sepX = landBX - landAX;
    const sepZ = landBZ - landAZ;
    const curDist = Math.hypot(sepX, sepZ);
    if (curDist < MIN_SEP) {
      const needed = (MIN_SEP - Math.max(curDist, 0.001)) / 2;
      const ux = curDist > 0.001 ? sepX / curDist : px;
      const uz = curDist > 0.001 ? sepZ / curDist : pz;
      const nudgeA = clampLanding(landAX - ux * needed, landAZ - uz * needed);
      const nudgeB = clampLanding(landBX + ux * needed, landBZ + uz * needed);
      landAX = nudgeA.x;
      landAZ = nudgeA.z;
      landBX = nudgeB.x;
      landBZ = nudgeB.z;
    }

    const landingPoints = [
      { x: landAX, z: landAZ },
      { x: landBX, z: landBZ },
    ];

    a.phase = 'throw';
    a.clock = 0;
    a.landed = false;
    a.throwDuration = duration;

    gs.forEach((g, i) => {
      const d = a.dice[i]!;
      const off = BOX_OFFSETS[i]!;
      const target = landingPoints[i]!;
      const origin = clampXZ(new THREE.Vector3(from.x + off[0], 0, from.z + off[2]));
      const cur = g.position;
      const onFelt = cur.y <= REST_Y_FLAT + 0.18;
      const nearRoller = Math.hypot(cur.x - origin.x, cur.z - origin.z) < 1.4;
      if (onFelt && nearRoller) {
        d.throwFrom.set(cur.x, REST_Y_FLAT, cur.z);
      } else if (nearRoller) {
        d.throwFrom.set(cur.x, cur.y, cur.z);
      } else {
        d.throwFrom.set(origin.x, REST_Y_FLAT, origin.z);
        g.position.copy(d.throwFrom);
      }
      // Land on the felt toward the table centre.
      const skid = 0.18 + Math.random() * 0.14;
      const firstHit = clampLanding(target.x - nx * skid, target.z - nz * skid);
      d.throwTo.set(firstHit.x, REST_Y_FLAT, firstHit.z);
      d.restPos.set(target.x, REST_Y_FLAT, target.z);
      d.restYaw = (Math.random() - 0.5) * 0.9 + (Math.random() < 0.5 ? 0 : Math.PI);
      d.axis.copy(randomAirTumbleAxis());
      d.spin = 16 + speed * 7 + i * 1.6;
      d.hoverPhase = i * 1.4;
      g.scale.setScalar(1);
    });

    if (playSound) soundService.play('dice_throw');
  };

  const beginPassToTray = () => {
    const gs = groups();
    if (!gs) return;
    const anchor = trayAnchor();
    const a = anim.current;
    a.phase = 'pass';
    a.clock = 0;
    a.target = null;
    lockTrayAnchor();
    gs.forEach((g, i) => {
      const off = BOX_OFFSETS[i]!;
      const d = a.dice[i]!;
      const spot = REST_SPOTS[i]!;
      const p = clampLanding(spot.x, spot.z);
      d.passFrom.set(p.x, REST_Y_FLAT, p.z);
      g.position.copy(d.passFrom);
      const dest = clampXZ(new THREE.Vector3(anchor.x + off[0], 0, anchor.z + off[2]));
      d.passTo.set(dest.x, REST_Y_FLAT, dest.z);
      g.quaternion.copy(faceUpQuaternion(DEFAULT_FACES[i]!, spot.yaw));
      g.scale.setScalar(1);
    });
    soundService.play('rotation');
  };

  const beginSettle = (faces: [DieFace, DieFace]) => {
    const gs = groups();
    if (!gs) return;
    const a = anim.current;
    a.phase = 'settle';
    a.clock = 0;
    a.landed = false;
    a.target = faces;
    gs.forEach((g, i) => {
      const d = a.dice[i]!;
      const face = faces[i]!;
      d.from.copy(g.quaternion);
      d.to.copy(faceUpQuaternion(face, d.restYaw));
      d.fromPos.copy(g.position);
      d.restPos.set(d.restPos.x, restYFor(face), d.restPos.z);
      g.scale.setScalar(1);
    });
  };

  useLayoutEffect(() => {
    placeAtRest(dice ?? DEFAULT_FACES);
    // Only positions the dice for the first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Roller cup / hand — park dice at the roller when the roll window opens.
  useEffect(() => {
    if (!trayVisible && !trayWorldPos) return;
    const phase = anim.current.phase;
    if (isAnimChainPhase(phase)) return;
    if (trayVisible) placeInBox();
    else {
      lockTrayAnchor();
      parkAllAtRollerHand();
    }
    if (rollingRef.current) pendingAutoThrowRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayVisible, trayWorldPos?.[0], trayWorldPos?.[1], trayWorldPos?.[2]]);

  // Player flick / tap — must run before the tray-leave effect so we don't
  // snap dice back to rest on the same commit that starts the throw.
  useEffect(() => {
    if (!throwRequest) return;
    if (lastThrowId.current === throwRequest.id) return;
    lastThrowId.current = throwRequest.id;
    throwStartedRef.current = true;
    pendingAutoThrowRef.current = false;
    lockTrayAnchor();
    beginThrow(throwRequest.dirX, throwRequest.dirZ, throwRequest.speed, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throwRequest?.id]);

  // Reset throw latch when the server roll ends.
  useEffect(() => {
    if (rolling) {
      lockTrayAnchor();
      pendingAutoThrowRef.current = true;
      tryScheduleAutoThrow();
      return;
    }
    throwStartedRef.current = false;
    pendingAutoThrowRef.current = false;
    readyEnteredAtRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling]);

  // Leave the box when the roll window closes without a throw (timeout / phase change).
  useEffect(() => {
    if (trayVisible || trayWorldPos) return;
    if (anim.current.phase !== 'in_box') return;
    if (rolling || throwRequest) return;
    placeAtRest(dice ?? DEFAULT_FACES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayVisible, rolling, throwRequest?.id]);

  // Slide dice to the active roller before the roll window opens.
  useEffect(() => {
    if (!handoffActive || handoffTargetSeat == null || !trayWorldPos) return;
    if (rollingRef.current) return;
    const key = String(handoffTargetSeat);
    const phase = anim.current.phase;
    if (phase === 'throw' || phase === 'roll' || phase === 'settle') return;
    if (lastHandoffKey.current === key && (phase === 'pass' || phase === 'ready' || phase === 'in_box')) return;
    lastHandoffKey.current = key;
    lockTrayAnchor();
    beginPassToTray();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffActive, handoffTargetSeat, trayWorldPos?.[0], trayWorldPos?.[1], trayWorldPos?.[2]]);

  useEffect(() => {
    if (!handoffActive) lastHandoffKey.current = null;
  }, [handoffActive]);

  useEffect(() => {
    if (!dice) return;
    const a = anim.current;
    if (a.phase === 'roll' || a.phase === 'throw') {
      a.target = dice;
    } else if (!rollingRef.current && a.phase === 'rest' && !trayWorldPosRef.current) {
      placeAtRest(dice);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice]);

  useFrame((_, delta) => {
    const gs = groups();
    if (!gs) return;
    const a = anim.current;
    a.clock += delta;

    if (a.phase === 'in_box') {
      const anchor = trayAnchor();
      gs.forEach((g, i) => {
        if (trayVisible) {
          const off = BOX_OFFSETS[i]!;
          g.position.set(anchor.x + off[0], anchor.y + off[1], anchor.z + off[2]);
          g.scale.setScalar(0.001);
        } else {
          parkAtRollerHand(g, i, anchor);
        }
      });
      return;
    }

    if (a.phase === 'ready') {
      const anchor = trayAnchor();
      const t = a.clock;
      gs.forEach((g, i) => {
        const off = BOX_OFFSETS[i]!;
        const p = clampXZ(new THREE.Vector3(anchor.x + off[0], 0, anchor.z + off[2]));
        const wobble = Math.sin(t * 16 + i * 1.7) * 0.1;
        g.position.set(
          p.x + Math.sin(t * 14 + i) * 0.01,
          REST_Y_FLAT,
          p.z + Math.cos(t * 13 + i) * 0.01,
        );
        g.quaternion.copy(faceUpQuaternion(DEFAULT_FACES[i]!, REST_SPOTS[i]!.yaw + wobble));
        g.scale.setScalar(1);
      });
      if (pendingAutoThrowRef.current) tryScheduleAutoThrow();
      return;
    }

    if (a.phase === 'rest') {
      gs.forEach((g) => g.scale.setScalar(1));
      return;
    }

    if (a.phase === 'pass') {
      const p = Math.min(1, a.clock / DICE_PASS_S);
      const e = easeOutCubic(p);
      gs.forEach((g, i) => {
        const d = a.dice[i]!;
        const mid = clampXZ(new THREE.Vector3().lerpVectors(d.passFrom, d.passTo, e));
        g.position.set(mid.x, REST_Y_FLAT, mid.z);
        g.scale.setScalar(1);
      });
      if (p >= 1) {
        if (trayVisibleRef.current) placeInBox();
        else parkAllAtRollerHand();
        if (rollingRef.current) pendingAutoThrowRef.current = true;
        tryScheduleAutoThrow();
      }
      return;
    }

    if (a.phase === 'throw') {
      const dur = a.throwDuration || DICE_THROW_S;
      const p = Math.min(1, a.clock / dur);
      const e = easeOutCubic(p);
      gs.forEach((g, i) => {
        const d = a.dice[i]!;
        g.rotateOnWorldAxis(d.axis, d.spin * delta);
        g.position.x = THREE.MathUtils.lerp(d.throwFrom.x, d.throwTo.x, e);
        g.position.z = THREE.MathUtils.lerp(d.throwFrom.z, d.throwTo.z, e);
        const u = 1 - p;
        g.position.y = u * u * d.throwFrom.y + 2 * u * p * THROW_PEAK_Y + p * p * d.throwTo.y;
        g.scale.setScalar(1);
      });
      if (p >= 1) {
        onThrowCompleteRef.current?.();
        beginRollOnFelt();
      }
      return;
    }

    if (a.phase === 'roll') {
      const p = Math.min(1, a.clock / DICE_ROLL_S);
      const e = easeOutCubic(p);
      gs.forEach((g, i) => {
        const d = a.dice[i]!;
        const rollSpin = d.spin * (1 - p * 0.55);
        g.rotateOnWorldAxis(d.rollAxis, rollSpin * delta);
        g.rotateOnWorldAxis(d.axis, rollSpin * 0.35 * delta);
        g.position.x = THREE.MathUtils.lerp(d.rollFrom.x, d.restPos.x, e);
        g.position.z = THREE.MathUtils.lerp(d.rollFrom.z, d.restPos.z, e);
        g.position.y = d.restPos.y + bounceHeight(p) * 0.12;
      });
      if (p >= 1) {
        const faces = a.target ?? diceRef.current ?? DEFAULT_FACES;
        beginSettle(faces);
      }
      return;
    }

    if (a.phase === 'settle') {
      const p = Math.min(1, a.clock / DICE_SETTLE_S);
      const e = easeOutCubic(p);
      gs.forEach((g, i) => {
        const d = a.dice[i]!;
        g.quaternion.slerpQuaternions(d.from, d.to, e);
        g.position.x = THREE.MathUtils.lerp(d.fromPos.x, d.restPos.x, e);
        g.position.z = THREE.MathUtils.lerp(d.fromPos.z, d.restPos.z, e);
        const lift = bounceHeight(p);
        g.position.y = d.restPos.y + lift * Math.max(0, d.fromPos.y - d.restPos.y) * 0.35;
        g.scale.setScalar(1);
      });
      if (!a.landed && p >= FIRST_CONTACT) {
        a.landed = true;
      }
      if (p >= 1) {
        placeAtRest(a.target ?? diceRef.current ?? DEFAULT_FACES);
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
