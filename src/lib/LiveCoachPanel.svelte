<script lang="ts">
  import { computeMatchAnalytics } from './analytics';
  import type { RotationPosition, ServingTeam, VolleyballEvent } from './types';

  interface Props {
    events: VolleyballEvent[];
    currentSetNumber: number;
    currentRotation: RotationPosition;
    initialServe?: ServingTeam;
    isMatchOver?: boolean;
    onAddNote: (noteText: string) => void;
    onCallTimeout?: (team: 'us' | 'them') => void;
    timeoutsUs?: number;
    timeoutsThem?: number;
  }

  let {
    events,
    currentSetNumber,
    currentRotation,
    initialServe = 'us',
    isMatchOver = false,
    onAddNote
  }: Props = $props();

  let expanded = $state(true);
  let scope = $state<'set' | 'all'>('set');
  let customNote = $state('');

  const analytics = $derived(
    computeMatchAnalytics(events, {
      setFilter: scope === 'set' ? currentSetNumber : 'all',
      initialServe
    })
  );

  const currentRotStat = $derived(
    analytics.rotationStats.find((r) => r.rot === currentRotation)
  );

  const weakestRotation = $derived.by(() => {
    const neg = analytics.rotationStats.filter((r) => r.diff <= -2);
    if (neg.length === 0) return null;
    return neg.sort((a, b) => a.diff - b.diff)[0];
  });

  const quickNotes = [
    'Gegner legt kurz',
    'Block außen schließen',
    'Aufschlag auf Pos 5',
    'Aufschlag kurz (Zone 2/3)',
    'Mehr Sicherung beim Angriff'
  ];

  function submitCustomNote(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = customNote.trim();
    if (!trimmed || isMatchOver) return;
    onAddNote(trimmed);
    customNote = '';
  }
</script>

<section class="coach-panel" aria-label="Live Co-Trainer Analyse">
  <button
    type="button"
    class="cp-header-btn"
    onclick={() => (expanded = !expanded)}
    aria-expanded={expanded}
  >
    <div class="cp-header-left">
      <span class="cp-title">Live Co-Trainer Cockpit</span>
      <span class="cp-pill so">
        SO: {analytics.sideoutPct !== null ? `${analytics.sideoutPct}%` : '–'}
      </span>
      <span class="cp-pill brk">
        Break: {analytics.breakPct !== null ? `${analytics.breakPct}%` : '–'}
      </span>
      {#if analytics.activeOpponentRun >= 3}
        <span class="cp-pill alert">⚠ {analytics.activeOpponentRun}:0 Lauf Gegner</span>
      {:else if analytics.activeOwnRun >= 3}
        <span class="cp-pill hot">🔥 {analytics.activeOwnRun}:0 Serie</span>
      {/if}
    </div>
    <span class="cp-chevron">{expanded ? '▴' : '▾'}</span>
  </button>

  {#if expanded}
    <div class="cp-body">
      <div class="cp-toolbar">
        <div class="cp-scope-tabs" role="tablist" aria-label="Analyse-Zeitraum">
          <button
            type="button"
            role="tab"
            class="cp-tab"
            class:active={scope === 'set'}
            aria-selected={scope === 'set'}
            onclick={() => (scope = 'set')}
          >
            Satz {currentSetNumber}
          </button>
          <button
            type="button"
            role="tab"
            class="cp-tab"
            class:active={scope === 'all'}
            aria-selected={scope === 'all'}
            onclick={() => (scope = 'all')}
          >
            Gesamtes Spiel
          </button>
        </div>

        <div class="cp-mini-kpis">
          <span>Annahme Ø <strong>{analytics.passAvgFormatted}</strong></span>
          {#if analytics.passPositivePct !== null}
            <span>Pos. <strong>{analytics.passPositivePct}%</strong></span>
          {/if}
          {#if analytics.attackEfficiency !== null}
            <span>Angr. Eff. <strong>{analytics.attackEfficiency}%</strong></span>
          {/if}
        </div>
      </div>

      <!-- MOMENTUM / ROTATION WARNUNG -->
      {#if analytics.activeOpponentRun >= 3 || (currentRotStat && currentRotStat.diff <= -2)}
        <div class="cp-alert-box" role="status">
          {#if analytics.activeOpponentRun >= 3}
            <span>
              <strong>Gegner-Lauf ({analytics.activeOpponentRun} Punkte in Folge):</strong>
              Auszeit oder Taktik-Impuls prüfen.
            </span>
          {/if}
          {#if currentRotStat && currentRotStat.diff <= -2}
            <span>
              <strong>Aktuelle Rotation R{currentRotation}:</strong>
              Bilanz {currentRotStat.diff} ({currentRotStat.won} won / {currentRotStat.lost} lost)
              {currentRotStat.sideoutPct !== null ? `• SO ${currentRotStat.sideoutPct}%` : ''}.
            </span>
          {/if}
        </div>
      {:else if weakestRotation}
        <div class="cp-hint-box">
          Schwachstelle bisher: <strong>R{weakestRotation.rot} ({weakestRotation.diff})</strong>
          {weakestRotation.sideoutPct !== null ? `• Side-out ${weakestRotation.sideoutPct}%` : ''}
        </div>
      {/if}

      <!-- 6-ROTATIONEN MATRIX -->
      <div class="cp-rot-grid" aria-label="Rotations-Bilanz R1 bis R6">
        {#each analytics.rotationStats as rs (rs.rot)}
          <div
            class="cp-rot-cell"
            class:current={rs.rot === currentRotation}
            class:pos={rs.diff > 0}
            class:neg={rs.diff < 0}
          >
            <span class="r-lbl">R{rs.rot}</span>
            <span class="r-diff">{rs.diff > 0 ? `+${rs.diff}` : rs.diff}</span>
            <span class="r-so">
              {rs.sideoutPct !== null ? `SO ${rs.sideoutPct}%` : `+${rs.won}/−${rs.lost}`}
            </span>
          </div>
        {/each}
      </div>

      <!-- LIVE SPIELER-SCORECARD -->
      {#if analytics.playerStats.length > 0}
        <div class="cp-table-wrap">
          <table class="cp-table">
            <thead>
              <tr>
                <th>Spieler/in</th>
                <th>Pkt</th>
                <th>Fehl.</th>
                <th>Annahme Ø</th>
              </tr>
            </thead>
            <tbody>
              {#each analytics.playerStats.slice(0, 6) as ps (ps.player)}
                <tr>
                  <td class="p-name">{ps.player}</td>
                  <td>{ps.kills + ps.aces + ps.blocks}</td>
                  <td class:bad={ps.errors >= 3}>{ps.errors}</td>
                  <td class:warn={ps.passCount >= 2 && ps.passSum / ps.passCount < 1.5}>
                    {ps.passCount > 0 ? `${(ps.passSum / ps.passCount).toFixed(2)} (${ps.passCount})` : '–'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <!-- SCHNELLE TAKTIK-NOTIZEN -->
      <div class="cp-notes">
        <div class="cp-note-chips">
          {#each quickNotes as qn}
            <button
              type="button"
              class="cp-note-chip"
              disabled={isMatchOver}
              onclick={() => onAddNote(qn)}
            >
              + {qn}
            </button>
          {/each}
        </div>
        <form class="cp-note-form" onsubmit={submitCustomNote}>
          <input
            type="text"
            bind:value={customNote}
            placeholder="Kurze Taktik-Notiz für Auszeit/Review..."
            class="cp-note-input"
            disabled={isMatchOver}
          />
          <button
            type="submit"
            class="cp-note-submit"
            disabled={isMatchOver || !customNote.trim()}
          >
            Notieren
          </button>
        </form>
      </div>
    </div>
  {/if}
</section>

<style>
  .coach-panel {
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05);
    box-sizing: border-box;
  }

  .cp-header-btn {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: #0f172a;
    color: #ffffff;
    border: none;
    cursor: pointer;
    touch-action: manipulation;
    text-align: left;
  }

  .cp-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .cp-title {
    font-size: 0.85rem;
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  .cp-pill {
    font-size: 0.68rem;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 9999px;
    white-space: nowrap;
  }

  .cp-pill.so {
    background: #1e3a8a;
    color: #bfdbfe;
  }

  .cp-pill.brk {
    background: #064e3b;
    color: #a7f3d0;
  }

  .cp-pill.alert {
    background: #dc2626;
    color: #ffffff;
  }

  .cp-pill.hot {
    background: #16a34a;
    color: #ffffff;
  }

  .cp-chevron {
    font-size: 0.9rem;
    color: #94a3b8;
    flex-shrink: 0;
  }

  .cp-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cp-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .cp-scope-tabs {
    display: inline-flex;
    background: #f1f5f9;
    padding: 3px;
    border-radius: 8px;
    gap: 3px;
  }

  .cp-tab {
    border: none;
    background: transparent;
    color: #475569;
    font-size: 0.74rem;
    font-weight: 800;
    padding: 5px 10px;
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .cp-tab.active {
    background: #ffffff;
    color: #0f172a;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
  }

  .cp-mini-kpis {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.74rem;
    color: #475569;
    flex-wrap: wrap;
  }

  .cp-mini-kpis strong {
    color: #0f172a;
  }

  .cp-alert-box {
    background: #fef2f2;
    border: 1.5px solid #fca5a5;
    color: #991b1b;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 0.76rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cp-hint-box {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 0.75rem;
  }

  .cp-rot-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  }

  .cp-rot-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5px 2px;
    border-radius: 8px;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    text-align: center;
  }

  .cp-rot-cell.pos {
    background: #f0fdf4;
    border-color: #86efac;
  }

  .cp-rot-cell.neg {
    background: #fef2f2;
    border-color: #fca5a5;
  }

  .cp-rot-cell.current {
    box-shadow: 0 0 0 2px #2563eb;
    border-color: #2563eb;
  }

  .r-lbl {
    font-size: 0.65rem;
    font-weight: 800;
    color: #475569;
  }

  .r-diff {
    font-size: 0.9rem;
    font-weight: 900;
    color: #0f172a;
    line-height: 1.1;
  }

  .cp-rot-cell.pos .r-diff {
    color: #15803d;
  }

  .cp-rot-cell.neg .r-diff {
    color: #b91c1c;
  }

  .r-so {
    font-size: 0.58rem;
    font-weight: 700;
    color: #64748b;
  }

  .cp-table-wrap {
    overflow-x: auto;
  }

  .cp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.76rem;
  }

  .cp-table th {
    text-align: left;
    font-size: 0.68rem;
    text-transform: uppercase;
    color: #64748b;
    border-bottom: 1px solid #e2e8f0;
    padding: 4px 6px;
  }

  .cp-table td {
    padding: 5px 6px;
    border-bottom: 1px solid #f1f5f9;
    color: #0f172a;
    font-weight: 600;
  }

  .cp-table .p-name {
    font-weight: 800;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cp-table td.bad,
  .cp-table td.warn {
    color: #dc2626;
    font-weight: 800;
  }

  .cp-notes {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #f1f5f9;
    padding-top: 8px;
  }

  .cp-note-chips {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .cp-note-chip {
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    color: #334155;
    border-radius: 9999px;
    padding: 4px 8px;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  .cp-note-chip:hover:not(:disabled) {
    background: #e2e8f0;
  }

  .cp-note-form {
    display: flex;
    gap: 6px;
  }

  .cp-note-input {
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    font-size: 0.78rem;
    background: #ffffff;
    color: #0f172a;
  }

  .cp-note-submit {
    padding: 6px 12px;
    background: #0f172a;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.76rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }

  .cp-note-submit:disabled,
  .cp-note-chip:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
