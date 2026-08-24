# GO Exchange Design System

Premium 2D/3D hybrid casino UI for the gaming platform.

## Usage

```tsx
import {
  AppShell,
  GameLayout,
  GameTable,
  PlayerSeat,
  BettingPanel,
  GoldButton,
  // ...
} from '../design-system';

// Import styles once in App entry:
import './design-system/styles/base.css';
import './design-system/styles/utilities.css';
```

## Showcase

Visit **http://localhost:5173/design-system** when the dev server is running to preview all components.

## Structure

```
design-system/
├── tokens/           # CSS variables + TS token map
├── styles/           # base.css, utilities.css
├── components/       # Reusable UI components
├── layouts/          # AppShell, GameLayout
└── index.ts          # Public exports
```

## Design Tokens

All tokens are CSS custom properties prefixed with `--ds-`:

| Category | Examples |
|----------|----------|
| Background | `--ds-bg`, `--ds-surface`, `--ds-surface-elevated` |
| Borders | `--ds-border`, `--ds-border-chrome`, `--ds-border-gold` |
| Text | `--ds-text-primary`, `--ds-text-secondary`, `--ds-text-gold` |
| Brand | `--ds-gold`, `--ds-red`, `--ds-chrome` |
| Semantic | `--ds-success`, `--ds-warning`, `--ds-danger` |
| Shadows | `--ds-shadow-panel`, `--ds-shadow-glow-gold`, `--ds-shadow-bevel` |
| Radii | `--ds-radius-sm` … `--ds-radius-full` |
| Spacing | `--ds-space-1` … `--ds-space-12` |
| Typography | `--ds-font-display`, `--ds-font-body`, `--ds-text-*` |

## Components

| Component | Purpose |
|-----------|---------|
| `AppShell` | App chrome with header, nav, mobile nav, toast |
| `Header` / `Navigation` / `MobileNavigation` | Top navigation |
| `GameLayout` | Full-screen game view (table + sidebar + actions) |
| `GameTable` / `PlayerSeat` / `TablePot` | Generic game arena |
| `BettingPanel` | Stake selection + bet options |
| `GameCard` / `RoomCard` / `PlayerCard` | Content cards |
| `WalletDisplay` / `BalanceBadge` | Wallet UI |
| `PrimaryButton` … `GoldButton` | Action buttons |
| `Modal` / `ConfirmModal` / `Toast` | Overlays |
| `CountdownTimer` | Round timers |
| `GameHistory` / `TransactionList` | Data lists |
| `EmptyState` / `LoadingState` / `ErrorState` | Feedback |

## Responsive Breakpoints

- **Desktop** (>768px): Full header nav, side betting panel in GameLayout
- **Tablet** (≤900px): GameLayout sidebar moves below table
- **Mobile** (≤768px): Bottom mobile nav, stacked layouts

## Game-Agnostic

No game-specific logic is baked in. `GameTable`, `PlayerSeat`, and `BettingPanel` accept generic props/slots suitable for Dice, Ludo, Aviator, pool, cards, roulette, etc.
