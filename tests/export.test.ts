import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCoachShareText,
  buildMatchCsv,
  parseImportedMatchJson
} from '../src/lib/export.ts';
import type { VolleyballMatchPayload } from '../src/lib/types.ts';

const sampleMatch: VolleyballMatchPayload = {
  matchId: 'match-test-1',
  startedAt: '2026-11-12T18:00:00.000Z',
  endedAt: '2026-11-12T19:15:00.000Z',
  teamName: 'VC Damen 1',
  opponentName: 'TSV; Nord "A"',
  system: '5-1',
  matchFormat: 'bo5',
  initialServe: 'us',
  winner: 'us',
  endReason: 'rulebook',
  sets: [
    { setNumber: 1, myScore: 25, opponentScore: 21 },
    { setNumber: 2, myScore: 25, opponentScore: 18 }
  ],
  events: [
    // Stored newest-first intentionally
    {
      id: 'e2',
      timestamp: '18:05:10',
      isoTimestamp: '2026-11-12T18:05:10.000Z',
      setNumber: 1,
      actionId: 'kill',
      category: 'attack',
      quality: 'good',
      action: 'Kill Angriff',
      rotation: 1,
      player: '#7 Mila (OH1)',
      position: 4,
      team: 'myTeam',
      wasServing: 'them',
      scoreAfter: '2:1',
      isSideout: true
    },
    {
      id: 'e1',
      timestamp: '18:00:10',
      isoTimestamp: '2026-11-12T18:00:10.000Z',
      setNumber: 1,
      actionId: 'ace',
      category: 'serve',
      quality: 'good',
      action: 'Ass',
      rotation: 1,
      player: '#1 Lena (S)',
      position: 1,
      team: 'myTeam',
      wasServing: 'us',
      scoreAfter: '1:0'
    }
  ]
};

describe('export', () => {
  it('formats readable WhatsApp/coaching summary text', () => {
    const text = buildCoachShareText(sampleMatch);
    assert.match(text, /VC Damen 1 vs TSV; Nord "A"/);
    assert.match(text, /Sätze: \*2:0\*/);
    assert.match(text, /Side-out: 100% \(1\/1\)/);
    assert.match(text, /Break-Points: 100% \(1\/1\)/);
    assert.match(text, /#7 Mila \(OH1\)/);
  });

  it('builds UTF-8 BOM semicolon-delimited CSV in chronological order with proper quoting', () => {
    const csv = buildMatchCsv(sampleMatch);
    assert.ok(csv.startsWith('\uFEFF'), 'CSV should include UTF-8 BOM for Excel');
    assert.ok(csv.includes('"VC Damen 1 vs TSV; Nord ""A"""'));

    const lines = csv.split('\r\n');
    const e1Index = lines.findIndex((l) => l.includes('18:00:10'));
    const e2Index = lines.findIndex((l) => l.includes('18:05:10'));
    assert.ok(e1Index > 0 && e2Index > e1Index, 'Chronological event 18:00:10 should precede 18:05:10');
  });

  it('parses valid exported match JSON and rejects malformed backups', () => {
    const json = JSON.stringify(sampleMatch);
    const parsed = parseImportedMatchJson(json);
    assert.equal(parsed.matchId, 'match-test-1');
    assert.equal(parsed.events.length, 2);

    assert.throws(() => parseImportedMatchJson('{"foo":"bar"}'), /Ungültiges SetPoint JSON-Format/);
    assert.throws(() => parseImportedMatchJson('not-json'));
  });
});
