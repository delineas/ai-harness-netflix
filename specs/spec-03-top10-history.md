# Spec 03 · Top 10 history

**Status:** not started.

## Goal

See how a title moved through the weekly top 10, week by week.

## Features

1. In the detail panel, a chart with one point per week the title was in the top 10: the week on the x axis and the rank (1 to 10) on the y axis, with rank 1 at the top.
2. Below the chart, the best rank reached and the number of weeks.
3. A title that was never in the top 10 says so instead of showing an empty chart.

## API

- `GET /api/titles/:kind/:id/top10-history` → `[{ weekStart, weekEnd, rank, cumulativeWeeks }]`, oldest first.

## Open questions

- For a show, are seasons shown as one line or one line per season?
- Is a week counted by its start date or its end date?
