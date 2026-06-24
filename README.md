# IPL Perfect Season

A fantasy cricket draft game. No real IPL team has ever gone a whole season unbeaten **and** won the title — this is your shot. Spin a wheel to draw a random franchise and year, pick one player from that squad, do it eleven times, then simulate your XI through a full season and an all‑time playoff gauntlet.

Every player is rated from **real ball‑by‑ball data** (Cricsheet), so the choices — and the results — are grounded in how those seasons actually went.

> Fan‑made. Text/numbers only, no logos or photos.

---

## Gameplay

1. **Spin** — the wheel lands on a real franchise and a real season (e.g. *Chennai Super Kings, 2010*). Two one‑time rerolls let you swap just the team or just the year.
2. **Draft** — pick one player from that squad and drop them into a batting position. Repeat until you have eleven.
3. **Build a legal XI** — the same composition rules a real side follows (see below). You can drag players into open spots or tap to swap the order.
4. **Play the season** — a deterministic 14‑game league against strong sides from across IPL history, then a three‑match playoff gauntlet that ends against an XI built from the best players in the league's history.

**Two modes:** *Easy* shows ratings and stats while you draft; *Hard* hides them — pure cricket knowledge.

### XI rules
- Exactly 11 players.
- Max 4 overseas players.
- At least one wicketkeeper (no upper limit).
- At least 5 bowling options to cover the 20 overs.
- Players can only bat in positions they really batted: Top 1–3, Middle 3–7, Finisher 3–8, Lower 7–11.
- No drafting the same real person twice (even from different seasons).

The draft won't let you reach an illegal XI — picks that would make a legal team impossible are blocked.

### Results
Outcomes ladder up from **Wooden Spoon** (a losing record) → **Mid‑Table** → **Playoff Bound** → **Finalist** → **Champions** → **Unbeaten League Stage** → **Perfect Season** (won all 14, then won the title). Playoff ties go to a super over, the final reveals batter by batter, and a Perfect Season earns a full‑screen celebration. You can share a results card and, signed in, save runs and climb the leaderboard.

---

## Ratings & simulation

- **Player ratings** come from each player's real season stats. Underlying metrics (average, strike rate, economy, wicket rate, fielding) are turned into a 0–100 score via z‑scores against the league distribution, with Bayesian shrinkage so a fluky small sample doesn't out‑rate a full season. Displayed so a league‑average season reads ~50 and the all‑time greats reach the 90s.
- **Team ratings** are a position‑weighted blend of the XI's batting, its best five bowling options, and its fielding — on their own scale where a clearly strong draft reads ~90 and the best XI you can realistically assemble tops out around 96 (a 99 is effectively impossible by design).
- **The match engine** is a seeded, deterministic over‑by‑over simulation: the rating gap nudges run‑rate and wickets, with real T20 variance. Because it's fully determined by the drafted XI, the same team always produces the same season — which also lets the server re‑run and verify any submitted result.
- Difficulty is tuned so making the playoffs is achievable, winning the championship is hard, and a perfect record is extremely rare.

---

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** for styling
- **[Motion](https://motion.dev)** for animation · **canvas-confetti** for celebrations
- **[libSQL](https://github.com/tursodatabase/libsql) / [Turso](https://turso.tech)** (`@libsql/client`) for accounts, run history, and the leaderboard — an embedded SQLite file in development, a hosted Turso database in production
- Auth: scrypt password hashing, httpOnly session cookies, server‑side session expiry

---

## Getting started

Requires **Node 20+**.

```bash
git clone <your-repo-url>
cd ipl-perfect-season
npm install
npm run dev
```

Open <http://localhost:3000>.

The generated dataset is committed, so the game runs out of the box. Accounts/leaderboard work locally against an embedded SQLite file at `.data/app.db` (gitignored) — no configuration needed.

### Production database (optional, for deployment)

On serverless hosts (e.g. Vercel) the local file isn't persistent, so point the app at a hosted [Turso](https://turso.tech) database:

```bash
turso db create ipl-perfect-season
turso db show ipl-perfect-season --url      # -> TURSO_DATABASE_URL
turso db tokens create ipl-perfect-season   # -> TURSO_AUTH_TOKEN
```

Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as environment variables (see `.env.example`). Tables are created automatically on first run.

---

## Data pipeline

Ratings are derived from [Cricsheet](https://cricsheet.org) ball‑by‑ball data. The pipeline runs in order and writes intermediate files to `data/generated/`, with the final engine‑ready dataset in `src/engine/data/`:

```bash
npm run data:cricsheet      # parse raw Cricsheet match files -> per-player-season stats
npm run data:nationality    # resolve overseas/domestic status
npm run data:ratings        # stats -> 0-100 bat/bowl/field/overall ratings
npm run data:league-finish  # real league finishes (for wheel weighting + flavour)
npm run data:keepers        # derive wicketkeepers
npm run data:assemble       # merge everything into the final dataset
```

You only need this to regenerate the data from scratch; the committed JSON is enough to play and develop.

---

## Project structure

```
src/
  app/                  # Next.js App Router pages (cover, play, leaderboard, history) + API routes
    api/                # auth, runs (server-verified), leaderboard
    components/         # SpinReel, SeasonResultView, draft UI, etc.
  engine/               # framework-agnostic game logic
    sim.ts              # the deterministic season simulation
    rating.ts           # team rating from a drafted XI
    odds.ts             # pre-season projections (playoff/title/unbeaten odds)
    rules.ts            # XI composition rules + legality checks
    verdict.ts          # result -> tier + verdict
    data/               # generated, engine-ready dataset (committed)
  lib/                  # db (libSQL/Turso) + auth
scripts/                # the Cricsheet -> dataset pipeline
data/generated/         # intermediate pipeline outputs
```

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run data:*` | Rebuild the dataset (see [Data pipeline](#data-pipeline)) |

---

## Credits & notes

- Player data: **[Cricsheet](https://cricsheet.org)** (ball‑by‑ball IPL data).
- This is an unofficial, fan‑made project with no affiliation to the IPL, BCCI, or any franchise. No team logos, names, or photos are used as assets — franchises are referred to by name with simple monogram crests, and all numbers are derived from public data.
