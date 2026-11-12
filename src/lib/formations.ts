import type { FormationPlayer } from './validateFormation';
import type { RotationPosition } from './types';

export type PhaseCoords = Record<string, { x: number; y: number }>;
export type RotationConfig = { receive: PhaseCoords; transition: PhaseCoords };
export type TacticalPhase = 'receive' | 'transition';

export const ALL_ROSTER_KEYS = ['S', 'OH1', 'MB1', 'OPP', 'OH2', 'MB2', 'L'] as const;
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

/**
 * FIVB Libero Replacement Table across all 6 rotations (Läufer 1–6):
 * - MB1 and MB2 are opposite each other in the starting lineup (Pos 3 and Pos 6 in Läufer 1).
 * - Whenever a Middle Blocker rotates into the back row (Pos 1 -> Pos 6 -> Pos 5),
 *   the Libero (L) automatically replaces them.
 * - Whenever the Libero rotates to Pos 4 (front row), L MUST leave the court and the
 *   Middle Blocker re-enters at Pos 4, while L subsequently replaces the other MB at Pos 1.
 */
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
 * Complete 5-1 tactical formations for all 6 rotations (Läufer 1–6)
 * across 'receive' (Annahme) and 'transition' (Angriffsvorbereitung).
 *
 * In Rotations 1, 2, 6: MB1 is front row on court; L replaces MB2 in the back row.
 * In Rotations 3, 4, 5: MB2 is front row on court; L replaces MB1 in the back row.
 *
 * X: 0 = Left sideline, 100 = Right sideline
 * Y: 0 = Net, 100 = Baseline
 */
export const formations: Record<number, RotationConfig> = {
  1: { // Läufer 1: Zuspieler (S) auf Pos 1 | MB1 vorne (Pos 3), L für MB2 hinten (Pos 6)
    receive: {
      'S': { x: 85, y: 75 },   // z1 (Pos 1) hinter A2
      'OH1': { x: 75, y: 65 }, // A2 (Pos 2) Annahme rechts
      'MB1': { x: 30, y: 15 }, // M3 (Pos 3) am Netz
      'OPP': { x: 10, y: 40 }, // D4 (Pos 4) links außen geparkt
      'OH2': { x: 15, y: 75 }, // a5 (Pos 5) Annahme links
      'L': { x: 45, y: 75 }    // mL6 (Pos 6, für MB2) Annahme mitte
    },
    transition: {
      'S': { x: 65, y: 10 },   // z1 ans Netz
      'OH1': { x: 90, y: 10 }, // A2 Angriff links (außen)
      'MB1': { x: 50, y: 10 }, // M3 Mitte
      'OPP': { x: 10, y: 10 }, // D4 Diagonalangriff rechts
      'OH2': { x: 50, y: 60 }, // a5 Abwehr
      'L': { x: 25, y: 30 }    // mL6 (für MB2) Abwehr
    }
  },
  2: { // Läufer 2: Zuspieler (S) auf Pos 2 | MB1 kommt für L auf Pos 4 rein, L für MB2 auf Pos 1
    receive: {
      'S': { x: 80, y: 20 },   // Z2 (Pos 2) rechts vorne
      'OH1': { x: 20, y: 65 }, // A3 (Pos 3) Annahme rechts
      'MB1': { x: 10, y: 15 }, // M4 (Pos 4) am Netz (für L eingewechselt)
      'OPP': { x: 40, y: 90 }, // d5 (Pos 5) geparkt
      'OH2': { x: 50, y: 75 }, // a6 (Pos 6) Annahme links
      'L': { x: 75, y: 65 }    // mL1 (Pos 1, für MB2) Annahme mitte
    },
    transition: {
      'S': { x: 65, y: 10 },   // Z2 stellt
      'OH1': { x: 10, y: 10 }, // A3 Angriff außen
      'MB1': { x: 50, y: 10 }, // M4 Mitte
      'OPP': { x: 90, y: 40 }, // d5 Hinterfeldangriff
      'OH2': { x: 50, y: 60 }, // a5 Abwehr
      'L': { x: 25, y: 30 }    // mL6 (für MB2) Abwehr
    }
  },
  3: { // Läufer 3: Zuspieler (S) auf Pos 3 | MB2 vorne (Pos 2), L für MB1 hinten (Pos 5)
    receive: {
      'S': { x: 80, y: 10 },   // Z3 (Pos 3) links/mitte vorne
      'OH1': { x: 20, y: 65 }, // A4 (Pos 4) Annahme links
      'MB2': { x: 90, y: 20 }, // M2 (Pos 2) am Netz
      'OPP': { x: 60, y: 90 }, // d6 (Pos 6) geparkt
      'OH2': { x: 75, y: 75 }, // a1 (Pos 1) Annahme rechts
      'L': { x: 45, y: 75 }    // mL5 (Pos 5, für MB1) Annahme mitte
    },
    transition: {
      'S': { x: 65, y: 10 },   // Z3 ans Netz gerückt
      'OH1': { x: 10, y: 10 }, // A4 außen
      'MB2': { x: 50, y: 10 }, // M2 Mitte
      'OPP': { x: 90, y: 40 }, // d6 Hinterfeld
      'OH2': { x: 50, y: 60 }, // a5 Abwehr
      'L': { x: 25, y: 30 }    // mL6 (für MB2) Abwehr
    }
  },
  4: { // Läufer 4: Zuspieler (S) auf Pos 4 | MB2 vorne (Pos 3), L für MB1 hinten (Pos 6)
    receive: {
      'S': { x: 7, y: 10 },   // Z4 (Pos 4) links vorne
      'OH2': { x: 25, y: 65 }, // A2 (Pos 2) Annahme rechts
      'MB2': { x: 17, y: 20 }, // M3 (Pos 3) am Netz mitte
      'OH1': { x: 50, y: 75 }, // a5 (Pos 5) Annahme links
      'OPP': { x: 92, y: 90 }, // d1 (Pos 1) rechts geparkt
      'L': { x: 75, y: 65 }    // mL6 (Pos 6, für MB1) Annahme mitte
    },
    transition: {
      'S': { x: 65, y: 10 },   // Z4 stellt
      'OH2': { x: 10, y: 10 }, // A2 außen
      'MB2': { x: 50, y: 10 }, // M3 Mitte
      'OH1': { x: 25, y: 60 }, // a5 Abwehr
      'OPP': { x: 95, y: 40 }, // d1 Hinterfeld
      'L': { x: 25, y: 30 }    // mL6 (für MB2) Abwehr
    }
  },
  5: { // Läufer 5: Zuspieler (S) auf Pos 5 | MB2 kommt für L auf Pos 4 rein, L für MB1 auf Pos 1
    receive: {
      'S': { x: 40, y: 30 },   // z5 (Pos 5) hinter M4
      'MB2': { x: 7, y: 20 }, // M4 (Pos 4) am Netz (für L eingewechselt)
      'OH2': { x: 25, y: 65 }, // A3 (Pos 3) Annahme rechts
      'OH1': { x: 50, y: 75 }, // a6 (Pos 6) Annahme links
      'OPP': { x: 90, y: 15 }, // D2 (Pos 2) vorne geparkt
      'L': { x: 75, y: 65 }    // mL1 (Pos 1, für MB1) Annahme mitte
    },
    transition: {
      'S': { x: 65, y: 10 },   // z5 läuft vor
      'MB2': { x: 50, y: 10 }, // M4 Mitte
      'OH2': { x: 10, y: 10 }, // A3 außen
      'OH1': { x: 25, y: 60 }, // a6 Abwehr
      'OPP': { x: 90, y: 10 }, // D2 Diagonal
      'L': { x: 55, y: 60 }    // mL1 (für MB1) Abwehr
    }
  },
  6: { // Läufer 6: Zuspieler (S) auf Pos 6 | MB1 vorne (Pos 2), L für MB2 hinten (Pos 5)
    receive: {
      'S': { x: 65, y: 15 },   // z6 (Pos 6) hinter D3
      'MB1': { x: 85, y: 25 }, // M2 (Pos 2) am Netz
      'OPP': { x: 75, y: 10 }, // D3 (Pos 3) vorne geparkt
      'OH2': { x: 20, y: 55 }, // A4 (Pos 4) Annahme links
      'L': { x: 45, y: 75 },   // mL5 (Pos 5, für MB2) Annahme mitte
      'OH1': { x: 78, y: 75 }  // a1 (Pos 1) Annahme rechts
    },
    transition: {
      'S': { x: 65, y: 10 },   // z6 läuft vor ans Netz
      'MB1': { x: 50, y: 10 }, // M2 Mitte
      'OPP': { x: 90, y: 10 }, // D3 Diagonalangriff rechts
      'OH2': { x: 10, y: 10 }, // A4 Angriff außen
      'L': { x: 50, y: 60 },   // mL5 (für MB2) Abwehr
      'OH1': { x: 75, y: 60 }  // a1 Abwehr
    }
  }
};

/**
 * Nominal FIVB court position (1-6) for the 6 active on-court players in each rotation.
 * Note how MB1 is on court in Rotations 1, 2, 6 (front row) while L replaces MB2 (back row),
 * and MB2 is on court in Rotations 3, 4, 5 (front row) while L replaces MB1 (back row).
 */
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
