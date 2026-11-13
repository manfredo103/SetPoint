import type {
  BenchPlayer,
  CompletedSet,
  MatchFormat,
  MatchWinner,
  PlayerRole,
  PlayerSetup,
  RotationPosition,
  ServingTeam,
  SubstitutionPair,
  SystemType
} from './types';

export const STANDARD_SET_TARGET = 25;
export const TIEBREAK_SET_TARGET = 15;
export const RULEBOOK_MIN_LEAD = 2;
export const MAX_TIMEOUTS_PER_SET = 2;
export const MAX_SUBSTITUTIONS_PER_SET = 6;

/**
 * Returns the point target for the given set number & match format.
 * Set 5 in Best-of-5 and Set 3 in Best-of-3 use a 15-point tie-break.
 */
export function getSetTargetPoints(
  setNumber: number,
  format: MatchFormat = 'bo5'
): number {
  if (format === 'bo5' && setNumber >= 5) return TIEBREAK_SET_TARGET;
  if (format === 'bo3' && setNumber >= 3) return TIEBREAK_SET_TARGET;
  return STANDARD_SET_TARGET;
}

/**
 * Returns how many set wins are required to win the match, or null in open mode.
 */
export function getSetsToWin(format: MatchFormat = 'bo5'): number | null {
  if (format === 'bo5') return 3;
  if (format === 'bo3') return 2;
  return null;
}

/**
 * Checks whether either team has reached the target points with at least a 2-point lead.
 */
export function checkSetWin(
  us: number,
  them: number,
  targetPoints: number = STANDARD_SET_TARGET
): 'us' | 'them' | null {
  if (us >= targetPoints && us - them >= RULEBOOK_MIN_LEAD) return 'us';
  if (them >= targetPoints && them - us >= RULEBOOK_MIN_LEAD) return 'them';
  return null;
}

export function computeSetsStanding(sets: CompletedSet[]): { us: number; them: number } {
  let us = 0;
  let them = 0;
  for (const s of sets) {
    if (s.myScore > s.opponentScore) us++;
    else if (s.opponentScore > s.myScore) them++;
  }
  return { us, them };
}

export function determineMatchWinner(
  sets: CompletedSet[],
  currentUs: number,
  currentThem: number
): MatchWinner {
  if (sets.length > 1) {
    const standing = computeSetsStanding(sets);
    if (standing.us > standing.them) return 'us';
    if (standing.them > standing.us) return 'them';
  }
  if (currentUs > currentThem) return 'us';
  if (currentThem > currentUs) return 'them';
  return 'tie';
}

/**
 * Clockwise volleyball rotation: 1 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1.
 */
export function rotateClockwise(rot: RotationPosition): RotationPosition {
  return (rot === 1 ? 6 : rot - 1) as RotationPosition;
}

/**
 * Counter-clockwise rotation: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 1.
 */
export function rotateCounterClockwise(rot: RotationPosition): RotationPosition {
  return ((rot % 6) + 1) as RotationPosition;
}

/**
 * Returns the current court position (1..6) for a lineup array index (0..5) in a given rotation.
 */
export function getCurrentPosForIndex(playerIndex: number, rot: number): RotationPosition {
  return (((playerIndex + rot - 1) % 6) + 1) as RotationPosition;
}

/**
 * Returns the lineup array index (0..5) currently occupying court position (1..6).
 */
export function getIndexForCourtPos(pos: RotationPosition, rot: number): number {
  return (pos - rot + 6) % 6;
}

/**
 * Applies rally point & official side-out rotation for both our team and the opponent.
 */
export function applyRallyPointState(state: {
  myScore: number;
  opponentScore: number;
  servingTeam: ServingTeam;
  currentRotation: RotationPosition;
  opponentRotation: RotationPosition;
}, winningTeam: ServingTeam) {
  const next = { ...state };
  let didSideout = false;

  if (winningTeam === 'us') {
    next.myScore += 1;
    if (next.servingTeam === 'them') {
      next.servingTeam = 'us';
      next.currentRotation = rotateClockwise(next.currentRotation);
      didSideout = true;
    }
  } else {
    next.opponentScore += 1;
    if (next.servingTeam === 'us') {
      next.servingTeam = 'them';
      next.opponentRotation = rotateClockwise(next.opponentRotation);
      didSideout = true;
    }
  }

  return { ...next, didSideout };
}

export function formatPlayerDisplay(p: {
  name: string;
  number?: string;
  role?: string;
}): string {
  const num = p.number?.trim();
  const baseName = num ? `#${num.replace(/^#/, '')} ${p.name}` : p.name;
  return p.role ? `${baseName} (${p.role})` : baseName;
}

export function isSetterRole(role?: string): boolean {
  const r = (role ?? '').toUpperCase();
  return r === 'S' || r === 'S1' || r === 'S2';
}

/**
 * Validates FIVB substitution constraints (max 6 per set & paired player re-entry).
 * Returns a non-blocking warning so coaches can still override if needed.
 */
export function checkSubstitutionRule(params: {
  outgoing: PlayerSetup;
  incoming: BenchPlayer;
  substitutionCount: number;
  subPairs: SubstitutionPair[];
  courtPlayers: PlayerSetup[];
  benchPlayers: BenchPlayer[];
}): { allowed: boolean; warning?: string } {
  const { outgoing, incoming, substitutionCount, subPairs, courtPlayers, benchPlayers } = params;
  const outId = outgoing.id ?? '';
  const inId = incoming.id;

  if (substitutionCount >= MAX_SUBSTITUTIONS_PER_SET) {
    return {
      allowed: true,
      warning: `Bereits ${substitutionCount}/${MAX_SUBSTITUTIONS_PER_SET} Wechsel in diesem Satz durchgeführt (FIVB-Limit erreicht).`
    };
  }

  const allById = new Map<string, string>();
  for (const p of courtPlayers) {
    if (p.id) allById.set(p.id, formatPlayerDisplay(p));
  }
  for (const b of benchPlayers) {
    allById.set(b.id, formatPlayerDisplay(b));
  }

  // Check if outgoing or incoming is already bound to a different FIVB partner
  const existingOutPair = subPairs.find((p) => p.starterId === outId || p.subId === outId);
  if (existingOutPair) {
    const partnerId = existingOutPair.starterId === outId ? existingOutPair.subId : existingOutPair.starterId;
    if (partnerId !== inId) {
      return {
        allowed: true,
        warning: `FIVB-Paarregel: ${formatPlayerDisplay(outgoing)} ist in diesem Satz mit ${allById.get(partnerId) ?? 'anderem Spieler'} gekoppelt.`
      };
    }
  }

  const existingInPair = subPairs.find((p) => p.starterId === inId || p.subId === inId);
  if (existingInPair) {
    const partnerId = existingInPair.starterId === inId ? existingInPair.subId : existingInPair.starterId;
    if (partnerId !== outId) {
      return {
        allowed: true,
        warning: `FIVB-Paarregel: ${formatPlayerDisplay(incoming)} darf nur für ${allById.get(partnerId) ?? 'seinen Startpartner'} eingewechselt werden.`
      };
    }
  }

  return { allowed: true };
}

/**
 * Generates default role templates for 5-1, 6-2, and 4-2 systems.
 */
export function getDefaultLineupForSystem(system: SystemType): PlayerSetup[] {
  if (system === '6-2') {
    return [
      { id: 'starter-1', position: 1, number: '1', name: 'Zuspiel 1', role: 'S1' },
      { id: 'starter-2', position: 2, number: '2', name: 'Außen 1', role: 'OH1' },
      { id: 'starter-3', position: 3, number: '3', name: 'Mitte 1', role: 'MB1' },
      { id: 'starter-4', position: 4, number: '4', name: 'Zuspiel 2', role: 'S2' },
      { id: 'starter-5', position: 5, number: '5', name: 'Außen 2', role: 'OH2' },
      { id: 'starter-6', position: 6, number: '6', name: 'Mitte 2', role: 'MB2' }
    ];
  }
  if (system === '4-2') {
    return [
      { id: 'starter-1', position: 1, number: '1', name: 'Zuspiel 1', role: 'S1' },
      { id: 'starter-2', position: 2, number: '2', name: 'Außen 1', role: 'OH1' },
      { id: 'starter-3', position: 3, number: '3', name: 'Mitte 1', role: 'MB1' },
      { id: 'starter-4', position: 4, number: '4', name: 'Zuspiel 2', role: 'S2' },
      { id: 'starter-5', position: 5, number: '5', name: 'Außen 2', role: 'OH2' },
      { id: 'starter-6', position: 6, number: '6', name: 'Mitte 2', role: 'MB2' }
    ];
  }
  return [
    { id: 'starter-1', position: 1, number: '1', name: 'Zuspieler/in 1', role: 'S' },
    { id: 'starter-2', position: 2, number: '2', name: 'Außenangriff 1', role: 'OH1' },
    { id: 'starter-3', position: 3, number: '3', name: 'Mittelblock 1', role: 'MB1' },
    { id: 'starter-4', position: 4, number: '4', name: 'Diagonal', role: 'OPP' },
    { id: 'starter-5', position: 5, number: '5', name: 'Außenangriff 2', role: 'OH2' },
    { id: 'starter-6', position: 6, number: '6', name: 'Mittelblock 2', role: 'MB2' }
  ];
}

export function detectLineupWarnings(players: PlayerSetup[], system: SystemType): string[] {
  const warnings: string[] = [];
  const counts = new Map<PlayerRole, number>();
  for (const p of players) {
    counts.set(p.role, (counts.get(p.role) ?? 0) + 1);
  }

  if (system === '5-1') {
    const setterCount = (counts.get('S') ?? 0) + (counts.get('S1') ?? 0) + (counts.get('S2') ?? 0);
    if (setterCount === 0) warnings.push('Kein Zuspiel (S) in der Start-6 gewählt.');
    if (setterCount > 1) warnings.push('Im 5-1 System sollte genau 1 Zuspieler (S) auf dem Feld stehen.');
  } else {
    const setterCount = (counts.get('S') ?? 0) + (counts.get('S1') ?? 0) + (counts.get('S2') ?? 0);
    if (setterCount < 2) warnings.push(`Im ${system} System werden üblicherweise 2 Zuspieler (S1 & S2) diagonal aufgestellt.`);
  }

  for (const role of ['OH1', 'OH2', 'MB1', 'MB2', 'OPP'] as PlayerRole[]) {
    if ((counts.get(role) ?? 0) > 1) {
      warnings.push(`Rolle ${role} ist mehrfach vergeben — prüfe für korrekte Taktik-Darstellung.`);
    }
  }

  return warnings;
}
