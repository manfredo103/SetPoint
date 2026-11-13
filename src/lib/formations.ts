import type { FormationPlayer } from './validateFormation';
import type { PlayerRole, PlayerSetup, RotationPosition, SystemType } from './types';
import { CUSTOM_FORMATIONS_STORAGE_KEY } from './api';
import { isSetterRole } from './matchEngine';

export type PhaseCoords = Record<string, { x: number; y: number }>;
export type RotationConfig = { receive: PhaseCoords; transition: PhaseCoords };
export type TacticalPhase = 'receive' | 'transition';

export const ALL_ROSTER_KEYS = ['S', 'S1', 'S2', 'OH1', 'MB1', 'OPP', 'OH2', 'MB2', 'L'] as const;
export type PlayerKey = (typeof ALL_ROSTER_KEYS)[number];

export interface LiberoSwapInfo {
  /** Which MB is currently in the front row (Pos 2, 3, or 4) on the court */
  activeFrontMB: 'MB1' | 'MB2';
  frontMBPos: RotationPosition;
  /** Which MB rotated to the back row (Pos 1, 6, or 5) and is replaced by Libero (L) */
  replacedBackMB: 'MB1' | 'MB2';
  liberoPos: RotationPosition;
  /** Explanation of the FIVB Libero swap for this rotation */
  description: string;
}

export const LIBERO_SWAP_BY_ROTATION: Record<number, LiberoSwapInfo> = {
  1: {
    activeFrontMB: 'MB1',
    frontMBPos: 3,
    replacedBackMB: 'MB2',
    liberoPos: 6,
    description: 'MB1 am Netz (Pos 3) • Libero (L) ersetzt MB2 im Hinterfeld (Pos 6)'
  },
  6: {
    activeFrontMB: 'MB1',
    frontMBPos: 2,
    replacedBackMB: 'MB2',
    liberoPos: 5,
    description: 'MB1 am Netz (Pos 2) • Libero (L) ersetzt MB2 im Hinterfeld (Pos 5)'
  },
  5: {
    activeFrontMB: 'MB2',
    frontMBPos: 4,
    replacedBackMB: 'MB1',
    liberoPos: 1,
    description: 'FIVB-Wechsel: L verlässt Pos 4 für MB2 (Vorderfeld) & ersetzt MB1 auf Pos 1 (Hinterfeld)'
  },
  4: {
    activeFrontMB: 'MB2',
    frontMBPos: 3,
    replacedBackMB: 'MB1',
    liberoPos: 6,
    description: 'MB2 am Netz (Pos 3) • Libero (L) ersetzt MB1 im Hinterfeld (Pos 6)'
  },
  3: {
    activeFrontMB: 'MB2',
    frontMBPos: 2,
    replacedBackMB: 'MB1',
    liberoPos: 5,
    description: 'MB2 am Netz (Pos 2) • Libero (L) ersetzt MB1 im Hinterfeld (Pos 5)'
  },
  2: {
    activeFrontMB: 'MB1',
    frontMBPos: 4,
    replacedBackMB: 'MB2',
    liberoPos: 1,
    description: 'FIVB-Wechsel: L verlässt Pos 4 für MB1 (Vorderfeld) & ersetzt MB2 auf Pos 1 (Hinterfeld)'
  }
};

/**
 * Curated 5-1 tactical formations for all 6 rotations (Läufer 1–6)
 * across 'receive' (Annahme) and 'transition' (Angriffsvorbereitung).
 * X: 0 = Left sideline, 100 = Right sideline
 * Y: 0 = Net, 100 = Baseline
 */
export const formations: Record<number, RotationConfig> = {
  1: { // Läufer 1: S auf Pos 1 | MB1 vorne (Pos 3), L für MB2 hinten (Pos 6)
    receive: {
      S: { x: 85, y: 75 },
      OH1: { x: 75, y: 65 },
      MB1: { x: 30, y: 15 },
      OPP: { x: 10, y: 40 },
      OH2: { x: 15, y: 75 },
      L: { x: 45, y: 75 }
    },
    transition: {
      S: { x: 65, y: 12 },
      OH1: { x: 10, y: 12 },
      MB1: { x: 50, y: 12 },
      OPP: { x: 90, y: 12 },
      OH2: { x: 50, y: 55 },
      L: { x: 25, y: 40 }
    }
  },
  2: { // Läufer 2: S auf Pos 2 | MB1 vorne (Pos 4), L für MB2 hinten (Pos 1)
    receive: {
      S: { x: 80, y: 20 },
      OH1: { x: 20, y: 65 },
      MB1: { x: 10, y: 15 },
      OPP: { x: 40, y: 90 },
      OH2: { x: 50, y: 75 },
      L: { x: 75, y: 65 }
    },
    transition: {
      S: { x: 65, y: 12 },
      OH1: { x: 10, y: 12 },
      MB1: { x: 50, y: 12 },
      OPP: { x: 90, y: 40 },
      OH2: { x: 50, y: 55 },
      L: { x: 25, y: 40 }
    }
  },
  3: { // Läufer 3: S auf Pos 3 | MB2 vorne (Pos 2), L für MB1 hinten (Pos 5)
    receive: {
      S: { x: 80, y: 10 },
      OH1: { x: 20, y: 65 },
      MB2: { x: 90, y: 20 },
      OPP: { x: 60, y: 90 },
      OH2: { x: 75, y: 75 },
      L: { x: 45, y: 75 }
    },
    transition: {
      S: { x: 65, y: 12 },
      OH1: { x: 10, y: 12 },
      MB2: { x: 50, y: 12 },
      OPP: { x: 90, y: 40 },
      OH2: { x: 50, y: 55 },
      L: { x: 25, y: 40 }
    }
  },
  4: { // Läufer 4: S auf Pos 4 | MB2 vorne (Pos 3), L für MB1 hinten (Pos 6)
    receive: {
      S: { x: 7, y: 10 },
      OH2: { x: 25, y: 65 },
      MB2: { x: 17, y: 20 },
      OH1: { x: 50, y: 75 },
      OPP: { x: 92, y: 90 },
      L: { x: 75, y: 65 }
    },
    transition: {
      S: { x: 65, y: 12 },
      OH2: { x: 10, y: 12 },
      MB2: { x: 50, y: 12 },
      OH1: { x: 25, y: 65 },
      OPP: { x: 90, y: 40 },
      L: { x: 55, y: 72 }
    }
  },
  5: { // Läufer 5: S auf Pos 5 | MB2 vorne (Pos 4), L für MB1 hinten (Pos 1)
    receive: {
      S: { x: 40, y: 30 },
      MB2: { x: 7, y: 20 },
      OH2: { x: 25, y: 65 },
      OH1: { x: 50, y: 75 },
      OPP: { x: 90, y: 15 },
      L: { x: 75, y: 65 }
    },
    transition: {
      S: { x: 65, y: 12 },
      MB2: { x: 50, y: 12 },
      OH2: { x: 10, y: 12 },
      OH1: { x: 50, y: 45 },
      OPP: { x: 90, y: 12 },
      L: { x: 25, y: 40 }
    }
  },
  6: { // Läufer 6: S auf Pos 6 | MB1 vorne (Pos 2), L für MB2 hinten (Pos 5)
    receive: {
      S: { x: 65, y: 15 },
      MB1: { x: 85, y: 25 },
      OPP: { x: 75, y: 10 },
      OH2: { x: 20, y: 55 },
      L: { x: 45, y: 75 },
      OH1: { x: 78, y: 75 }
    },
    transition: {
      S: { x: 65, y: 12 },
      MB1: { x: 50, y: 12 },
      OPP: { x: 90, y: 12 },
      OH2: { x: 10, y: 12 },
      L: { x: 25, y: 40 },
      OH1: { x: 50, y: 45 },
    }
  }
};

export const ROTATION_NOMINAL_POS: Record<number, Partial<Record<PlayerKey, RotationPosition>>> = {
  1: { S: 1, OH1: 2, MB1: 3, OPP: 4, OH2: 5, L: 6 },
  2: { L: 1, S: 2, OH1: 3, MB1: 4, OPP: 5, OH2: 6 },
  3: { OH2: 1, MB2: 2, S: 3, OH1: 4, L: 5, OPP: 6 },
  4: { OPP: 1, OH2: 2, MB2: 3, S: 4, OH1: 5, L: 6 },
  5: { L: 1, OPP: 2, OH2: 3, MB2: 4, S: 5, OH1: 6 },
  6: { OH1: 1, MB1: 2, OPP: 3, OH2: 4, L: 5, S: 6 }
};

export function getPhasePlayers(
  rotation: number,
  phase: TacticalPhase = 'receive'
): FormationPlayer[] {
  const rotConfig = formations[rotation] ?? formations[1];
  const phaseCoords = rotConfig[phase];
  const posMap = ROTATION_NOMINAL_POS[rotation] ?? ROTATION_NOMINAL_POS[1];

  return (Object.keys(posMap) as PlayerKey[]).map((key) => ({
    pos: posMap[key]!,
    label: key,
    x: phaseCoords[key].x,
    y: phaseCoords[key].y
  }));
}

export const getDefaultFormation = (rotation: number): FormationPlayer[] =>
  getPhasePlayers(rotation, 'receive');

interface CourtSlot {
  pos: RotationPosition;
  role: PlayerRole;
  isBackRow: boolean;
}

function clampCoord(val: number, min = 6, max = 94): number {
  return Math.min(max, Math.max(min, Math.round(val)));
}

function isStandard51Order(courtPlayers: PlayerSetup[]): boolean {
  if (courtPlayers.length !== 6) return false;
  const expected: PlayerRole[] = ['S', 'OH1', 'MB1', 'OPP', 'OH2', 'MB2'];
  return courtPlayers.every((p, idx) => p.role === expected[idx]);
}

function enforceReceiveConstraints(byPos: Map<RotationPosition, { x: number; y: number }>): void {
  const MIN_DX = 11;
  const MIN_DY = 14;

  for (let iter = 0; iter < 8; iter++) {
    // Enforce front above back in each vertical lane: (4,5), (3,6), (2,1)
    for (const [f, b] of [
      [4, 5],
      [3, 6],
      [2, 1]
    ] as [RotationPosition, RotationPosition][]) {
      const pf = byPos.get(f)!;
      const pb = byPos.get(b)!;
      if (pf.y > pb.y - MIN_DY) {
        const mid = (pf.y + pb.y) / 2;
        pf.y = clampCoord(mid - MIN_DY / 2, 8, 80);
        pb.y = clampCoord(pf.y + MIN_DY, 22, 92);
        if (pf.y >= pb.y) {
          pf.y = Math.max(8, pb.y - MIN_DY);
        }
      }
    }

    // Enforce left < center < right in both rows
    for (const [l, c, r] of [
      [4, 3, 2],
      [5, 6, 1]
    ] as [RotationPosition, RotationPosition, RotationPosition][]) {
      const pl = byPos.get(l)!;
      const pc = byPos.get(c)!;
      const pr = byPos.get(r)!;

      if (pl.x > pc.x - MIN_DX) {
        const mid = (pl.x + pc.x) / 2;
        pl.x = clampCoord(mid - MIN_DX / 2, 6, 70);
        pc.x = clampCoord(pl.x + MIN_DX, 18, 82);
      }
      if (pc.x > pr.x - MIN_DX) {
        const mid = (pc.x + pr.x) / 2;
        pc.x = clampCoord(mid - MIN_DX / 2, 18, 82);
        pr.x = clampCoord(pc.x + MIN_DX, 30, 94);
      }
      if (pl.x >= pc.x) pl.x = clampCoord(pc.x - MIN_DX, 6, 70);
      if (pc.x >= pr.x) pr.x = clampCoord(pc.x + MIN_DX, 30, 94);
    }
  }
}

function getActiveSetterPos(slots: CourtSlot[], system: SystemType): RotationPosition {
  const setters = slots.filter((s) => isSetterRole(s.role));
  if (setters.length === 0) return 1;
  if (system === '6-2') {
    return (setters.find((s) => s.isBackRow) ?? setters[0]).pos;
  }
  if (system === '4-2') {
    return (setters.find((s) => !s.isBackRow) ?? setters[0]).pos;
  }
  return setters[0].pos;
}

function passerPriority(slot: CourtSlot, setterPos: RotationPosition): number {
  if (slot.pos === setterPos) return -100;
  if (slot.role === 'L') return 100;
  if (slot.role === 'OH1' || slot.role === 'OH2') return slot.isBackRow ? 85 : 75;
  if (isSetterRole(slot.role) && slot.isBackRow) return 60; // Back-row S2 in 4-2 defends/passes
  if (slot.role === 'OPP' && slot.isBackRow) return 45;
  if (slot.role === 'OPP') return 20;
  if (slot.role === 'MB1' || slot.role === 'MB2') return slot.isBackRow ? 35 : 5;
  return 30;
}

/**
 * Generates FIVB-legal receive or realistic attack-transition formations
 * dynamically from the active lineup, supporting 5-1 (both S-OH-MB & S-MB-OH), 6-2, and 4-2.
 */
export function getPhasePlayersForLineup(params: {
  courtPlayers?: PlayerSetup[];
  rotation: number;
  phase: TacticalPhase;
  system?: SystemType;
  hasLibero?: boolean;
}): FormationPlayer[] {
  const { courtPlayers, rotation, phase, system = '5-1', hasLibero = true } = params;

  if (!courtPlayers || courtPlayers.length !== 6 || (system === '5-1' && isStandard51Order(courtPlayers))) {
    const base = getPhasePlayers(rotation, phase);
    if (!hasLibero) {
      const swap = LIBERO_SWAP_BY_ROTATION[rotation] ?? LIBERO_SWAP_BY_ROTATION[1];
      return base.map((p) => (p.label === 'L' ? { ...p, label: swap.replacedBackMB } : p));
    }
    return base;
  }

  const slots: CourtSlot[] = ([1, 2, 3, 4, 5, 6] as RotationPosition[]).map((pos) => {
    const idx = (pos - rotation + 6) % 6;
    const raw = courtPlayers[idx];
    const isBackRow = pos === 1 || pos === 5 || pos === 6;
    const isMB = raw.role === 'MB1' || raw.role === 'MB2';
    const effectiveRole: PlayerRole = hasLibero && isBackRow && isMB ? 'L' : raw.role;
    return { pos, role: effectiveRole, isBackRow };
  });

  const setterPos = getActiveSetterPos(slots, system);

  if (phase === 'transition') {
    const coords = new Map<RotationPosition, { x: number; y: number }>();
    const frontNonSetters = slots.filter((s) => !s.isBackRow && s.pos !== setterPos);
    const backNonSetters = slots.filter((s) => s.isBackRow && s.pos !== setterPos);

    // Setter goes to target right-of-center
    coords.set(setterPos, { x: 65, y: 12 });

    // Assign front-row attackers to Left (x:10), Middle (x:50), Right (x:90)
    const frontLanes = [
      { roleCheck: (r: PlayerRole) => r === 'OH1' || r === 'OH2', x: 10, y: 12 },
      { roleCheck: (r: PlayerRole) => r === 'MB1' || r === 'MB2', x: 50, y: 12 },
      { roleCheck: (r: PlayerRole) => r === 'OPP' || isSetterRole(r), x: 90, y: 12 }
    ];
    const usedFront = new Set<RotationPosition>();
    const remainingFrontSpots = [10, 50, 90];

    for (const lane of frontLanes) {
      const match = frontNonSetters.find((s) => !usedFront.has(s.pos) && lane.roleCheck(s.role));
      if (match) {
        coords.set(match.pos, { x: lane.x, y: lane.y });
        usedFront.add(match.pos);
        const spotIdx = remainingFrontSpots.indexOf(lane.x);
        if (spotIdx >= 0) remainingFrontSpots.splice(spotIdx, 1);
      }
    }
    for (const s of frontNonSetters) {
      if (!usedFront.has(s.pos)) {
        const x = remainingFrontSpots.shift() ?? 30;
        coords.set(s.pos, { x, y: 12 });
      }
    }

    // Assign back-row defense / pipe / right-back attack
    const backXSlots = [22, 52, 82];
    let backIdx = 0;
    for (const s of backNonSetters) {
      if (s.role === 'OPP' && system === '5-1') {
        coords.set(s.pos, { x: 88, y: 40 });
      } else if (s.role === 'L') {
        coords.set(s.pos, { x: 52, y: 72 });
      } else {
        const x = backXSlots[backIdx % backXSlots.length];
        backIdx += 1;
        coords.set(s.pos, { x, y: 66 });
      }
    }

    return slots.map((s) => ({
      pos: s.pos,
      label: s.role,
      x: coords.get(s.pos)?.x ?? 50,
      y: coords.get(s.pos)?.y ?? 50
    }));
  }

  // RECEIVE PHASE
  const passerCandidates = [...slots].sort(
    (a, b) => passerPriority(b, setterPos) - passerPriority(a, setterPos)
  );
  const passerPositions = new Set(passerCandidates.slice(0, 3).map((s) => s.pos));
  const laneX: Record<RotationPosition, number> = {
    4: 18,
    5: 18,
    3: 50,
    6: 50,
    2: 82,
    1: 82
  };

  const byPos = new Map<RotationPosition, { x: number; y: number }>();

  for (const s of slots) {
    if (s.pos === setterPos) {
      if (!s.isBackRow) {
        const x = s.pos === 4 ? 12 : s.pos === 3 ? 65 : 85;
        byPos.set(s.pos, { x, y: 14 });
      } else {
        const x = s.pos === 5 ? 25 : s.pos === 6 ? 60 : 86;
        byPos.set(s.pos, { x, y: 34 });
      }
    } else if (passerPositions.has(s.pos)) {
      byPos.set(s.pos, {
        x: laneX[s.pos],
        y: s.isBackRow ? 74 : 58
      });
    } else if (!s.isBackRow) {
      // Front-row MB / OPP out of receive
      const x = s.pos === 4 ? 10 : s.pos === 2 ? 90 : 48;
      byPos.set(s.pos, { x, y: 16 });
    } else {
      // Back-row non-passer (e.g. OPP tucked near baseline)
      byPos.set(s.pos, {
        x: laneX[s.pos],
        y: 88
      });
    }
  }

  enforceReceiveConstraints(byPos);

  return slots.map((s) => ({
    pos: s.pos,
    label: s.role,
    x: byPos.get(s.pos)?.x ?? 50,
    y: byPos.get(s.pos)?.y ?? 50
  }));
}

// --- CUSTOM FORMATION PERSISTENCE ---

type SavedFormationMap = Record<string, PhaseCoords>;

function readSavedFormations(): SavedFormationMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CUSTOM_FORMATIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as SavedFormationMap) : {};
  } catch {
    return {};
  }
}

export function getCustomFormationKey(
  system: SystemType,
  rotation: number,
  phase: TacticalPhase
): string {
  return `${system}:R${rotation}:${phase}`;
}

export function loadCustomFormationCoords(
  system: SystemType,
  rotation: number,
  phase: TacticalPhase
): PhaseCoords | null {
  const map = readSavedFormations();
  return map[getCustomFormationKey(system, rotation, phase)] ?? null;
}

export function saveCustomFormationCoords(
  system: SystemType,
  rotation: number,
  phase: TacticalPhase,
  players: FormationPlayer[]
): void {
  if (typeof window === 'undefined') return;
  const map = readSavedFormations();
  const coords: PhaseCoords = {};
  for (const p of players) {
    coords[String(p.pos)] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  }
  map[getCustomFormationKey(system, rotation, phase)] = coords;
  try {
    localStorage.setItem(CUSTOM_FORMATIONS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearCustomFormationCoords(
  system: SystemType,
  rotation: number,
  phase: TacticalPhase
): void {
  if (typeof window === 'undefined') return;
  const map = readSavedFormations();
  delete map[getCustomFormationKey(system, rotation, phase)];
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(CUSTOM_FORMATIONS_STORAGE_KEY);
    } else {
      localStorage.setItem(CUSTOM_FORMATIONS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore
  }
}
