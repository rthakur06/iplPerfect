// Cricsheet records the team name as it was at the time of the match (e.g. "Delhi Daredevils"
// before the 2019 rebrand). This maps every historical name variant to our stable franchise id
// from src/engine/data/franchises.ts.

export const TEAM_NAME_TO_FRANCHISE_ID: Record<string, string> = {
  "Chennai Super Kings": "CSK",
  "Mumbai Indians": "MI",
  "Royal Challengers Bangalore": "RCB",
  "Royal Challengers Bengaluru": "RCB",
  "Kolkata Knight Riders": "KKR",
  "Sunrisers Hyderabad": "SRH",
  "Delhi Daredevils": "DC",
  "Delhi Capitals": "DC",
  "Kings XI Punjab": "PBKS",
  "Punjab Kings": "PBKS",
  "Rajasthan Royals": "RR",
  "Gujarat Titans": "GT",
  "Lucknow Super Giants": "LSG",
  "Deccan Chargers": "DECCAN",
  "Pune Warriors": "PUNE_WARRIORS",
  "Pune Warriors India": "PUNE_WARRIORS",
  "Kochi Tuskers Kerala": "KOCHI",
  "Rising Pune Supergiant": "RISING_PUNE",
  "Rising Pune Supergiants": "RISING_PUNE",
  "Gujarat Lions": "GUJARAT_LIONS",
};

export function franchiseIdForTeamName(name: string): string {
  const id = TEAM_NAME_TO_FRANCHISE_ID[name];
  if (!id) {
    throw new Error(`Unknown Cricsheet team name "${name}" — add it to TEAM_NAME_TO_FRANCHISE_ID.`);
  }
  return id;
}
