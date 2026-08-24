import { useCallback, useEffect, useState } from 'react';

export type DiceViewportMode = 'desktop' | 'mobile-portrait' | 'mobile-landscape';

export type DiceGameSize = {
  /** Physical viewport width (px). */
  viewportW: number;
  /** Physical viewport height (px). */
  viewportH: number;
  /** Logical game surface width — landscape-oriented (px). */
  gameW: number;
  /** Logical game surface height — landscape-oriented (px). */
  gameH: number;
  /** Betting-rail column width inside the landscape surface (px). */
  railW: number;
  /** 3D table canvas width — the landscape surface minus the rail column (px). */
  tableW: number;
};

/** Betting rail cap — must match the `--dice-rail-w` fallback in CSS. */
export const MOBILE_RAIL_W = 176;

const MOBILE_MAX_WIDTH = 900;

function viewportSize() {
  const vv = window.visualViewport;
  const w = Math.round(vv?.width ?? document.documentElement.clientWidth ?? window.innerWidth);
  const h = Math.round(vv?.height ?? document.documentElement.clientHeight ?? window.innerHeight);
  return { w: Math.max(1, w), h: Math.max(1, h) };
}

function readMode(w: number, h: number): DiceViewportMode {
  if (w > MOBILE_MAX_WIDTH) return 'desktop';
  // Viewport aspect is authoritative — screen.orientation can lag or disagree
  // (e.g. DevTools emulation, iOS Safari chrome, CSS-rotated surfaces).
  return w >= h ? 'mobile-landscape' : 'mobile-portrait';
}

function computeGameSize(w: number, h: number, mode: DiceViewportMode): DiceGameSize {
  const gameW = mode === 'mobile-portrait' ? Math.max(w, h) : w;
  const gameH = mode === 'mobile-portrait' ? Math.min(w, h) : h;
  // Both mobile modes render the same landscape surface: table column + right rail.
  // Portrait just rotates that surface 90°, so the rail is a column in either case.
  const railW = mode === 'desktop' ? 0 : Math.min(MOBILE_RAIL_W, Math.round(gameW * 0.2));
  const tableW = gameW - railW;
  return { viewportW: w, viewportH: h, gameW, gameH, railW, tableW };
}

function syncHtmlClasses(mode: DiceViewportMode) {
  document.documentElement.classList.toggle('dice-mobile-portrait', mode === 'mobile-portrait');
  document.documentElement.classList.toggle('dice-mobile-landscape', mode === 'mobile-landscape');
}

export function useDiceViewport() {
  const [state, setState] = useState(() => {
    const { w, h } = viewportSize();
    const mode = readMode(w, h);
    return { mode, size: computeGameSize(w, h, mode) };
  });

  const update = useCallback(() => {
    const { w, h } = viewportSize();
    const mode = readMode(w, h);
    const size = computeGameSize(w, h, mode);
    setState({ mode, size });
    syncHtmlClasses(mode);
    window.dispatchEvent(new Event('resize'));
  }, []);

  useEffect(() => {
    update();

    const onOrientation = () => {
      update();
      requestAnimationFrame(update);
      window.setTimeout(update, 100);
      window.setTimeout(update, 350);
    };

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', onOrientation);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    screen.orientation?.addEventListener('change', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', onOrientation);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      screen.orientation?.removeEventListener('change', update);
      document.documentElement.classList.remove('dice-mobile-portrait', 'dice-mobile-landscape');
    };
  }, [update]);

  const { mode, size } = state;
  const isMobilePortrait = mode === 'mobile-portrait';
  const isMobileLandscape = mode === 'mobile-landscape';
  const isMobileGameLayout = mode !== 'desktop';

  return {
    mode,
    size,
    isDesktop: mode === 'desktop',
    isMobilePortrait,
    isMobileLandscape,
    isMobileGameLayout,
    /** Portrait: rotate logical landscape surface to fill the phone screen. */
    isMobileRotate: isMobilePortrait,
  };
}
