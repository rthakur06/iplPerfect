import type { Franchise } from "../types";

// The valid (team, season) table. This is what gates the wheel pool and the
// team-reroll/year-reroll logic: we never roll a (franchise, year) pair that
// didn't actually exist (e.g. no "Pune Warriors 2015" — they folded after 2013).
//
// activeSeasons are inclusive years the franchise fielded a team in that IPL edition.
// 2009 and 2014 were played in South Africa/UAE respectively but still count as
// normal IPL seasons for every franchise that existed that year.
//
// LATEST_SEASON needs bumping by hand each year once that season's data is available —
// it intentionally isn't derived from the current date, since the new season's Cricsheet
// data won't exist yet at the start of the calendar year.
const LATEST_SEASON = 2026;

export const FRANCHISES: Franchise[] = [
  {
    id: "CSK",
    name: "Chennai Super Kings",
    activeSeasons: range(2008, LATEST_SEASON).filter((y) => y !== 2016 && y !== 2017), // suspended 2016-17
  },
  {
    id: "MI",
    name: "Mumbai Indians",
    activeSeasons: range(2008, LATEST_SEASON),
  },
  {
    id: "RCB",
    name: "Royal Challengers Bengaluru",
    activeSeasons: range(2008, LATEST_SEASON),
  },
  {
    id: "KKR",
    name: "Kolkata Knight Riders",
    activeSeasons: range(2008, LATEST_SEASON),
  },
  {
    id: "SRH",
    name: "Sunrisers Hyderabad",
    activeSeasons: range(2013, LATEST_SEASON), // replaced Deccan Chargers from 2013
  },
  {
    id: "DC",
    name: "Delhi Capitals",
    activeSeasons: range(2008, LATEST_SEASON), // Delhi Daredevils until 2018 rebrand, same franchise id
  },
  {
    id: "PBKS",
    name: "Punjab Kings",
    activeSeasons: range(2008, LATEST_SEASON), // Kings XI Punjab until 2021 rebrand
  },
  {
    id: "RR",
    name: "Rajasthan Royals",
    activeSeasons: range(2008, LATEST_SEASON).filter((y) => y !== 2016 && y !== 2017), // suspended 2016-17
  },
  {
    id: "GT",
    name: "Gujarat Titans",
    activeSeasons: range(2022, LATEST_SEASON),
  },
  {
    id: "LSG",
    name: "Lucknow Super Giants",
    activeSeasons: range(2022, LATEST_SEASON),
  },
  // Defunct franchises
  {
    id: "DECCAN",
    name: "Deccan Chargers",
    activeSeasons: range(2008, 2012),
  },
  {
    id: "PUNE_WARRIORS",
    name: "Pune Warriors India",
    activeSeasons: range(2011, 2013),
  },
  {
    id: "KOCHI",
    name: "Kochi Tuskers Kerala",
    activeSeasons: [2011],
  },
  {
    id: "RISING_PUNE",
    name: "Rising Pune Supergiant",
    activeSeasons: [2016, 2017],
  },
  {
    id: "GUJARAT_LIONS",
    name: "Gujarat Lions",
    activeSeasons: [2016, 2017],
  },
];

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let y = start; y <= end; y++) out.push(y);
  return out;
}

export function getFranchise(id: string): Franchise | undefined {
  return FRANCHISES.find((f) => f.id === id);
}

export function isValidTeamSeason(franchiseId: string, season: number): boolean {
  return getFranchise(franchiseId)?.activeSeasons.includes(season) ?? false;
}

/** All franchises that existed in a given season — used by the year-reroll (same year, swap team). */
export function franchisesActiveIn(season: number): Franchise[] {
  return FRANCHISES.filter((f) => f.activeSeasons.includes(season));
}

/** All seasons a given franchise existed — used by the team-reroll (same team, swap year). */
export function seasonsFor(franchiseId: string): number[] {
  return getFranchise(franchiseId)?.activeSeasons ?? [];
}
