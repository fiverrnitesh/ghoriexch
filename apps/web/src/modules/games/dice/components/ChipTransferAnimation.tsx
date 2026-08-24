import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatCurrency } from '../utils/seatPositions';
import './ChipTransferAnimation.css';

const CHIP_COUNT = 5;
const DURATION_MS = 1400;
const STAGGER_MS = 80;
const LINGER_MS = 400;

interface ChipTransferProps {
  fromPct: { x: number; y: number };
  toPct: { x: number; y: number };
  amount: number;
  currency?: string;
  roundId: string;
}

export function ChipTransferAnimation({
  fromPct,
  toPct,
  amount,
  currency = 'USD',
  roundId,
}: ChipTransferProps) {
  const [phase, setPhase] = useState<'fly' | 'land' | 'gone'>('fly');
  const containerRef = useRef<HTMLDivElement>(null);
  const [offsets, setOffsets] = useState<{ tx: number; ty: number } | null>(null);

  const measureOffsets = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w <= 0 || h <= 0) return;
    setOffsets({
      tx: ((toPct.x - fromPct.x) / 100) * w,
      ty: ((toPct.y - fromPct.y) / 100) * h,
    });
  }, [fromPct.x, fromPct.y, toPct.x, toPct.y]);

  useLayoutEffect(() => {
    setPhase('fly');
    setOffsets(null);
    measureOffsets();
  }, [roundId, measureOffsets]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureOffsets());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureOffsets]);

  useEffect(() => {
    if (!offsets) return;
    const totalFly = DURATION_MS + STAGGER_MS * (CHIP_COUNT - 1);
    const landTimer = window.setTimeout(() => setPhase('land'), totalFly);
    const goneTimer = window.setTimeout(() => setPhase('gone'), totalFly + LINGER_MS);
    return () => {
      window.clearTimeout(landTimer);
      window.clearTimeout(goneTimer);
    };
  }, [roundId, offsets]);

  if (phase === 'gone') return null;

  return (
    <div className="chip-transfer" ref={containerRef} aria-hidden="true">
      {offsets ? Array.from({ length: CHIP_COUNT }, (_, i) => {
        const delay = i * STAGGER_MS;
        const arcX = (Math.random() - 0.5) * 30;
        const arcY = -30 - Math.random() * 50;
        return (
          <span
            key={i}
            className="chip-transfer__chip"
            style={{
              left: `${fromPct.x}%`,
              top: `${fromPct.y}%`,
              '--tx': `${offsets.tx}px`,
              '--ty': `${offsets.ty}px`,
              '--arc-x': `${arcX}px`,
              '--arc-y': `${arcY}px`,
              '--delay': `${delay}ms`,
              '--dur': `${DURATION_MS}ms`,
            } as React.CSSProperties}
          />
        );
      }) : null}
      {phase === 'land' && amount > 0 ? (
        <span
          className="chip-transfer__label"
          style={{ left: `${toPct.x}%`, top: `${toPct.y - 5}%` }}
        >
          +{formatCurrency(amount, currency)}
        </span>
      ) : null}
    </div>
  );
}
