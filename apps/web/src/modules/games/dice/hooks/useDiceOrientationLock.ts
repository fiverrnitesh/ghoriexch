/**
 * Previously attempted fullscreen + orientation lock on mobile.
 * That forced browser fullscreen (bad UX) and broke layout on iOS.
 * Portrait uses CSS rotate in DiceMobileShell — no native lock needed.
 */
export function useDiceOrientationLock(_active: boolean) {
  /* intentionally no-op */
}
