import type { RotationPosition } from './types';

/** Player on the court. x/y in percent: x 0=left sideline, y 0=net, y 100=baseline. */
export interface FormationPlayer {
  /** Nominal rotation position 1-6 */
  pos: RotationPosition;
  x: number;
  y: number;
  label?: string;
}

export interface FormationError {
  rule: string;
  /** Nominal positions involved */
  positions: RotationPosition[];
  message: string;
}

/**
 * Pure FIVB positional-fault check. Returns an empty array if the formation is legal.
 * Rules are based on nominal positions (no diagonal rules).
 * Equal coordinates count as a fault (strict overlap rule).
 */
export function validateFormation(
  players: FormationPlayer[],
  currentRotation: number = 1
): FormationError[] {
  const errors: FormationError[] = [];
  const by = new Map<number, FormationPlayer>(players.map((p) => [p.pos, p]));

  const front = (a: RotationPosition, b: RotationPosition) => {
    const pa = by.get(a);
    const pb = by.get(b);
    if (!pa || !pb) return;
    if (!(pa.y < pb.y)) {
      errors.push({
        rule: 'front-back',
        positions: [a, b],
        message: `Pos ${a} muss näher am Netz stehen als Pos ${b} (Rotation ${currentRotation})`
      });
    }
  };

  const left = (a: RotationPosition, b: RotationPosition) => {
    const pa = by.get(a);
    const pb = by.get(b);
    if (!pa || !pb) return;
    if (!(pa.x < pb.x)) {
      errors.push({
        rule: 'left-right',
        positions: [a, b],
        message: `Pos ${a} muss links von Pos ${b} stehen (Rotation ${currentRotation})`
      });
    }
  };

  // Front vs. back (Y axis)
  front(4, 5);
  front(3, 6);
  front(2, 1);

  // Left vs. center vs. right (X axis)
  left(4, 3);
  left(3, 2);
  left(5, 6);
  left(6, 1);

  return errors;
}

export function isLegalFormation(players: FormationPlayer[], currentRotation = 1): boolean {
  return validateFormation(players, currentRotation).length === 0;
}
