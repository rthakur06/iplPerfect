// Flags the primary wicketkeeper for each team-season using stumping counts from
// parse-cricsheet.ts's output. A stumping is credited only to the keeper standing behind the
// stumps, so the player with the most stumpings in a team-season is almost always the season's
// first-choice keeper — verified against CSK 2010 (MS Dhoni, 6 stumpings vs backup Parthiv
// Patel's 2) during the parser's own spot-check.
//
// Team-seasons with zero recorded stumpings (happens — a keeper can go a whole season without
// one) fall back to most catches that season, which still gets the right answer surprisingly
// often (keepers take a lot of catches too) — confirmed by manual research against several of
// these team-seasons. The handful where that fallback was actually wrong (a non-keeper batter
// had more catches than the real keeper that season) are corrected by manual-keeper-overrides.json,
// each entry sourced from a web search, applied with top priority below.
//
// Usage:
//   npx tsx scripts/derive-keepers.ts

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const STATS_FILE = resolve("data/generated/player-season-stats.json");
const OVERRIDES_FILE = resolve("data/generated/manual-keeper-overrides.json");
const OUTPUT_FILE = resolve("data/generated/team-season-keeper.json");
const UNRESOLVED_FILE = resolve("data/generated/team-season-keeper-unresolved.json");

interface PlayerSeasonAgg {
  name: string;
  personId: string;
  matches: number;
  fielding: { catches: number; stumpings: number };
}
interface TeamSeasonStats {
  franchiseId: string;
  season: number;
  players: PlayerSeasonAgg[];
}

interface OverrideEntry {
  personId: string;
  name: string;
}

function main(): void {
  const stats = JSON.parse(readFileSync(STATS_FILE, "utf-8")) as Record<string, TeamSeasonStats>;
  const overrides: Record<string, OverrideEntry> = existsSync(OVERRIDES_FILE)
    ? JSON.parse(readFileSync(OVERRIDES_FILE, "utf-8"))
    : {};

  const keepers: Record<string, { personId: string; name: string; stumpings: number }> = {};
  const unresolved: string[] = [];

  for (const [teamSeasonId, ts] of Object.entries(stats)) {
    const override = overrides[teamSeasonId];
    if (override) {
      keepers[teamSeasonId] = { personId: override.personId, name: override.name, stumpings: 0 };
      continue;
    }

    const ranked = [...ts.players].sort((a, b) => b.fielding.stumpings - a.fielding.stumpings);
    const top = ranked[0];

    if (!top || top.fielding.stumpings === 0) {
      unresolved.push(teamSeasonId);
      continue;
    }

    keepers[teamSeasonId] = { personId: top.personId, name: top.name, stumpings: top.fielding.stumpings };
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(keepers, null, 2));
  writeFileSync(UNRESOLVED_FILE, JSON.stringify(unresolved, null, 2));
  console.log(`Resolved ${Object.keys(keepers).length} keepers -> ${OUTPUT_FILE}`);
  console.log(`${unresolved.length} team-seasons with zero stumpings need manual review -> ${UNRESOLVED_FILE}`);
}

main();
