// Minimal typing for the Cricsheet match JSON schema (data_version 1.x) — only the fields
// this pipeline actually reads. See https://cricsheet.org/format/json/ for the full spec.

export interface CricsheetMatch {
  info: {
    dates: string[]; // ISO date strings, e.g. "2017-04-05"
    teams: [string, string];
    players: Record<string, string[]>; // teamName -> player names who played this match
    registry: { people: Record<string, string> }; // player name -> stable cricsheet person id
    event: {
      name: string;
      stage?: string; // "Final" | "Qualifier 1" | "Qualifier 2" | "Eliminator" | "Semi Final" | ... — absent for regular league matches
    };
    outcome?: { winner?: string; result?: "tie" | "no result"; method?: string };
  };
  innings: CricsheetInnings[];
}

export interface CricsheetInnings {
  team: string;
  overs: CricsheetOver[];
}

export interface CricsheetOver {
  over: number;
  deliveries: CricsheetDelivery[];
}

export interface CricsheetDelivery {
  batter: string;
  bowler: string;
  non_striker: string;
  runs: { batter: number; extras: number; total: number };
  extras?: { byes?: number; legbyes?: number; wides?: number; noballs?: number; penalty?: number };
  wickets?: CricsheetWicket[];
}

export interface CricsheetWicket {
  kind: string; // "caught" | "bowled" | "stumped" | "run out" | "lbw" | ...
  player_out: string;
  fielders?: { name?: string }[];
}
