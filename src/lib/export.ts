import { computeMatchAnalytics, toChronologicalEvents } from './analytics';
import { computeSetsStanding } from './matchEngine';
import type { VolleyballMatchPayload } from './types';

function escapeCsvCell(val: string | number | boolean | undefined): string {
  const s = val === undefined || val === null ? '' : String(val);
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Formats a concise, readable coaching summary suitable for WhatsApp/Signal/team chat.
 */
export function buildCoachShareText(match: VolleyballMatchPayload): string {
  const analytics = computeMatchAnalytics(match.events, {
    setFilter: 'all',
    initialServe: match.initialServe ?? 'us'
  });
  const standing = computeSetsStanding(match.sets);
  const setsLine = match.sets
    .map((s) => `S${s.setNumber}: ${s.myScore}:${s.opponentScore}`)
    .join(' | ');

  const bestRot = [...analytics.rotationStats].sort((a, b) => b.diff - a.diff)[0];
  const worstRot = [...analytics.rotationStats].sort((a, b) => a.diff - b.diff)[0];

  const lines: string[] = [
    `🏐 *${match.teamName} vs ${match.opponentName}* (${match.system})`,
    `Sätze: *${standing.us}:${standing.them}* (${setsLine || '–'})`,
    '',
    `📊 *Team-KPIs*`,
    `• Side-out: ${analytics.sideoutPct !== null ? `${analytics.sideoutPct}% (${analytics.sideoutWon}/${analytics.sideoutTotal})` : '–'}`,
    `• Break-Points: ${analytics.breakPct !== null ? `${analytics.breakPct}% (${analytics.breakWon}/${analytics.breakTotal})` : '–'}`,
    `• Kills: ${analytics.kills} | Asse: ${analytics.aces} | Blocks: ${analytics.blocks} | Eig. Fehler: ${analytics.ownErrors}`,
    `• Annahme Ø: ${analytics.passAvgFormatted} (${analytics.passCount}x${analytics.passPositivePct !== null ? `, ${analytics.passPositivePct}% pos.` : ''})`
  ];

  if (bestRot && worstRot) {
    lines.push(
      `• Stärkster Läufer: R${bestRot.rot} (${bestRot.diff >= 0 ? `+${bestRot.diff}` : bestRot.diff}) | Problem-Läufer: R${worstRot.rot} (${worstRot.diff >= 0 ? `+${worstRot.diff}` : worstRot.diff})`
    );
  }

  if (analytics.playerStats.length > 0) {
    lines.push('', `👥 *Top Spielerinnen*`);
    for (const ps of analytics.playerStats.slice(0, 6)) {
      const pts = ps.kills + ps.aces + ps.blocks;
      const passInfo = ps.passCount > 0 ? `, Ann Ø ${(ps.passSum / ps.passCount).toFixed(2)}` : '';
      lines.push(`• ${ps.player}: ${pts} Pkt (${ps.kills}K/${ps.aces}A/${ps.blocks}B), ${ps.errors}F${passInfo}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generates an Excel-compatible UTF-8 BOM CSV containing player stats and chronological match log.
 */
export function buildMatchCsv(match: VolleyballMatchPayload): string {
  const analytics = computeMatchAnalytics(match.events, {
    setFilter: 'all',
    initialServe: match.initialServe ?? 'us'
  });
  const events = toChronologicalEvents(match.events);

  const rows: string[] = [];
  rows.push(['SetPoint Match Export', `${match.teamName} vs ${match.opponentName}`, match.system, match.startedAt].map(escapeCsvCell).join(';'));
  rows.push(['Sätze', match.sets.map((s) => `S${s.setNumber} ${s.myScore}:${s.opponentScore}`).join(' / ')].map(escapeCsvCell).join(';'));
  rows.push('');

  // Player Box Score
  rows.push(['Spieler', 'Kills', 'Asse', 'Blocks', 'Abwehr (Dig)', 'Fehler', 'Annahmen', 'Annahme Ø'].map(escapeCsvCell).join(';'));
  for (const ps of analytics.playerStats) {
    rows.push(
      [
        ps.player,
        ps.kills,
        ps.aces,
        ps.blocks,
        ps.digs,
        ps.errors,
        ps.passCount,
        ps.passCount > 0 ? (ps.passSum / ps.passCount).toFixed(2).replace('.', ',') : ''
      ]
        .map(escapeCsvCell)
        .join(';')
    );
  }
  rows.push('');

  // Event Log
  rows.push(['Zeit', 'Satz', 'Rotation', 'Stand', 'Side-out', 'Team', 'Spieler', 'Pos', 'Kategorie', 'Aktion', 'Qualität', 'Annahme-Note', 'Notiz'].map(escapeCsvCell).join(';'));
  for (const ev of events) {
    rows.push(
      [
        ev.timestamp,
        ev.setNumber ?? 1,
        `R${ev.rotation}`,
        ev.scoreAfter ?? '',
        ev.isSideout ? 'Ja' : '',
        ev.team ?? '',
        ev.player ?? '',
        ev.position ? `P${ev.position}` : '',
        ev.category,
        ev.action,
        ev.quality,
        ev.passRating ?? '',
        ev.note ?? ''
      ]
        .map(escapeCsvCell)
        .join(';')
    );
  }

  return '\uFEFF' + rows.join('\r\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseImportedMatchJson(rawText: string): VolleyballMatchPayload {
  const parsed = JSON.parse(rawText);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.matchId !== 'string' ||
    typeof parsed.teamName !== 'string' ||
    !Array.isArray(parsed.events) ||
    !Array.isArray(parsed.sets)
  ) {
    throw new Error('Ungültiges SetPoint JSON-Format.');
  }
  return parsed as VolleyballMatchPayload;
}
