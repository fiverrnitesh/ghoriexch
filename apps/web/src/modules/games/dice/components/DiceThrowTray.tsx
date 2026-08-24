import { useCallback, useEffect, useRef, useState } from 'react';
import { soundService } from '../services/sound.service';
import './DiceThrowTray.css';

export type DiceThrowGesture = {
  dirX: number;
  dirZ: number;
  speed: number;
};

type PointerSample = {
  x: number;
  y: number;
  t: number;
};

type AimState = {
  originX: number;
  originY: number;
  tipX: number;
  tipY: number;
  power: number;
};

const MIN_DRAG_PX = 32;
const MAX_DRAG_PX = 240;

/**
 * Green plastic dice cup (Ludo-style bucket). Dice sit inside; grab → shake →
 * fling in any direction to throw both onto the table.
 */
export function DiceThrowTray({
  xPct,
  yPct,
  disabled = false,
  portraitRotated = false,
  onThrow,
}: {
  xPct: number;
  yPct: number;
  disabled?: boolean;
  /** Portrait CSS-rotate(90deg) — remap phone drag into landscape table axes. */
  portraitRotated?: boolean;
  onThrow: (gesture: DiceThrowGesture) => void;
}) {
  const origin = useRef<PointerSample | null>(null);
  const last = useRef<PointerSample | null>(null);
  const armed = useRef(false);
  const shakeAccum = useRef(0);
  const [aiming, setAiming] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [shakeNudge, setShakeNudge] = useState({ x: 0, y: 0, rot: 0 });
  const [aim, setAim] = useState<AimState | null>(null);

  const screenToGesture = useCallback((start: PointerSample, end: PointerSample): DiceThrowGesture | null => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < MIN_DRAG_PX) return null;

    let dirX: number;
    let dirZ: number;
    if (portraitRotated) {
      dirX = dy;
      dirZ = -dx;
    } else {
      dirX = dx;
      dirZ = dy;
    }
    const len = Math.hypot(dirX, dirZ) || 1;
    dirX /= len;
    dirZ /= len;

    const power = Math.min(1, (dist - MIN_DRAG_PX) / (MAX_DRAG_PX - MIN_DRAG_PX));
    // A good shake before the fling adds a little extra juice.
    const shakeBonus = Math.min(0.2, shakeAccum.current / 800);
    const speed = 0.4 + power * 0.95 + shakeBonus;
    return { dirX, dirZ, speed: Math.min(1.35, speed) };
  }, [portraitRotated]);

  const updateAim = useCallback((start: PointerSample, tip: PointerSample) => {
    const dx = tip.x - start.x;
    const dy = tip.y - start.y;
    const dist = Math.hypot(dx, dy);
    const power = Math.min(1, Math.max(0, (dist - MIN_DRAG_PX) / (MAX_DRAG_PX - MIN_DRAG_PX)));
    setAim({
      originX: start.x,
      originY: start.y,
      tipX: tip.x,
      tipY: tip.y,
      power,
    });
  }, []);

  const applyShakeFromMove = useCallback((prev: PointerSample, next: PointerSample) => {
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const step = Math.hypot(dx, dy);
    if (step < 1.5) return;

    shakeAccum.current += step;
    setShaking(true);
    // Cup wobbles opposite the stroke — feels like dice rattling inside.
    const nx = dx / (step || 1);
    const ny = dy / (step || 1);
    setShakeNudge({
      x: Math.max(-10, Math.min(10, -nx * Math.min(10, step * 0.55))),
      y: Math.max(-10, Math.min(10, -ny * Math.min(10, step * 0.55))),
      rot: Math.max(-14, Math.min(14, -nx * 8 + ny * 4)),
    });
  }, []);

  const clearAim = useCallback(() => {
    armed.current = false;
    origin.current = null;
    last.current = null;
    setAiming(false);
    setShaking(false);
    setAim(null);
    setShakeNudge({ x: 0, y: 0, rot: 0 });
  }, []);

  // Ease the cup back after each shake twitch.
  useEffect(() => {
    if (!shaking || !aiming) return;
    const id = window.setTimeout(() => {
      setShakeNudge((n) => ({
        x: n.x * 0.35,
        y: n.y * 0.35,
        rot: n.rot * 0.35,
      }));
    }, 40);
    return () => window.clearTimeout(id);
  }, [shakeNudge, shaking, aiming]);

  const finish = useCallback(
    (end: PointerSample) => {
      if (!armed.current || disabled) {
        clearAim();
        return;
      }
      const start = origin.current;
      const shook = shakeAccum.current;
      clearAim();
      shakeAccum.current = 0;
      if (!start) return;

      const gesture = screenToGesture(start, end);
      if (!gesture) {
        // Shook in place with no throw stroke — nudge toward table centre.
        if (shook > 120) {
          onThrow({ dirX: 0, dirZ: -1, speed: 0.55 + Math.min(0.35, shook / 900) });
        }
        return;
      }
      onThrow(gesture);
    },
    [clearAim, disabled, onThrow, screenToGesture],
  );

  return (
    <>
      {aiming ? (
        <div
          className="dice-cup-aim-layer"
          aria-hidden="true"
          onPointerMove={(e) => {
            if (!armed.current || !origin.current) return;
            const sample = { x: e.clientX, y: e.clientY, t: performance.now() };
            if (last.current) applyShakeFromMove(last.current, sample);
            last.current = sample;
            updateAim(origin.current, sample);
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            finish({ x: e.clientX, y: e.clientY, t: performance.now() });
          }}
          onPointerCancel={clearAim}
        />
      ) : null}

      {aim && aiming && aim.power > 0.02 ? (
        <svg className="dice-cup-aim-svg" aria-hidden="true">
          <defs>
            <marker
              id="dice-cup-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(245, 215, 110, 0.95)" />
            </marker>
          </defs>
          <line
            className="dice-cup-aim-line"
            x1={aim.originX}
            y1={aim.originY}
            x2={aim.tipX}
            y2={aim.tipY}
            markerEnd="url(#dice-cup-arrow)"
            style={{ opacity: 0.35 + aim.power * 0.65 }}
          />
        </svg>
      ) : null}

      <div
        className={[
          'dice-cup',
          aiming && 'dice-cup--aiming',
          shaking && 'dice-cup--shaking',
          disabled && 'dice-cup--disabled',
        ].filter(Boolean).join(' ')}
        style={{
          left: `${xPct}%`,
          top: `${yPct}%`,
          ['--cup-shake-x' as string]: `${shakeNudge.x}px`,
          ['--cup-shake-y' as string]: `${shakeNudge.y}px`,
          ['--cup-shake-rot' as string]: `${shakeNudge.rot}deg`,
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Shake the dice cup, then fling to throw"
        onPointerDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          const sample = { x: e.clientX, y: e.clientY, t: performance.now() };
          origin.current = sample;
          last.current = sample;
          armed.current = true;
          shakeAccum.current = 0;
          setAiming(true);
          setShaking(false);
          updateAim(sample, sample);
          soundService.unlock();
        }}
        onPointerMove={(e) => {
          if (!armed.current || !origin.current) return;
          const sample = { x: e.clientX, y: e.clientY, t: performance.now() };
          if (last.current) applyShakeFromMove(last.current, sample);
          last.current = sample;
          updateAim(origin.current, sample);
        }}
        onPointerUp={(e) => {
          if (!armed.current) return;
          e.preventDefault();
          e.stopPropagation();
          finish({ x: e.clientX, y: e.clientY, t: performance.now() });
        }}
        onPointerCancel={clearAim}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onThrow({ dirX: 0, dirZ: -1, speed: 0.7 });
          }
        }}
      >
        <div className="dice-cup__body" aria-hidden="true">
          <div className="dice-cup__rim" />
          <div className="dice-cup__interior">
            <span className="dice-cup__die dice-cup__die--a" />
            <span className="dice-cup__die dice-cup__die--b" />
          </div>
          <div className="dice-cup__ridges">
            <span /><span /><span /><span />
          </div>
        </div>
        <span className="dice-cup__hint">
          {aiming
            ? (aim && aim.power > 0.15 ? 'RELEASE TO THROW' : 'SHAKE · FLING')
            : 'SHAKE & THROW'}
        </span>
      </div>
    </>
  );
}
