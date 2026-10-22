# Performance budget

Measured on the export list at 1,000 rows, throttled to Fast 3G.

| Metric | Budget | Current |
|:---|:---|:---|
| LCP | 2.5s | 1.9s |
| CLS | 0.1 | 0.02 |
| INP | 200ms | 140ms |
| JS shipped | 180KB | 164KB |

A PR that pushes any row over budget does not merge. The fix is nearly always a chart
library or a date library, in that order.
