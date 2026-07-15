# NAS100 / US500 Discretionary Trading Toolkit (Pine Script v5)

A staged TradingView toolset supporting discretionary trading of NAS100 and
US500. **Design rule for every stage: no predictions.** Nothing here outputs a
probability, forecast, or "% chance up/down" — only observable facts,
historical stats, and condition checklists.

## Stages

| Stage | File | Status |
|-------|------|--------|
| 1 — Backtest of the "Sweep + FVG Reclaim" setup | `stage1-sweep-fvg-backtest.pine` | ✅ built |
| 2 — Conditions dashboard (ATR vs 20d avg, ADX trend/range, NY session, 0–10 score) | — | planned |
| 3 — Setup spotlight (live condition checklist, facts only) | — | planned |

## Stage 1 — running the backtest

1. In TradingView, open a **NAS100** chart and set the timeframe to **1H**.
   (The script embeds a red warning in its table on any other timeframe.)
2. Open the Pine Editor, paste the contents of
   `stage1-sweep-fvg-backtest.pine`, click **Add to chart**.
3. Read two places:
   - **The on-chart table (top right):** all three exit models — A swing-high
     target, B fixed 2R, C structure trail — side by side on the *identical*
     trade list, with all stats in R.
   - **The Strategy Tester tab:** the native equity curve and trade-by-trade
     list for whichever single exit model is selected in the inputs.
4. Repeat on a **US500** 1H chart.
5. For honest numbers, set your real commission/slippage in the strategy's
   **Properties** tab (defaults are zero).

### The setup being tested (long side; mirrored for shorts)

- 4H bias: long only when the last two confirmed 4H pivot highs **and** pivot
  lows are both rising. Anything else = no trade.
- A confirmed, untouched 1H swing low (2 higher lows each side) gets **swept**:
  a candle wicks below it but closes back above. A full close below is not a
  sweep — level dead, no trade.
- Within 3 candles, a **displacement** candle (body ≥ 1.5× the average of the
  prior 10 bodies, closing in trade direction) leaves a **Fair Value Gap**
  (candle-1 high < candle-3 low).
- Limit entry at the FVG 50% midpoint; stop just below the sweep wick;
  skip unless R:R to the nearest untouched prior 1H swing high is ≥ 2.
- Unfilled limits cancel after 20 bars, or immediately on a full close
  through the sweep wick.
- Sizing: fixed % of equity risked per trade (default 1%).

All key numbers are inputs at the top of the script.

### Honesty features built in

- **No repainting / look-ahead:** the 4H bias uses only the last *closed* 4H
  bar (offset-by-one `request.security` pattern); swings only count after
  their confirmation lag; limit orders can only fill from the bar *after*
  placement; the structure trail is tested against each bar *before* being
  ratcheted by anything that confirmed at that bar's close.
- **Conservative fills:** a bar that touches both stop and target counts as a
  loss; exits through gaps book the (worse) open price, not the level.
- **Sample-size check:** any exit model with fewer than 30 trades is flagged
  "small sample" directly in the table.
- **Untuned defaults:** all defaults are the spec's numbers, not optimized
  values.
