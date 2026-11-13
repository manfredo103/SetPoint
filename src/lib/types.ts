export type EventCategory =
  | 'serve'
  | 'attack'
  | 'block'
  | 'reception'
  | 'setting'
  | 'defense'
  | 'substitution'
  | 'timeout'
  | 'error'
  | 'note';
export type EventQuality = 'good' | 'neutral' | 'bad';
export type RotationPosition = 1 | 2 | 3 | 4 | 5 | 6;
export type PlayerRole = 'S' | 'S1' | 'S2' | 'OH1' | 'OH2' | 'MB1' | 'MB2' | 'OPP' | 'L';
export type SystemType = '5-1' | '6-2' | '4-2';
export type FormationMode = 'base' | 'receive';
export type ServingTeam = 'us' | 'them';
export type MatchFormat = 'bo5' | 'bo3' | 'open';

export interface Player {
  number: string;
  name: string;
  role: PlayerRole;
}

export interface PlayerSetup {
  id?: string;
  position: RotationPosition;
  number?: string;
  name: string;
  role: PlayerRole;
}

export interface BenchPlayer {
  id: string;
  number?: string;
  name: string;
  role: PlayerRole;
  isLibero: boolean;
}

export interface SubstitutionPair {
  starterId: string;
  subId: string;
}

export interface PlayerSelection {
  team: 'myTeam' | 'opponent';
  position: RotationPosition;
  player: string;
  playerNum?: string;
  playerIndex: number;
  rotation: number;
  row: 'front' | 'back';
  isServer: boolean;
}

export interface MatchUndoSnapshot {
  myScore: number;
  opponentScore: number;
  servingTeam: ServingTeam;
  rotation: RotationPosition;
  opponentRotation: RotationPosition;
  courtPlayers: PlayerSetup[];
  benchPlayers: BenchPlayer[];
  substitutionCount: number;
  subPairs: SubstitutionPair[];
  activeLiberoId: string | null;
  liberoAutoSwap: boolean;
  timeoutsUs: number;
  timeoutsThem: number;
  setEndedManually: boolean;
  matchEndedManually: boolean;
  continuePastTarget: boolean;
}

export interface VolleyballEvent {
  id: string;
  timestamp: string; // Anzeige-Zeitstempel (z.B. "15:24:09")
  isoTimestamp?: string; // ISO 8601 UTC String für Datenbank / Time-Series
  setNumber?: number; // Satznummer (1..5)
  actionId?: string;
  playerNum?: number | string;
  player?: string;
  category: EventCategory;
  quality: EventQuality;
  action: string;
  rotation: RotationPosition;
  position?: RotationPosition;
  row?: 'front' | 'back';
  team?: 'myTeam' | 'opponent';
  wasServing?: ServingTeam;
  passRating?: 0 | 1 | 2 | 3;
  note?: string;
  scoreAfter?: string;
  isSideout?: boolean;
  isMatchEnd?: boolean;
  scoreSnapshot?: {
    myScore: number;
    opponentScore: number;
    servingTeam: ServingTeam;
    rotation: RotationPosition;
  };
  undoSnapshot?: MatchUndoSnapshot;
}

export interface CompletedSet {
  setNumber: number;
  myScore: number;
  opponentScore: number;
}

export type MatchWinner = 'us' | 'them' | 'tie';
export type MatchEndReason = 'rulebook' | 'manual';

export interface VolleyballMatchPayload {
  matchId: string;
  startedAt: string;
  endedAt: string;
  teamName: string;
  opponentName: string;
  system: SystemType;
  matchFormat?: MatchFormat;
  initialServe?: ServingTeam;
  winner: MatchWinner;
  endReason: MatchEndReason;
  sets: CompletedSet[];
  players?: PlayerSetup[];
  bench?: BenchPlayer[];
  opponentLineup?: string[];
  timeoutsUs?: number;
  timeoutsThem?: number;
  savedLocallyAt?: string;
  syncState?: 'local' | 'synced';
  events: VolleyballEvent[];
}

export interface SavedMatchSummary {
  matchId: string;
  startedAt: string;
  endedAt: string;
  teamName: string;
  opponentName: string;
  system: string;
  winner: MatchWinner | string;
  endReason: string;
  setsUs: number;
  setsThem: number;
  setsSummary: string;
  totalPointsUs: number;
  totalPointsThem: number;
  aces: number;
  kills: number;
  blocks: number;
  errorsOwn: number;
  passAvg: number;
  passCount: number;
  eventCount: number;
}

export interface VolleyballSyncPayload {
  matchId: string;
  team: string;
  opponent: string;
  events: VolleyballEvent[];
}

export interface MatchSetup {
  teamName: string;
  opponentName: string;
  system: SystemType;
  matchFormat?: MatchFormat;
  startingRotation?: RotationPosition;
  lineup: string[];
  players?: PlayerSetup[];
  bench?: BenchPlayer[];
  opponentLineup?: string[];
  initialServe?: ServingTeam;
}

export interface TeamPreset {
  id: string;
  name: string;
  teamName: string;
  system: SystemType;
  players: PlayerSetup[];
  bench: BenchPlayer[];
  updatedAt: string;
}

export type LegalTab = 'privacy' | 'terms' | 'cookies' | 'impressum';
