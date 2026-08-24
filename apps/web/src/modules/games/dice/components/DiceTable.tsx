import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CasinoTableMesh } from '../scene/CasinoTableMesh';
import { Backdrop } from '../scene/Backdrop';
import { TableDice3D, type DiceThrowRequest } from '../scene/TableDice3D';
import { DiceSeatHtml, DiceSeat, type DiceSeatView } from './DiceSeat';
import { DiceThrowTray, type DiceThrowGesture } from './DiceThrowTray';
import type { DieFace } from './DiceDie';
import { getSeatWorldPosition } from '../utils/seatPositions';
import {
  BODY_HEIGHT,
  RAIL_HEIGHT,
  REFERENCE_TABLE_ASPECT,
  TABLE_RX,
  TABLE_RZ,
} from '../scene/tableGeometry';
import './DiceTable.css';

const FLOOR_Y = -BODY_HEIGHT - 0.34;

/**
 * Framing targets — smaller table, shifted up, near rail kept above bottom clip.
 */
const TARGET_NDC_WIDTH = 1.14;
const TARGET_CENTRE_NDC_Y = 0.2;
/** Near rail NDC y — keeps near-side name plates off the viewport bottom. */
const TARGET_NEAR_NDC_Y = -0.62;

/**
 * Phone framing. Portrait and landscape render the same landscape surface (the
 * portrait one is just CSS-rotated), so the canvas box is identical in both and
 * a single framing serves them. The table fills ~85% of the column beside the
 * betting rail so it reads as a full-size casino table rather than a shrunk one.
 */
const MOBILE_FRAMING = {
  ndcWidth: 1.58,
  centreNdcY: 0,
  nearNdcY: -0.4,
  aimX: 0,
  elevDeg: 36,
  dist: 13.2,
};

type CameraFraming = {
  ndcWidth: number;
  centreNdcY: number;
  nearNdcY: number;
  aimX: number;
  elevDeg: number;
  dist: number;
};

function pickFraming(mobilePortrait: boolean, mobileLandscape: boolean): CameraFraming {
  if (mobilePortrait || mobileLandscape) return MOBILE_FRAMING;
  return {
    ndcWidth: TARGET_NDC_WIDTH,
    centreNdcY: TARGET_CENTRE_NDC_Y,
    nearNdcY: TARGET_NEAR_NDC_Y,
    aimX: 0,
    elevDeg: 41,
    dist: 17,
  };
}

function ndc(cam: THREE.Camera, x: number, y: number, z: number) {
  return new THREE.Vector3(x, y, z).project(cam);
}

function TableCamera({
  mobilePortrait = false,
  mobileLandscape = false,
}: {
  mobilePortrait?: boolean;
  mobileLandscape?: boolean;
}) {
  const { camera, size } = useThree();
  const framing = pickFraming(mobilePortrait, mobileLandscape);
  const { ndcWidth: targetWidth, centreNdcY: targetCentreY, nearNdcY: targetNearY, aimX } = framing;

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    cam.aspect = aspect;
    // A narrow FOV keeps near and far rails close to the same width, as in the reference.
    cam.fov = aspect >= 1.9 ? 22 : aspect >= 1.6 ? 24 : aspect >= 1.3 ? 27 : 32;
    cam.near = 0.5;
    cam.far = 120;

    let elevDeg = framing.elevDeg;
    let dist = framing.dist;
    let aimZ = 0;
    const pivotY = RAIL_HEIGHT;

    for (let i = 0; i < 140; i++) {
      const elev = THREE.MathUtils.degToRad(elevDeg);
      cam.position.set(0, pivotY + Math.sin(elev) * dist, Math.cos(elev) * dist);
      cam.up.set(0, 1, 0);
      cam.lookAt(aimX, pivotY, aimZ);
      cam.updateProjectionMatrix();

      const left = ndc(cam, -TABLE_RX, RAIL_HEIGHT, 0);
      const right = ndc(cam, TABLE_RX, RAIL_HEIGHT, 0);
      const near = ndc(cam, 0, RAIL_HEIGHT, TABLE_RZ);
      const far = ndc(cam, 0, RAIL_HEIGHT, -TABLE_RZ);

      const w = right.x - left.x;
      // NDC y grows upward, so the far rail sits above the near rail.
      const h = far.y - near.y;
      const screenAspect = (w * size.width) / Math.max(1e-6, h * size.height);
      const centreY = (near.y + far.y) * 0.5;

      const aspectErr = screenAspect - REFERENCE_TABLE_ASPECT;
      const widthErr = w - targetWidth;
      const centreErr = centreY - targetCentreY;
      const nearErr = near.y - targetNearY;

      if (
        Math.abs(aspectErr) < 0.015 &&
        Math.abs(widthErr) < 0.01 &&
        Math.abs(centreErr) < 0.006 &&
        Math.abs(nearErr) < 0.008
      ) {
        break;
      }

      // Raising the camera stretches the table vertically, lowering the screen aspect.
      elevDeg = THREE.MathUtils.clamp(elevDeg + aspectErr * 2.4, 24, 58);
      dist = THREE.MathUtils.clamp(dist * (1 + widthErr * 0.35), 8, 50);
      aimZ = THREE.MathUtils.clamp(aimZ - centreErr * 2.2 - nearErr * 1.6, -6, 6);
    }

    cam.updateProjectionMatrix();

    const left = ndc(cam, -TABLE_RX, RAIL_HEIGHT, 0);
    const right = ndc(cam, TABLE_RX, RAIL_HEIGHT, 0);
    const near = ndc(cam, 0, RAIL_HEIGHT, TABLE_RZ);
    const far = ndc(cam, 0, RAIL_HEIGHT, -TABLE_RZ);
    (window as unknown as Record<string, unknown>).__diceCam = {
      elevDeg,
      dist,
      aimZ,
      aimX,
      mobilePortrait,
      mobileLandscape,
      fov: cam.fov,
      canvas: [size.width, size.height],
      ndcW: right.x - left.x,
      ndcH: far.y - near.y,
      screenAspect:
        ((right.x - left.x) * size.width) / Math.max(1e-6, (far.y - near.y) * size.height),
      centreY: (near.y + far.y) * 0.5,
      nearY: near.y,
      targetNearY,
      pxLeft: ((left.x + 1) / 2) * size.width,
      pxRight: ((right.x + 1) / 2) * size.width,
      pxNear: ((1 - near.y) / 2) * size.height,
      pxFar: ((1 - far.y) / 2) * size.height,
    };
  }, [camera, size.width, size.height, mobilePortrait, mobileLandscape, targetWidth, targetCentreY, targetNearY, aimX, framing.elevDeg, framing.dist]);

  return null;
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.16} color="#4a2f52" />
      <hemisphereLight args={['#8f74a0', '#180820', 0.2]} />

      <spotLight
        position={[0, 9.4, 3.4]}
        angle={0.7}
        penumbra={0.9}
        intensity={135}
        distance={32}
        decay={2}
        color="#ffeeda"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />

      <pointLight position={[-6.6, 3.6, 2.4]} intensity={34} distance={22} decay={2} color="#ffc79c" />
      <pointLight position={[6.6, 3.6, 2.4]} intensity={34} distance={22} decay={2} color="#ffc79c" />
      <pointLight position={[0, 3.6, -5.4]} intensity={26} distance={20} decay={2} color="#c084d8" />

      <directionalLight position={[0, 5.2, 9]} intensity={0.28} color="#ffe8d2" />
    </>
  );
}

type SeatHit = { key: string; xPct: number; yPct: number; seatIndex: number; far: boolean };

function SeatHitTracker({
  seats,
  onHits,
  seatOutwardBoost = 0,
}: {
  seats: DiceSeatView[];
  onHits: (hits: SeatHit[]) => void;
  seatOutwardBoost?: number;
}) {
  const { camera } = useThree();
  const lastSig = useRef('');

  useFrame(() => {
    const nextHits: SeatHit[] = seats.map((seat) => {
      const slot = seat.visualSlot ?? 0;
      const pos = getSeatWorldPosition(slot, !!seat.isSelf, { outwardBoost: seatOutwardBoost });
      const v = new THREE.Vector3(pos.x, pos.y, pos.z).project(camera);
      return {
        key: seat.isEmpty ? `empty-${slot}` : String(seat.seatIndex),
        xPct: (v.x * 0.5 + 0.5) * 100,
        yPct: (-v.y * 0.5 + 0.5) * 100,
        seatIndex: seat.seatIndex,
        far: slot === 2 || slot === 3 || slot === 4,
      };
    });
    const sig = nextHits
      .map((h) => `${h.key}:${Math.round(h.xPct * 10)}:${Math.round(h.yPct * 10)}`)
      .join('|');
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    onHits(nextHits);
  });

  return null;
}

function LayoutSizeSync({
  containerRef,
  canvasSize,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasSize?: { width: number; height: number };
}) {
  const setSize = useThree((s) => s.setSize);

  useLayoutEffect(() => {
    const apply = () => {
      const w = canvasSize?.width ?? containerRef.current?.offsetWidth ?? 0;
      const h = canvasSize?.height ?? containerRef.current?.offsetHeight ?? 0;
      if (w > 0 && h > 0) setSize(w, h);
    };

    apply();
    if (canvasSize) return;

    const root = containerRef.current;
    if (!root) return;

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(apply);
    });
    ro.observe(root);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, [containerRef, setSize, canvasSize?.width, canvasSize?.height]);

  // iOS Safari: useMeasure can still briefly read rotated bounds — pin landscape buffer.
  useFrame((state) => {
    if (!canvasSize) return;
    const { width, height } = canvasSize;
    const dpr = state.viewport.dpr;
    const el = state.gl.domElement;
    // three.js floors when sizing the drawing buffer — match it, or this guard
    // never settles and re-allocates the buffer on every frame.
    const targetW = Math.floor(width * dpr);
    const targetH = Math.floor(height * dpr);
    if (el.width !== targetW || el.height !== targetH) {
      state.gl.setSize(width, height, false);
      state.set({ size: { width, height, top: 0, left: 0 } });
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
    }
  });

  return null;
}

export type SeatScreenPos = { seatIndex: number; xPct: number; yPct: number };

/** Nudge overlay seats a few % away from table centre on tight mobile layouts. */
function pushSeatPct(xPct: number, yPct: number, amount: number) {
  const dx = xPct - 50;
  const dy = yPct - 50;
  const len = Math.hypot(dx, dy) || 1;
  return {
    left: `${xPct + (dx / len) * amount}%`,
    top: `${yPct + (dy / len) * amount}%`,
  };
}

export function DiceTable({
  seats,
  maxSeats: _maxSeats,
  selfSeatIndex: _selfSeatIndex,
  rolling = false,
  dice = null,
  onSeatPositions,
  mobileLandscape = false,
  mobilePortrait = false,
  domSeatOverlay = false,
  seatOutwardBoost = 0,
  canvasSize,
  throwMode = 'auto',
  throwRequest = null,
  trayVisible = false,
  trayScreenPct = null,
  trayWorldPos = null,
  portraitRotated = false,
  onPlayerThrow,
}: {
  seats: DiceSeatView[];
  maxSeats: number;
  selfSeatIndex: number | null;
  rolling?: boolean;
  dice?: [DieFace, DieFace] | null;
  onSeatPositions?: (positions: SeatScreenPos[]) => void;
  mobileLandscape?: boolean;
  mobilePortrait?: boolean;
  /** Portrait CSS-rotate: render seats as DOM overlays (drei Html breaks here). */
  domSeatOverlay?: boolean;
  /** Extra push off the table rim for mobile (world units). */
  seatOutwardBoost?: number;
  canvasSize?: { width: number; height: number };
  throwMode?: 'auto' | 'player_throw';
  throwRequest?: DiceThrowRequest | null;
  trayVisible?: boolean;
  trayScreenPct?: { x: number; y: number } | null;
  trayWorldPos?: [number, number, number] | null;
  portraitRotated?: boolean;
  onPlayerThrow?: (gesture: DiceThrowGesture) => void;
}) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ w: number; h: number }>(() =>
    canvasSize ? { w: canvasSize.width, h: canvasSize.height } : { w: 0, h: 0 },
  );
  const [hits, setHits] = useState<SeatHit[]>([]);

  useLayoutEffect(() => {
    if (canvasSize) {
      setLayout({ w: canvasSize.width, h: canvasSize.height });
      return;
    }

    const root = sceneRef.current;
    if (!root) return;

    const apply = () => {
      const w = root.offsetWidth;
      const h = root.offsetHeight;
      if (w > 0 && h > 0) setLayout({ w, h });
    };

    apply();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(apply);
    });
    ro.observe(root);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, [canvasSize?.width, canvasSize?.height]);

  const onHits = useCallback((next: SeatHit[]) => {
    setHits(next);
    onSeatPositions?.(
      next
        .filter((h) => {
          const seat = seats.find((s) => s.seatIndex === h.seatIndex);
          return seat && !seat.isEmpty;
        })
        .map((h) => ({ seatIndex: h.seatIndex, xPct: h.xPct, yPct: h.yPct })),
    );
  }, [onSeatPositions, seats]);

  const sceneStyle =
    layout.w > 0 && layout.h > 0 && !canvasSize
      ? { width: layout.w, height: layout.h }
      : undefined;

  return (
    <div
      className={`dice-table-scene${canvasSize ? ' dice-table-scene--explicit' : ''}`}
      ref={sceneRef}
      style={sceneStyle}
    >
      <Canvas
        className="dice-table-canvas"
        eventSource={sceneRef as RefObject<HTMLElement>}
        eventPrefix="client"
        // offsetSize keeps measurement in layout pixels: the rotated mobile
        // shell would otherwise report a transposed bounding box.
        resize={
          canvasSize
            ? { offsetSize: true, scroll: false, debounce: { scroll: 0, resize: 0 } }
            : undefined
        }
        style={{
          pointerEvents: 'none',
          width: '100%',
          height: '100%',
        }}
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 24, near: 0.5, far: 120, position: [0, 11, 13] }}
        onCreated={({ gl, scene }) => {
          (window as unknown as Record<string, unknown>).__diceScene = scene;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.88;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFShadowMap;
          const pmrem = new THREE.PMREMGenerator(gl);
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          pmrem.dispose();
        }}
      >
        <LayoutSizeSync containerRef={sceneRef} canvasSize={canvasSize} />
        <TableCamera mobilePortrait={mobilePortrait} mobileLandscape={mobileLandscape} />
        <SceneLights />
        <Backdrop floorY={FLOOR_Y} />
        <CasinoTableMesh />
        <TableDice3D
          rolling={rolling}
          dice={dice}
          mode={throwMode}
          throwRequest={throwRequest}
          trayVisible={trayVisible}
          trayWorldPos={trayWorldPos}
        />
        <SeatHitTracker seats={seats} onHits={onHits} seatOutwardBoost={seatOutwardBoost} />
        {!domSeatOverlay
          ? seats.map((seat) => {
              const slot = seat.visualSlot ?? 0;
              const pos = getSeatWorldPosition(slot, !!seat.isSelf, { outwardBoost: seatOutwardBoost });
              return (
                <DiceSeatHtml
                  key={seat.isEmpty ? `empty-${slot}` : seat.seatIndex}
                  position={[pos.x, pos.y, pos.z]}
                  scale={pos.scale}
                  seat={seat}
                />
              );
            })
          : null}
      </Canvas>
      {domSeatOverlay
        ? hits.map((hit) => {
            const seat = seats.find((s) => s.seatIndex === hit.seatIndex);
            if (!seat || seat.isEmpty) return null;
            const pushed = pushSeatPct(hit.xPct, hit.yPct, 2);
            return (
              <div
                key={hit.key}
                className={`dice-seat-overlay${hit.far ? ' dice-seat-overlay--far' : ''}`}
                style={pushed}
              >
                <DiceSeat {...seat} />
              </div>
            );
          })
        : null}
      {!domSeatOverlay
        ? hits.map((hit) => {
            const seat = seats.find((s) => s.seatIndex === hit.seatIndex);
            if (!seat?.onClick) return null;
            return (
              <button
                key={hit.key}
                type="button"
                className={`dice-seat-hit${hit.far ? ' dice-seat-hit--far' : ''}`}
                style={{ left: `${hit.xPct}%`, top: `${hit.yPct}%` }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  seat.onClick?.();
                }}
                aria-label={`Bet on ${seat.name}`}
              />
            );
          })
        : null}
      {trayVisible && trayScreenPct && onPlayerThrow ? (
        <DiceThrowTray
          xPct={trayScreenPct.x}
          yPct={trayScreenPct.y}
          disabled={rolling}
          portraitRotated={portraitRotated}
          onThrow={onPlayerThrow}
        />
      ) : null}
    </div>
  );
}
