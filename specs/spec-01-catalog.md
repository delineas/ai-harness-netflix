# Spec 01 · Catalog

**Status:** implemented.

## Goal

Netflix Explorer lets anyone browse the public Netflix catalog and its viewing figures: what exists, how much it was watched and how long it stayed in the weekly top 10.

## Data

- The catalog is the public netflixdb SQLite database, release **v1.0.70**, saved as `data/catalog.db`. `npm run setup` downloads it and checks its SHA-256: `2cc4edee66ba91ce9d76ae388a1cfdfb18e263fc7f8dc01eddc335cc7d9243b0`.
- Tables used: `movie`, `tv_show`, `season` and `view_summary`.
- `view_summary` has two kinds of rows, told apart by `duration`: `SEMI_ANNUALLY` (engagement reports, six months each) and `WEEKLY` (weekly top 10 lists, with `view_rank` and `cumulative_weeks_in_top10`).
- A movie row links to `view_summary.movie_id`. A show has no figures of its own: its figures come from its seasons (`view_summary.season_id`).
- The `BATCH_*` tables are internal to the tool that built the dataset. The app does not use them.
- The table `episode` is empty in this release.
- **The catalog is read-only.** The app never writes to it.

## Features

1. **Header with global stats:** number of movies, number of shows and total hours viewed.
2. **List of titles** as a grid of cards. Each card shows the title, the kind (Movie or Show), the release year if known, the hours viewed and the weeks in the top 10.
3. **Search** by title (case-insensitive substring) with a *Search* button.
4. **Filter by kind:** All, Movies or Shows.
5. **Sort** by title or by hours viewed (descending).
6. **Pagination,** 24 titles per page.
7. **Detail** of a title in a side panel: the same figures as the card plus, for a show, its seasons with their hours.
8. If nothing matches, the grid says «No titles match your search.»
9. If the API fails, the UI says so instead of staying blank.

## Business rules

- **Hours viewed** of a title: the sum of `hours_viewed` of its `SEMI_ANNUALLY` rows. For a show, the sum over all its seasons.
- **Weeks in the top 10:** shown on the card and in the detail.

## API

- `GET /api/stats` → `{ movies, shows, hoursViewed }`
- `GET /api/titles?q=&kind=all|movie|show&sort=title|hours&page=1` → `{ items, total, page, pageSize }`
- `GET /api/titles/:kind/:id` → the detail of one title.

## Acceptance

- The app starts with `npm start` on `http://localhost:3000`.
- Every feature above works in a browser.
- `npm test` passes.
