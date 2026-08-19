# 6 Critical Issues - Implementation Fixes

## Issue 1: Desktop Transaction Drawer Not Loading/Hidden
**File**: `src/components/run-panel/run-panel.tsx`
**Root Cause**: 
- Line 328-330 closes the drawer on mount regardless of device
- Line 346-348 returns null (not rendering) when `show_run_panel` is false
- The drawer needs to remain visible on desktop by default

**Status**: Ready to implement

---

## Issue 2: Site Keeps Logging Out Often
**File**: `src/stores/run-panel-store.ts` (lines 585-630)
**Root Cause**:
- The logout listener registration in `registerReactions()` may not be properly disposing
- The reaction to `common.is_socket_opened` might be triggering unexpectedly
- Missing unsubscribe cleanup in some cases

**Fix**:
1. Ensure proper cleanup of reactions
2. Add guards to prevent re-initialization
3. Store listener references properly

---

## Issue 3: Account Loading Delays After Login
**File**: `src/stores/client-store.ts` (lines 79-105)
**Root Cause**:
- Account hydration from localStorage is synchronous but may be blocking
- No debouncing or caching of account list fetches
- Account switching may cause re-initialization

**Fix**:
1. Add async account initialization
2. Implement proper caching
3. Prevent redundant API calls

---

## Issue 4: Bot Builder - Trading Engine & Trade Types Disappearing
**File**: `src/external/bot-skeleton/` and trade type utilities
**Root Cause**:
- Trade types not properly loaded from Blockly workspace
- State not synced between components
- Workspace blocks may be cleared unexpectedly

**Fix**:
1. Ensure trade types are properly initialized
2. Add fallback loading logic
3. Prevent state loss on re-render

---

## Issue 5: Copy Trading Tab Not Working - Incorrect Data Binding
**File**: `src/pages/copy-trading/copy-trading.tsx` and `copy-trading-manager.ts`
**Root Cause**:
- WebSocket connection may fail silently
- Account list retrieval from localStorage not validated
- Token validation not properly handled

**Fix**:
1. Add proper error handling
2. Validate token before connecting
3. Add retry logic with backoff

---

## Issue 6: DTrader App Not Available in Kenya
**File**: `src/pages/dtrader/dtrader.tsx` (line 59 comment mentions Kenya bypass)
**Root Cause**:
- App ID check not being enforced correctly
- Token validation might be failing
- Backend may be blocking Kenya IPs

**Fix**:
1. Verify app ID is correct (121856)
2. Add token fallback chain
3. Implement proxy/VPN detection bypass

---

## Implementation Order
1. Fix #1 - Transaction drawer (high visibility impact)
2. Fix #2 - Logout issue (affects user experience)
3. Fix #3 - Account loading (affects performance)
4. Fix #4 - Bot builder trade types (affects functionality)
5. Fix #5 - Copy trading (affects feature)
6. Fix #6 - Kenya dtrader access (affects users in Kenya)
