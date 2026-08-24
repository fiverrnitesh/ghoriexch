/** Design token values for programmatic use (charts, canvas, etc.) */
export const tokens = {
  color: {
    bg: '#050408',
    surface: '#12081c',
    surfaceElevated: '#1a0e14',
    surfaceCrimson: '#2a0810',
    textPrimary: '#f5f0e8',
    textSecondary: '#a89888',
    gold: '#f5c842',
    goldDim: '#c9a227',
    chrome: '#c0c0c8',
    red: '#c41e3a',
    redDark: '#8b0020',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
  },
  radius: { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, full: 9999 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  font: {
    display: "'Kanit', sans-serif",
    body: "'Kanit', sans-serif",
  },
} as const;

export type DesignTokens = typeof tokens;
