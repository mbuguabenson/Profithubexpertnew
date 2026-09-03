# Digit Distribution Circles Integration Documentation

This document explains the location of files and how the premium digit bubbles/circles (migrated from the official `deriv-app` repository) are integrated into this project.

---

## 📁 File Structure and Locations

The migrated digit components are modularized and reside inside the `src/pages/chart/LastDigitPrediction/` directory:

| File Path                                                                                                                                 | Role                     | Description                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📂 [LastDigitPrediction/](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/LastDigitPrediction/)                                 | **Component Folder**     | Houses the modular circular digit distribution components.                                                                                                |
| 📄 [last-digit-prediction.tsx](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/LastDigitPrediction/last-digit-prediction.tsx)   | **Main Container**       | Controls layout of the 10 circles (0-9). Automatically extracts stats and current last digit from SmartChart feed or falls back to `smart_trading` store. |
| 📄 [digit-display.tsx](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/LastDigitPrediction/digit-display.tsx)                   | **Circle Coordinator**   | Assembles the stat ring, digit value, percentage label, and spot value.                                                                                   |
| 📄 [last-digit-stat.tsx](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/LastDigitPrediction/last-digit-stat.tsx)               | **Stat Ring (SVG)**      | A circular SVG progress track showing the frequency percentage of the digit. Color codes: green = max frequency, red = min frequency.                     |
| 📄 [digit.tsx](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/LastDigitPrediction/digit.tsx)                                   | **Digit Bubble Center**  | Renders the actual digit character (0-9) and percentage text in the center.                                                                               |
| 📄 [digit-spot.tsx](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/LastDigitPrediction/digit-spot.tsx)                         | **Price Spot Indicator** | Displays the full active quote price above the circle with the last digit highlighted.                                                                    |
| 📄 [last-digit-pointer.tsx](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/LastDigitPrediction/last-digit-pointer.tsx)         | **Arrow Pointer**        | Animated SVG triangle indicator that tracks and floats above the active last digit.                                                                       |
| 📄 [last-digit-prediction.scss](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/LastDigitPrediction/last-digit-prediction.scss) | **SCSS Styles**          | Controls spacing, colors, scaling animations, and media queries. Tailored for dark mode and mobile grids.                                                 |

---

## 🔄 Integration Details

### 1. Drop-In Replacement for Global Usage

The wrapper [digit-distribution-circles.tsx](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/digit-distribution-circles.tsx) was modified to import and re-export `LastDigitPrediction`.
This ensures that any component or page in the application (such as the **Easy Tool** page) that imports `DigitDistributionCircles` immediately receives the new circular stats display without altering their local imports.

### 2. Integration with SmartChart (Charts Tab)

In [chart.tsx](file:///E:/Backup/Profithubexpertnew-main/src/pages/chart/chart.tsx), the circular digit distribution was integrated into the main `SmartChart` canvas.

When the user is in the **Charts** tab (`show_digits_stats` is `true`), the chart's bottom widget is override using:

```typescript
bottomWidgets={
    show_digits_stats && !isMobile
        ? ({ digits, tick }: { digits: number[]; tick: any }) => (
              <div className='bottom-widgets'>
                  <DigitDistributionCircles digits={digits} tick={tick} />
              </div>
          )
        : undefined
}
```

### 3. Dynamic Real-Time Updates

- **Tick Stream Extraction**: When rendered inside `SmartChart`, the chart's active connection passes the live `digits` frequency stats array and current `tick` object. `LastDigitPrediction` extracts the last digit dynamically via:
    ```typescript
    const pip_size = tick.pip_size || 0;
    const quote_price = tick.quote.toFixed(pip_size);
    const last_digit = parseInt(quote_price.slice(-1), 10);
    ```
- **Store Fallback**: If the component is rendered elsewhere (such as Easy Tool) without direct SmartChart feed props, it automatically falls back to reading the ticks from the `smart_trading` store.

---

## 🎨 Theme & Styles

The styles use CSS custom properties (`var(--general-main-1)`, `var(--text-profit-success)`, `var(--text-loss-danger)`) to perfectly align with the parent app's colors. The layout shifts from a flex row on desktop to a 5x2 responsive grid on mobile screens.
