// Resolves each unique player's nationality (-> overseas flag) via Wikidata, keyed by their
// exact ESPNcricinfo numeric ID (from Cricsheet's own people.csv registry) rather than name
// search. This sidesteps two dead ends discovered along the way:
//   - ESPNcricinfo itself 403s every scripted request, no exceptions found.
//   - Wikidata's name-based entity search (wbsearchentities) only works when a player's initials
//     happen to be registered as an alias (true for superstars like "MS Dhoni", false for most
//     players) — it whiffed on David Warner, Shikhar Dhawan, Kane Williamson, etc.
// Wikidata stores the ESPNcricinfo ID as property P2697, so an exact SPARQL lookup by that ID
// resolves any player Cricsheet knows about, with no name ambiguity at all.
//
// Usage:
//   npx tsx scripts/scrape-nationality.ts
//
// Resumable: re-running skips personIds already present in the output file.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const STATS_FILE = resolve("data/generated/player-season-stats.json");
const PEOPLE_CSV_URL = "https://cricsheet.org/register/people.csv";
const PEOPLE_CSV_CACHE = resolve("data/cricsheet/people.csv");
const OUTPUT_FILE = resolve("data/generated/player-nationality.json");
const UNRESOLVED_FILE = resolve("data/generated/player-nationality-unresolved.json");

const USER_AGENT = "iplProject-data-pipeline/0.1 (personal hobby project, no contact endpoint)";
const REQUEST_DELAY_MS = 600; // SPARQL endpoint is stricter about burst traffic than the REST API

interface NationalityEntry {
  personId: string;
  name: string;
  cricinfoId: string;
  wikidataLabel: string;
  countries: string[];
  isOverseas: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string, accept: string, attempt = 1): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept } });
  if (res.status === 429 || res.status === 503) {
    if (attempt > 5) throw new Error(`Rate limited repeatedly fetching ${url}`);
    await sleep(1500 * attempt);
    return fetchText(url, accept, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

async function ensurePeopleCsv(): Promise<string> {
  if (existsSync(PEOPLE_CSV_CACHE)) return readFileSync(PEOPLE_CSV_CACHE, "utf-8");
  const csv = await fetchText(PEOPLE_CSV_URL, "text/csv");
  mkdirSync(resolve("data/cricsheet"), { recursive: true });
  writeFileSync(PEOPLE_CSV_CACHE, csv);
  return csv;
}

/**
 * Cricsheet identifier -> ESPNcricinfo numeric id, parsed from people.csv.
 * Joining by `identifier` (not `name`) matters: two genuinely different players can share
 * the same display name (e.g. two different "S Kumar"s), and Cricsheet's own match-JSON
 * registry.people map already gives us that same identifier as our personId — so this is
 * the correct, collision-free join key.
 */
function parseCricinfoIdsByIdentifier(csv: string): Map<string, string> {
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const identifierIdx = header.indexOf("identifier");
  const cricinfoIdx = header.indexOf("key_cricinfo");

  const map = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const identifier = cols[identifierIdx];
    const cricinfoId = cols[cricinfoIdx];
    if (identifier && cricinfoId) map.set(identifier, cricinfoId);
  }
  return map;
}

interface SparqlBinding {
  itemLabel?: { value: string };
  citizenshipLabel?: { value: string };
  teamLabel?: { value: string };
}

interface SparqlResponse {
  results: { bindings: SparqlBinding[] };
}

// Fallback signal for players whose Wikidata item has no P27 (citizenship) claim at all —
// common for recent/less-famous players with sparse, mostly-auto-generated entries. Their P54
// (member of sports team) claims still usually include their senior NATIONAL team alongside
// domestic franchises, so this maps known national/composite-national team labels to the same
// country string P27 would have given. Deliberately an explicit allow-list, not a generic
// "ends with cricket team" regex — a generic rule would also match an Indian player's domestic
// state team (e.g. "Mumbai cricket team") and wrongly flag them as overseas.
const NATIONAL_TEAM_LABEL_TO_COUNTRY: Record<string, string> = {
  "India national cricket team": "India",
  "Australia national cricket team": "Australia",
  "Pakistan national cricket team": "Pakistan",
  "England cricket team": "England",
  "South Africa national cricket team": "South Africa",
  "New Zealand national cricket team": "New Zealand",
  "West Indies cricket team": "West Indies",
  "Sri Lanka national cricket team": "Sri Lanka",
  "Bangladesh national cricket team": "Bangladesh",
  "Afghanistan national cricket team": "Afghanistan",
  "Zimbabwe national cricket team": "Zimbabwe",
  "Ireland cricket team": "Ireland",
  "Scotland national cricket team": "Scotland",
  "Netherlands national cricket team": "Netherlands",
  "Nepal national cricket team": "Nepal",
  "United Arab Emirates national cricket team": "United Arab Emirates",
  "United States national cricket team": "United States",
  "Canada national cricket team": "Canada",
  "Namibia national cricket team": "Namibia",
  "Oman national cricket team": "Oman",
  "Papua New Guinea national cricket team": "Papua New Guinea",
  "Kenya national cricket team": "Kenya",
  "Hong Kong cricket team": "Hong Kong",
};

async function lookupByCricinfoId(cricinfoId: string): Promise<{ label: string; countries: string[] } | null> {
  const query = `SELECT ?itemLabel ?citizenshipLabel ?teamLabel WHERE { ?item wdt:P2697 "${cricinfoId}". OPTIONAL { ?item wdt:P27 ?citizenship. } OPTIONAL { ?item wdt:P54 ?team. } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
  const raw = await fetchText(url, "application/sparql-results+json");
  const data: SparqlResponse = JSON.parse(raw);
  if (data.results.bindings.length === 0) return null;

  const label = data.results.bindings[0].itemLabel?.value ?? "";
  const citizenshipCountries = Array.from(
    new Set(data.results.bindings.map((b) => b.citizenshipLabel?.value).filter((c): c is string => !!c))
  );
  if (citizenshipCountries.length > 0) return { label, countries: citizenshipCountries };

  const nationalTeamCountries = Array.from(
    new Set(
      data.results.bindings
        .map((b) => b.teamLabel?.value)
        .filter((t): t is string => !!t)
        .map((t) => NATIONAL_TEAM_LABEL_TO_COUNTRY[t])
        .filter((c): c is string => !!c)
    )
  );
  return { label, countries: nationalTeamCountries };
}

function loadUniquePlayers(): { personId: string; name: string }[] {
  const stats = JSON.parse(readFileSync(STATS_FILE, "utf-8")) as Record<
    string,
    { players: { personId: string; name: string }[] }
  >;
  const seen = new Map<string, string>();
  for (const teamSeason of Object.values(stats)) {
    for (const p of teamSeason.players) {
      if (!seen.has(p.personId)) seen.set(p.personId, p.name);
    }
  }
  return Array.from(seen, ([personId, name]) => ({ personId, name }));
}

function loadExisting(file: string): Map<string, NationalityEntry> {
  if (!existsSync(file)) return new Map();
  const list = JSON.parse(readFileSync(file, "utf-8")) as NationalityEntry[];
  return new Map(list.map((e) => [e.personId, e]));
}

async function main(): Promise<void> {
  mkdirSync(resolve("data/generated"), { recursive: true });

  const players = loadUniquePlayers();
  const cricinfoIdsByIdentifier = parseCricinfoIdsByIdentifier(await ensurePeopleCsv());
  const resolved = loadExisting(OUTPUT_FILE);
  const unresolved = new Set<string>(
    existsSync(UNRESOLVED_FILE) ? (JSON.parse(readFileSync(UNRESOLVED_FILE, "utf-8")) as string[]) : []
  );

  let processed = 0;
  for (const player of players) {
    if (resolved.has(player.personId) || unresolved.has(player.personId)) continue;

    const cricinfoId = cricinfoIdsByIdentifier.get(player.personId);
    if (!cricinfoId) {
      unresolved.add(player.personId);
      console.warn(`No ESPNcricinfo id in people.csv: ${player.name}`);
      continue;
    }

    try {
      const result = await lookupByCricinfoId(cricinfoId);
      await sleep(REQUEST_DELAY_MS);

      if (!result || result.countries.length === 0) {
        unresolved.add(player.personId);
        console.warn(`No Wikidata citizenship for: ${player.name} (cricinfo ${cricinfoId})`);
        continue;
      }

      resolved.set(player.personId, {
        personId: player.personId,
        name: player.name,
        cricinfoId,
        wikidataLabel: result.label,
        countries: result.countries,
        isOverseas: !result.countries.includes("India"),
      });
    } catch (err) {
      console.warn(`Error resolving ${player.name}: ${(err as Error).message}`);
      unresolved.add(player.personId);
    }

    processed++;
    if (processed % 25 === 0) {
      writeFileSync(OUTPUT_FILE, JSON.stringify(Array.from(resolved.values()), null, 2));
      writeFileSync(UNRESOLVED_FILE, JSON.stringify(Array.from(unresolved), null, 2));
      console.log(
        `Checkpoint: ${resolved.size} resolved, ${unresolved.size} unresolved, ${processed}/${players.length} processed this run`
      );
    }
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(Array.from(resolved.values()), null, 2));
  writeFileSync(UNRESOLVED_FILE, JSON.stringify(Array.from(unresolved), null, 2));
  console.log(`Done. ${resolved.size} resolved -> ${OUTPUT_FILE}`);
  console.log(`${unresolved.size} unresolved -> ${UNRESOLVED_FILE} (needs manual lookup)`);
}

main();
