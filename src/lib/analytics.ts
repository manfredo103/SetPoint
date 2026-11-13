import type { RotationPosition, ServingTeam, VolleyballEvent } from './types';

export const OWN_ERROR_IDS = new Set([
  'err_serve',
  'err_rcv',
  'err_atk',
  'atk_blocked',
  'err_set',
  'err_net',
  'err_def'
]);

export const US_POINT_IDS = new Set([
  'ace',
  'kill',
  'tip_kill',
  'block',
  'opp_err_serve',
  'opp_err'
]);

export const THEM_POINT_IDS = new Set([
  'err_serve',
  'err_rcv',
  'err_atk',
  'atk_blocked',
  'err_set',
  'err_net',
  'err_def',
  'opp_kill'
]);

export interface PlayerStatRow {
  player: string;
  kills: number;
  aces: number;
  blocks: number;
  digs: number;
  errors: number;
  passSum: number;
  passCount: number;
  passCounts: Record<0 | 1 | 2 | 3, number>;
  totalContacts: number;
}

export interface RotationStat {
  rot: RotationPosition;
  won: number;
  lost: number;
  diff: number;
  sideoutWon: number;
  sideoutTotal: number;
  sideoutPct: number | null;
}

export interface MatchAnalyticsSummary {
  aces: number;
  kills: number;
  blocks: number;
  ownErrors: number;
  attackErrors: number;
  attackBlocked: number;
  attackEfficiency: number | null;
  sideoutWon: number;
  sideoutTotal: number;
  sideoutPct: number | null;
  breakWon: number;
  breakTotal: number;
  breakPct: number | null;
  passAvg: number | null;
  passAvgFormatted: string;
  passCount: number;
  passCounts: Record<0 | 1 | 2 | 3, number>;
  passPositivePct: number | null;
  passPerfectPct: number | null;
  activeOwnRun: number;
  activeOpponentRun: number;
  playerStats: PlayerStatRow[];
  rotationStats: RotationStat[];
}

function parseScorePair(scoreAfter?: string): number | null {
  if (!scoreAfter) return null;
  const parts = scoreAfter.split(':').map((s) => Number(s.trim()));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return parts[0] + parts[1];
}

/**
 * Normalizes event order to chronological (oldest-first) regardless of whether
 * the input array comes from the live newest-first feed or an archive.
 */
export function toChronologicalEvents(events: VolleyballEvent[]): VolleyballEvent[] {
  if (events.length <= 1) return [...events];

  const firstIso = events[0]?.isoTimestamp;
  const lastIso = events[events.length - 1]?.isoTimestamp;
  if (firstIso && lastIso && firstIso !== lastIso) {
    return firstIso > lastIso ? [...events].reverse() : [...events];
  }

  // Fallback: inspect setNumber or scoreAfter totals
  const scored = events.filter((e) => e.scoreAfter);
  if (scored.length >= 2) {
    const firstSet = scored[0].setNumber ?? 1;
    const lastSet = scored[scored.length - 1].setNumber ?? 1;
    if (firstSet !== lastSet) {
      return firstSet > lastSet ? [...events].reverse() : [...events];
    }
    const firstTotal = parseScorePair(scored[0].scoreAfter) ?? 0;
    const lastTotal = parseScorePair(scored[scored.length - 1].scoreAfter) ?? 0;
    if (firstTotal > lastTotal) return [...events].reverse();
  }

  return [...events];
}

function getPointWinner(ev: VolleyballEvent): ServingTeam | null {
  if (ev.actionId && US_POINT_IDS.has(ev.actionId)) return 'us';
  if (ev.actionId && THEM_POINT_IDS.has(ev.actionId)) return 'them';
  if (!ev.actionId && ev.scoreAfter && ev.actionId !== 'manual_end') {
    if (ev.team === 'myTeam') return 'us';
    if (ev.team === 'opponent') return 'them';
  }
  return null;
}

export function computeMatchAnalytics(
  events: VolleyballEvent[],
  options?: {
    setFilter?: 'all' | number;
    initialServe?: ServingTeam;
  }
): MatchAnalyticsSummary {
  const setFilter = options?.setFilter ?? 'all';
  const chronologicalAll = toChronologicalEvents(events);
  const filtered =
    setFilter === 'all'
      ? chronologicalAll
      : chronologicalAll.filter((ev) => (ev.setNumber ?? 1) === setFilter);

  let aces = 0;
  let kills = 0;
  let blocks = 0;
  let ownErrors = 0;
  let attackErrors = 0;
  let attackBlocked = 0;
  let sideoutWon = 0;
  let sideoutTotal = 0;
  let breakWon = 0;
  let breakTotal = 0;
  let passSum = 0;
  let passCount = 0;
  const passCounts: Record<0 | 1 | 2 | 3, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

  let activeOwnRun = 0;
  let activeOpponentRun = 0;

  const playerMap = new Map<string, PlayerStatRow>();
  const rotMap: Record<number, { won: number; lost: number; sideoutWon: number; sideoutTotal: number }> = {
    1: { won: 0, lost: 0, sideoutWon: 0, sideoutTotal: 0 },
    2: { won: 0, lost: 0, sideoutWon: 0, sideoutTotal: 0 },
    3: { won: 0, lost: 0, sideoutWon: 0, sideoutTotal: 0 },
    4: { won: 0, lost: 0, sideoutWon: 0, sideoutTotal: 0 },
    5: { won: 0, lost: 0, sideoutWon: 0, sideoutTotal: 0 },
    6: { won: 0, lost: 0, sideoutWon: 0, sideoutTotal: 0 }
  };

  let lastSetNumber: number | undefined;
  let inferredServe: ServingTeam = options?.initialServe ?? 'us';

  for (const ev of filtered) {
    const evSet = ev.setNumber ?? 1;
    if (lastSetNumber !== undefined && evSet !== lastSetNumber) {
      activeOwnRun = 0;
      activeOpponentRun = 0;
      inferredServe = inferredServe === 'us' ? 'them' : 'us';
    }
    lastSetNumber = evSet;

    if (ev.actionId === 'ace') aces++;
    if (ev.actionId === 'kill' || ev.actionId === 'tip_kill') kills++;
    if (ev.actionId === 'block') blocks++;
    if (ev.actionId === 'err_atk') attackErrors++;
    if (ev.actionId === 'atk_blocked') attackBlocked++;
    if (ev.actionId && OWN_ERROR_IDS.has(ev.actionId)) ownErrors++;

    if (ev.passRating !== undefined) {
      passSum += ev.passRating;
      passCount++;
      passCounts[ev.passRating] = (passCounts[ev.passRating] ?? 0) + 1;
    }

    const pointWinner = getPointWinner(ev);
    const rotBucket = rotMap[ev.rotation];

    if (pointWinner === 'us') {
      const serveBefore: ServingTeam =
        ev.wasServing ??
        ev.scoreSnapshot?.servingTeam ??
        ev.undoSnapshot?.servingTeam ??
        (ev.isSideout ? 'them' : inferredServe);

      if (serveBefore === 'them') {
        sideoutTotal += 1;
        sideoutWon += 1;
        if (rotBucket) {
          rotBucket.sideoutTotal += 1;
          rotBucket.sideoutWon += 1;
        }
      } else {
        breakTotal += 1;
        breakWon += 1;
      }

      if (rotBucket) rotBucket.won += 1;
      inferredServe = 'us';
      activeOwnRun += 1;
      activeOpponentRun = 0;
    } else if (pointWinner === 'them') {
      const serveBefore: ServingTeam =
        ev.wasServing ??
        ev.scoreSnapshot?.servingTeam ??
        ev.undoSnapshot?.servingTeam ??
        inferredServe;

      if (serveBefore === 'them') {
        sideoutTotal += 1;
        if (rotBucket) rotBucket.sideoutTotal += 1;
      } else {
        breakTotal += 1;
      }

      if (rotBucket) rotBucket.lost += 1;
      inferredServe = 'them';
      activeOpponentRun += 1;
      activeOwnRun = 0;
    }

    // Player stats (own team only)
    if (
      ev.player &&
      ev.team !== 'opponent' &&
      ev.category !== 'substitution' &&
      ev.category !== 'timeout'
    ) {
      let row = playerMap.get(ev.player);
      if (!row) {
        row = {
          player: ev.player,
          kills: 0,
          aces: 0,
          blocks: 0,
          digs: 0,
          errors: 0,
          passSum: 0,
          passCount: 0,
          passCounts: { 0: 0, 1: 0, 2: 0, 3: 0 },
          totalContacts: 0
        };
        playerMap.set(ev.player, row);
      }
      row.totalContacts += 1;
      if (ev.actionId === 'kill' || ev.actionId === 'tip_kill') row.kills += 1;
      if (ev.actionId === 'ace') row.aces += 1;
      if (ev.actionId === 'block') row.blocks += 1;
      if (ev.actionId === 'def_dig') row.digs += 1;
      if (ev.actionId && OWN_ERROR_IDS.has(ev.actionId)) row.errors += 1;
      if (ev.passRating !== undefined) {
        row.passSum += ev.passRating;
        row.passCount += 1;
        row.passCounts[ev.passRating] = (row.passCounts[ev.passRating] ?? 0) + 1;
      }
    }
  }

  const playerStats = Array.from(playerMap.values()).sort(
    (a, b) =>
      b.kills + b.aces + b.blocks - (a.kills + a.aces + a.blocks) ||
      b.totalContacts - a.totalContacts
  );

  const rotationStats: RotationStat[] = ([1, 2, 3, 4, 5, 6] as RotationPosition[]).map((rot) => {
    const r = rotMap[rot];
    return {
      rot,
      won: r.won,
      lost: r.lost,
      diff: r.won - r.lost,
      sideoutWon: r.sideoutWon,
      sideoutTotal: r.sideoutTotal,
      sideoutPct: r.sideoutTotal > 0 ? Math.round((r.sideoutWon / r.sideoutTotal) * 100) : null
    };
  });

  const attackAttempts = kills + attackErrors + attackBlocked;
  const passAvg = passCount > 0 ? passSum / passCount : null;

  return {
    aces,
    kills,
    blocks,
    ownErrors,
    attackErrors,
    attackBlocked,
    attackEfficiency:
      attackAttempts > 0
        ? Math.round(((kills - attackErrors - attackBlocked) / attackAttempts) * 100)
        : null,
    sideoutWon,
    sideoutTotal,
    sideoutPct: sideoutTotal > 0 ? Math.round((sideoutWon / sideoutTotal) * 100) : null,
    breakWon,
    breakTotal,
    breakPct: breakTotal > 0 ? Math.round((breakWon / breakTotal) * 100) : null,
    passAvg,
    passAvgFormatted: passAvg !== null ? passAvg.toFixed(2) : '–',
    passCount,
    passCounts,
    passPositivePct:
      passCount > 0 ? Math.round(((passCounts[2] + passCounts[3]) / passCount) * 100) : null,
    passPerfectPct: passCount > 0 ? Math.round((passCounts[3] / passCount) * 100) : null,
    activeOwnRun,
    activeOpponentRun,
    playerStats,
    rotationStats
  };
}
