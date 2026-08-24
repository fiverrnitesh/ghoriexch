import { useEffect, type CSSProperties, type ReactNode } from 'react';
import type { DiceGameSize } from '../hooks/useDiceViewport';

type DiceMobileShellProps = {
  children: ReactNode;
  isMobileRotate: boolean;
  isMobileLandscape: boolean;
  size: DiceGameSize;
};

/**
 * Mobile presentation shell.
 * Portrait  → one landscape-sized surface (header + table + rail) rotated 90° as a unit.
 * Landscape → same surface, native orientation.
 */
export function DiceMobileShell({
  children,
  isMobileRotate,
  isMobileLandscape,
  size,
}: DiceMobileShellProps) {
  const viewportClass = [
    'dice-game-viewport',
    isMobileRotate && 'dice-game-viewport--mobile-rotate',
    isMobileLandscape && 'dice-game-viewport--mobile-landscape',
  ].filter(Boolean).join(' ');

  const viewportStyle: CSSProperties | undefined = isMobileRotate
    ? { position: 'fixed', inset: 0, overflow: 'hidden' }
    : undefined;

  const playStyle: CSSProperties | undefined = isMobileRotate
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: size.gameW,
        height: size.gameH,
        transform: 'translate(-50%, -50%) rotate(90deg)',
        transformOrigin: 'center center',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ['--dice-rail-w' as string]: `${size.railW}px`,
      }
    : isMobileLandscape
      ? {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ['--dice-rail-w' as string]: `${size.railW}px`,
        }
      : undefined;

  useEffect(() => {
    if (!isMobileRotate) return;
    document.documentElement.classList.add('dice-mobile-rotate-active');
    return () => document.documentElement.classList.remove('dice-mobile-rotate-active');
  }, [isMobileRotate]);

  return (
    <div className={viewportClass} style={viewportStyle}>
      <div className="dice-game-viewport__play" style={playStyle}>
        {children}
      </div>
    </div>
  );
}
