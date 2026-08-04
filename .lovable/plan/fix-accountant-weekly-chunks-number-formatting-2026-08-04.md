# Fix accountant weekly chunks + number formatting

## Problem
The Weekly performance grid shows "Week 1 (1–7 Aug)" but the first column is **31 FRI** and the range reads `2026-07-31 → 2026-08-06`. The chunk maths is correct; the date-to-string conversion is not. Dates are built at local midnight (Nairobi, UTC+3) and then converted with `toISOString()`, which shifts them back 3 hours into the previous day. So every column label and every query bound is off by one day.

## Fix

1. **Local date formatting** — replace the `toISOString()`-based `iso()` helper in the accountant reports with a local formatter (`YYYY-MM-DD` built from `getFullYear/getMonth/getDate`). This makes:
   - Week 1 = 1st–7th, Week 2 = 8th–14th, Week 3 = 15th–21st, Week 4 = 22nd–28th, Week 5 = 29th–end of month.
   - Selecting July + Week 1 show 1 Jul–7 Jul, with no trailing day from June.
   - The month/prev-month and debt queries use the correct day bounds.
2. **Default view** — when the month changes (and on first load) the anchor snaps to the 1st–7th chunk of that month, so the default is always Week 1 of the selected month.
3. **Two-decimal output, no negatives**
   - All bag figures render to at most 2 decimals (trailing `.00` dropped for whole numbers), money to whole KES as today or 2 decimals where fractional.
   - Displayed totals are clamped at 0 — no negative bag or money cells.
   - Month-over-month change cells keep showing direction with the up/down/flat arrow and colour, but the number itself is shown as a positive magnitude (no minus sign).

## Technical notes
- Files touched: `src/components/accountant/AccountantReports.tsx` (local `iso`, clamping, delta rendering), `src/components/accountant/WeeklyGrid.tsx` (clamped + 2dp cell formatting).
- No database or query-logic changes; date bounds simply become correct.
