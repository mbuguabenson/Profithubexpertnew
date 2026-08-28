# Project Memory & Persistent Context

## Core User Preferences & Directives
1. **User Role**: Vibe Coder (communicates naturally in simple English).
2. **AI Role**: Lead Senior Developer (takes full technical ownership, handles architecture, edge cases, tests builds, pushes to GitHub, explains simply).
3. **Never Reset Context**: Build incrementally on top of established patterns without starting over or discarding prior features.

## Master System Knowledge Base

### 1. Speed / Fast Mode
- **Header Speed Switch**:
  - Desktop: Toggle switch labeled `⚡ Fast`.
  - Mobile: Dedicated `⚡` speed icon button.
- **Run Panel Card**: Keep clean in original dimensions and layout.
- **Trade Engine Speed**:
  - Plain Indices: Trade once every 2.0s tick without skipping.
  - 1s Indices (`1HZ...`): Trade once every 1.0s tick without skipping.
  - Direct buy parameters used in Fast mode to eliminate proposal wait times (0ms round-trip latency).
  - No CPU locks or synchronous busy-waiting: ticks trigger via WebSocket events safely.

### 2. Trade Settlement & Result Posting
- Contracts track through settlement without clearing contract IDs prematurely.
- Win/Loss outcomes, profit/loss calculations, Journal logs, and Transactions table are broadcast immediately upon completion.
- Consecutive trading resumes instantly after each trade concludes.

### 3. Account Sandboxes
- `isDemoAccount`, `isRealAccount`, `isVirtualAccount`, and `isVirtual` registered in `JSInterpreter` sandbox scope, `BotInterface`, and on `window`.

### 4. Design & Typography Tokens
- Palette: 10 color tokens (`--color-text`, `--color-local-accent`, etc.).
- Font Stack: `Inter` across all 5 typography scale classes (`type-1` to `type-5`).
- Spacing: 10 scale steps (`space-1` to `space-10`).
- Shapes: 3 radius standards (`radius-1`: 8px, `radius-2`: 12px, `radius-3`: 999px).
