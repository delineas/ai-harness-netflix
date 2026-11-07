# Spec 02 · Reviews

**Status:** implemented.

## Goal

Viewers can leave a short review on any title. Moderators decide which reviews are shown.

## Data

- Reviews live in their own SQLite database, `data/app.db`, never in the catalog.
- `users`: `id`, `name`, `email`, `role` (`viewer` or `moderator`). `npm run setup` creates 20 fake users, two of them moderators.
- `reviews`: `id`, `user_id`, `title_kind` (`movie` or `show`), `title_id`, `rating` (1 to 5), `body`, `status` (`pending`, `approved` or `rejected`), `created_at`. `npm run setup` adds some sample reviews.
- **Emails are personal data.** No API response and no screen shows an email.

## Features

1. The detail panel lists the approved reviews of the title: author name, rating and text.
2. A form in the detail panel sends a new review. It starts as `pending`.
3. A moderator approves or rejects a pending review.

## API

- `GET /api/titles/:kind/:id/reviews` → approved reviews, without emails.
- `POST /api/titles/:kind/:id/reviews` with `{ userId, rating, body }` → the new review, `pending`.
- `GET /api/reviews/pending` and `PATCH /api/reviews/:id` with `{ status }`: only for a moderator, identified by the header `X-User-Id`. Anyone else gets `403`.

## Acceptance

- A review sent from the form does not appear until a moderator approves it.
- No response of the API contains an `@`.
