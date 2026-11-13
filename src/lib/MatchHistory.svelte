<script lang="ts">
  import { onMount } from 'svelte';
  import {
    fetchSavedMatches,
    fetchSavedMatchById,
    getOfflineOutbox,
    removeOfflineMatch,
    getLocalArchive,
    saveMatchToLocalArchive,
    removeLocalArchiveMatch,
    syncOfflineOutbox,
    getStoredApiKey,
    setStoredApiKey,
    ApiUnauthorizedError,
    ApiNetworkError
  } from './api';
  import { computeMatchAnalytics } from './analytics';
  import {
    buildCoachShareText,
    buildMatchCsv,
    downloadTextFile,
    parseImportedMatchJson
  } from './export';
  import { computeSetsStanding } from './matchEngine';
  import type {
    SavedMatchSummary,
    VolleyballMatchPayload
  } from './types';

  let { onBack, onOutboxChange } = $props<{
    onBack: () => void;
    onOutboxChange?: (count: number) => void;
  }>();

  let savedMatches = $state<SavedMatchSummary[]>([]);
  let outboxMatches = $state<VolleyballMatchPayload[]>([]);
  let localArchiveMatches = $state<VolleyballMatchPayload[]>([]);
  let loadingList = $state(true);
  let listError = $state<string | null>(null);

  let selectedMatch = $state<VolleyballMatchPayload | null>(null);
  let loadingDetail = $state(false);
  let selectedSetFilter = $state<'all' | number>('all');

  let syncingOutbox = $state(false);
  let syncFeedback = $state<string | null>(null);
  let copyFeedback = $state<string | null>(null);

  let showPinBox = $state(false);
  let apiKeyInput = $state(getStoredApiKey());
  let importInputEl: HTMLInputElement | undefined = $state();

  function refreshOutbox() {
    outboxMatches = getOfflineOutbox();
    localArchiveMatches = getLocalArchive();
    onOutboxChange?.(outboxMatches.length);
  }

  // Local archive items that are not already represented on the remote server list
  const localOnlyMatches = $derived.by(() => {
    const serverIds = new Set(savedMatches.map((m) => m.matchId));
    return localArchiveMatches.filter((m) => !serverIds.has(m.matchId));
  });

  async function loadList() {
    loadingList = true;
    listError = null;
    refreshOutbox();
    try {
      savedMatches = await fetchSavedMatches(apiKeyInput);
    } catch (err) {
      if (err instanceof ApiNetworkError) {
        listError = 'Go-Server aktuell nicht erreichbar. Lokal gespeicherte Spiele bleiben unten verfügbar.';
      } else {
        listError = 'Kein Server-Archiv aktiv — lokale Geräte-Einträge werden angezeigt.';
      }
    } finally {
      loadingList = false;
    }
  }

  onMount(() => {
    loadList();
  });

  function savePin() {
    setStoredApiKey(apiKeyInput);
    showPinBox = false;
    syncFeedback = 'API-PIN lokal gespeichert.';
  }

  async function handleSyncOutbox() {
    if (syncingOutbox || outboxMatches.length === 0) return;
    syncingOutbox = true;
    syncFeedback = null;
    try {
      const res = await syncOfflineOutbox(apiKeyInput);
      refreshOutbox();
      if (res.synced > 0) {
        syncFeedback = `${res.synced} Spiel(e) erfolgreich in InfluxDB gespeichert!`;
        await loadList();
      } else if (res.failed > 0) {
        syncFeedback = `Server noch nicht erreichbar (${res.failed} ausstehend).`;
      }
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        showPinBox = true;
        syncFeedback = 'Bitte gültigen Team-PIN / API-Key eingeben, um hochzuladen.';
      } else {
        syncFeedback = err instanceof Error ? err.message : 'Synchronisation fehlgeschlagen.';
      }
    } finally {
      syncingOutbox = false;
    }
  }

  function handleDeleteOutboxItem(matchId: string) {
    if (!confirm('Dieses lokal vorgemerkte Spiel aus der Upload-Warteschlange entfernen?')) return;
    removeOfflineMatch(matchId);
    refreshOutbox();
  }

  function handleDeleteLocalMatch(matchId: string, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm('Dieses lokal gespeicherte Spiel wirklich vom Gerät löschen?')) return;
    removeLocalArchiveMatch(matchId);
    removeOfflineMatch(matchId);
    refreshOutbox();
    if (selectedMatch?.matchId === matchId) {
      selectedMatch = null;
    }
  }

  async function openServerMatch(matchId: string) {
    loadingDetail = true;
    listError = null;
    selectedSetFilter = 'all';
    try {
      selectedMatch = await fetchSavedMatchById(matchId, apiKeyInput);
    } catch (err) {
      listError = err instanceof Error ? err.message : 'Spiel-Details konnten nicht geladen werden.';
    } finally {
      loadingDetail = false;
    }
  }

  function openLocalMatch(item: VolleyballMatchPayload) {
    selectedSetFilter = 'all';
    selectedMatch = item;
  }

  async function handleImportJson(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseImportedMatchJson(text);
      saveMatchToLocalArchive({ ...imported, syncState: 'local' });
      refreshOutbox();
      syncFeedback = `Spiel "${imported.teamName} vs ${imported.opponentName}" lokal importiert.`;
    } catch (err) {
      syncFeedback = err instanceof Error ? err.message : 'JSON-Import fehlgeschlagen.';
    } finally {
      input.value = '';
    }
  }

  async function handleCopySummary() {
    if (!selectedMatch) return;
    const text = buildCoachShareText(selectedMatch);
    try {
      await navigator.clipboard.writeText(text);
      copyFeedback = 'Team-Zusammenfassung in Zwischenablage kopiert!';
    } catch {
      copyFeedback = 'Kopieren nicht möglich — bitte CSV/JSON Export nutzen.';
    }
    setTimeout(() => (copyFeedback = null), 3000);
  }

  function handleExportCsv() {
    if (!selectedMatch) return;
    const safeName = `${selectedMatch.teamName}_vs_${selectedMatch.opponentName}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
    downloadTextFile(`${safeName}.csv`, buildMatchCsv(selectedMatch), 'text/csv;charset=utf-8');
  }

  function handleExportJson() {
    if (!selectedMatch) return;
    const safeName = `${selectedMatch.teamName}_vs_${selectedMatch.opponentName}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
    downloadTextFile(
      `${safeName}.json`,
      JSON.stringify(selectedMatch, null, 2),
      'application/json;charset=utf-8'
    );
  }

  function formatMatchDate(iso: string): string {
    if (!iso) return '–';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  const filteredEvents = $derived.by(() => {
    if (!selectedMatch) return [];
    const list = selectedMatch.events ?? [];
    if (selectedSetFilter === 'all') return list;
    return list.filter((ev) => (ev.setNumber ?? 1) === selectedSetFilter);
  });

  const analytics = $derived(
    selectedMatch
      ? computeMatchAnalytics(selectedMatch.events ?? [], {
          setFilter: selectedSetFilter,
          initialServe: selectedMatch.initialServe ?? 'us'
        })
      : null
  );
</script>

<div class="history-view">
  <header class="hv-header">
    <div class="hv-header-inner">
      <button
        type="button"
        class="hv-back-btn"
        onclick={() => {
          if (selectedMatch) {
            selectedMatch = null;
          } else {
            onBack();
          }
        }}
      >
        ← {selectedMatch ? 'Alle Spiele' : 'Zurück'}
      </button>

      <div class="hv-title-wrap">
        <h1 class="hv-title">
          {selectedMatch
            ? `${selectedMatch.teamName} vs ${selectedMatch.opponentName}`
            : 'Gespeicherte Spiele & Analyse'}
        </h1>
        <p class="hv-subtitle">
          {selectedMatch
            ? `${formatMatchDate(selectedMatch.startedAt)} • ${selectedMatch.system} System`
            : 'SetPoint • InfluxDB Match-Archiv & Multi-Satz Nachbereitung'}
        </p>
      </div>

      <div class="hv-actions">
        {#if !selectedMatch}
          <input
            type="file"
            accept="application/json,.json"
            bind:this={importInputEl}
            onchange={handleImportJson}
            style="display: none;"
          />
          <button
            type="button"
            class="hv-util-btn"
            onclick={() => importInputEl?.click()}
            title="Exportiertes JSON-Spiel importieren"
          >
            JSON Import
          </button>
        {/if}
        <button
          type="button"
          class="hv-util-btn"
          onclick={() => (showPinBox = !showPinBox)}
          title="Optionalen Team-PIN / API-Key konfigurieren"
        >
          PIN
        </button>
        {#if !selectedMatch}
          <button
            type="button"
            class="hv-util-btn"
            onclick={loadList}
            disabled={loadingList}
          >
            Neu laden
          </button>
        {/if}
      </div>
    </div>

    {#if showPinBox}
      <div class="pin-bar">
        <label for="vb-pin-input" class="pin-label">Team-PIN (`X-API-Key`):</label>
        <input
          id="vb-pin-input"
          type="password"
          bind:value={apiKeyInput}
          placeholder="Leer lassen, falls kein Key gesetzt"
          class="pin-input"
        />
        <button type="button" class="pin-save-btn" onclick={savePin}>Speichern</button>
      </div>
    {/if}
  </header>

  <div class="hv-body">
    {#if syncFeedback}
      <div class="feedback-banner">{syncFeedback}</div>
    {/if}

    {#if !selectedMatch}
      <!-- OFFLINE OUTBOX (WENN VORHANDEN) -->
      {#if outboxMatches.length > 0}
        <section class="outbox-card" aria-label="Offline vorgemerkte Spiele">
          <div class="outbox-top">
            <div>
              <h2 class="outbox-title">Lokal vorgemerkte Spiele ({outboxMatches.length})</h2>
              <p class="outbox-sub">
                Diese Spiele wurden offline auf diesem Gerät gesichert und warten auf den Upload zum Go-Server.
              </p>
            </div>
            <button
              type="button"
              class="sync-now-btn"
              onclick={handleSyncOutbox}
              disabled={syncingOutbox}
            >
              {syncingOutbox ? 'Synchronisiere…' : 'Jetzt alle hochladen'}
            </button>
          </div>

          <div class="outbox-list">
            {#each outboxMatches as ob (ob.matchId)}
              <div class="outbox-item">
                <div class="outbox-info">
                  <strong>{ob.teamName} vs {ob.opponentName}</strong>
                  <span class="outbox-meta">
                    {formatMatchDate(ob.startedAt)} • {ob.sets.map((s) => `${s.myScore}:${s.opponentScore}`).join(', ')} ({ob.events.length} Events)
                  </span>
                </div>
                <div class="outbox-item-btns">
                  <button type="button" class="ob-open-btn" onclick={() => openLocalMatch(ob)}>
                    Analyse öffnen
                  </button>
                  <button
                    type="button"
                    class="ob-del-btn"
                    onclick={() => handleDeleteOutboxItem(ob.matchId)}
                    title="Vorgemerktes Spiel verwerfen"
                  >
                    ✕
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if listError}
        <div class="error-banner">{listError}</div>
      {/if}

      <!-- LOKALES GERÄTE-ARCHIV (FUNKTIONIERT AUCH OHNE SERVER) -->
      {#if localOnlyMatches.length > 0}
        <section class="local-archive-sec" aria-label="Lokal auf diesem Gerät gespeicherte Spiele">
          <div class="local-sec-head">
            <h2 class="local-sec-title">Auf diesem Gerät gespeichert ({localOnlyMatches.length})</h2>
            <span class="local-sec-sub">Funktioniert komplett ohne Server / Datenbank</span>
          </div>
          <div class="matches-grid">
            {#each localOnlyMatches as lm (lm.matchId)}
              {@const stand = computeSetsStanding(lm.sets)}
              {@const mAnalytics = computeMatchAnalytics(lm.events ?? [], {
                initialServe: lm.initialServe ?? 'us'
              })}
              <div
                class="match-card local-card"
                class:won={lm.winner === 'us'}
                class:lost={lm.winner === 'them'}
                role="button"
                tabindex="0"
                onclick={() => openLocalMatch(lm)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openLocalMatch(lm);
                  }
                }}
              >
                <div class="mc-top">
                  <span class="mc-date">{formatMatchDate(lm.startedAt)}</span>
                  <div class="mc-badges-right">
                    <span class="mc-local-pill">Lokal</span>
                    <span class="mc-badge {lm.winner}">
                      {lm.winner === 'us' ? 'Sieg' : lm.winner === 'them' ? 'Niederlage' : 'Remis'}
                    </span>
                    <button
                      type="button"
                      class="mc-del-btn"
                      title="Lokales Spiel löschen"
                      onclick={(e) => handleDeleteLocalMatch(lm.matchId, e)}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div class="mc-teams-row">
                  <div class="mc-teams">
                    <span class="mc-team-us">{lm.teamName}</span>
                    <span class="mc-vs">vs</span>
                    <span class="mc-team-them">{lm.opponentName}</span>
                  </div>
                  <div class="mc-sets-score">
                    {stand.us} : {stand.them}
                  </div>
                </div>

                {#if lm.sets.length > 0}
                  <div class="mc-set-chips">
                    {#each lm.sets as s (s.setNumber)}
                      <span class="mc-set-pill">S{s.setNumber} {s.myScore}:{s.opponentScore}</span>
                    {/each}
                    <span class="mc-sys-pill">{lm.system}</span>
                  </div>
                {/if}

                <div class="mc-kpis">
                  <span>{mAnalytics.aces} Asse</span>
                  <span>{mAnalytics.kills} Kills</span>
                  <span>{mAnalytics.blocks} Blocks</span>
                  <span>SO {mAnalytics.sideoutPct !== null ? `${mAnalytics.sideoutPct}%` : '–'}</span>
                  <span>Ø {mAnalytics.passAvgFormatted}</span>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if loadingList || loadingDetail}
        <div class="loading-box">Lade gespeicherte Spiele…</div>
      {:else if savedMatches.length === 0 && localOnlyMatches.length === 0}
        <div class="empty-archive">
          <h2>Noch keine gespeicherten Spiele</h2>
          <p>
            Beende ein Spiel im Live-Tracker und tippe auf <strong>„Spiel speichern“</strong> (funktioniert lokal auch offline),
            oder importiere oben ein gespeichertes JSON-Spiel.
          </p>
        </div>
      {:else if savedMatches.length > 0}
        <div class="matches-grid">
          {#each savedMatches as m (m.matchId)}
            <button
              type="button"
              class="match-card"
              class:won={m.winner === 'us'}
              class:lost={m.winner === 'them'}
              onclick={() => openServerMatch(m.matchId)}
            >
              <div class="mc-top">
                <span class="mc-date">{formatMatchDate(m.startedAt)}</span>
                <span class="mc-badge {m.winner}">
                  {m.winner === 'us' ? 'Sieg' : m.winner === 'them' ? 'Niederlage' : 'Remis'}
                </span>
              </div>

              <div class="mc-teams-row">
                <div class="mc-teams">
                  <span class="mc-team-us">{m.teamName}</span>
                  <span class="mc-vs">vs</span>
                  <span class="mc-team-them">{m.opponentName}</span>
                </div>
                <div class="mc-sets-score">
                  {m.setsUs} : {m.setsThem}
                </div>
              </div>

              {#if m.setsSummary}
                <div class="mc-set-chips">
                  {#each m.setsSummary.split(', ') as chip, idx}
                    <span class="mc-set-pill">S{idx + 1} {chip}</span>
                  {/each}
                  <span class="mc-sys-pill">{m.system}</span>
                </div>
              {/if}

              <div class="mc-kpis">
                <span>{m.aces} Asse</span>
                <span>{m.kills} Kills</span>
                <span>{m.blocks} Blocks</span>
                <span>Ø {m.passCount > 0 ? m.passAvg.toFixed(2) : '–'}</span>
                <span>{m.eventCount} Events</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- DETAIL-REVIEW EINES AUSGEWÄHLTEN MULTI-SATZ-SPIELS -->
      <section class="detail-hero" class:won={selectedMatch.winner === 'us'} class:lost={selectedMatch.winner === 'them'}>
        <div class="dh-main">
          <div>
            <span class="dh-badge">
              {selectedMatch.winner === 'us'
                ? `Sieg ${selectedMatch.teamName}`
                : selectedMatch.winner === 'them'
                  ? `Sieg ${selectedMatch.opponentName}`
                  : 'Unentschieden'}
              • {selectedMatch.endReason === 'rulebook' ? 'Regelwerk (25+ / +2)' : 'Manuell beendet'}
            </span>
            <h2 class="dh-teams">{selectedMatch.teamName} vs {selectedMatch.opponentName}</h2>
          </div>

          <div class="dh-sets-box">
            {#each selectedMatch.sets as s (s.setNumber)}
              <span class="dh-set-chip" class:us={s.myScore > s.opponentScore} class:them={s.opponentScore > s.myScore}>
                S{s.setNumber}: <strong>{s.myScore}:{s.opponentScore}</strong>
              </span>
            {/each}
          </div>
        </div>

        {#if (selectedMatch.players && selectedMatch.players.length > 0) || (selectedMatch.bench && selectedMatch.bench.length > 0)}
          <div class="dh-roster">
            {#if selectedMatch.players && selectedMatch.players.length > 0}
              <span class="roster-line">
                <strong>Start-6:</strong>
                {selectedMatch.players.map((p) => `P${p.position} ${p.number ? `#${p.number} ` : ''}${p.name} (${p.role})`).join(' · ')}
              </span>
            {/if}
            {#if selectedMatch.bench && selectedMatch.bench.length > 0}
              <span class="roster-line">
                <strong>Bank / Libero:</strong>
                {selectedMatch.bench.map((b) => `${b.number ? `#${b.number} ` : ''}${b.name} (${b.isLibero ? 'L' : b.role})`).join(' · ')}
              </span>
            {/if}
          </div>
        {/if}

        <div class="dh-export-row">
          <button type="button" class="exp-btn primary" onclick={handleCopySummary}>
            WhatsApp / Text kopieren
          </button>
          <button type="button" class="exp-btn" onclick={handleExportCsv}>
            CSV Export
          </button>
          <button type="button" class="exp-btn" onclick={handleExportJson}>
            JSON Backup
          </button>
          {#if copyFeedback}
            <span class="exp-feedback">{copyFeedback}</span>
          {/if}
        </div>
      </section>

      <!-- SATZ-FILTER TABS -->
      <div class="set-filter-bar" role="tablist" aria-label="Satz auswählen">
        <button
          type="button"
          role="tab"
          class="set-tab"
          class:active={selectedSetFilter === 'all'}
          aria-selected={selectedSetFilter === 'all'}
          onclick={() => (selectedSetFilter = 'all')}
        >
          Alle Sätze ({selectedMatch.events.length})
        </button>
        {#each selectedMatch.sets as s (s.setNumber)}
          <button
            type="button"
            role="tab"
            class="set-tab"
            class:active={selectedSetFilter === s.setNumber}
            aria-selected={selectedSetFilter === s.setNumber}
            onclick={() => (selectedSetFilter = s.setNumber)}
          >
            Satz {s.setNumber} ({s.myScore}:{s.opponentScore})
          </button>
        {/each}
      </div>

      <!-- KPI ÜBERSICHT -->
      {#if analytics}
        <div class="kpi-strip">
          <div class="kpi-box">
            <span class="kpi-num">{analytics.sideoutPct !== null ? `${analytics.sideoutPct}%` : '–'}</span>
            <span class="kpi-lbl">Side-out ({analytics.sideoutWon}/{analytics.sideoutTotal})</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">{analytics.breakPct !== null ? `${analytics.breakPct}%` : '–'}</span>
            <span class="kpi-lbl">Break ({analytics.breakWon}/{analytics.breakTotal})</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">{analytics.attackEfficiency !== null ? `${analytics.attackEfficiency}%` : '–'}</span>
            <span class="kpi-lbl">Angr.-Eff. ({analytics.kills}K / {analytics.attackErrors + analytics.attackBlocked}E)</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">{analytics.aces}</span>
            <span class="kpi-lbl">Asse</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">{analytics.blocks}</span>
            <span class="kpi-lbl">Kill Blocks</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">{analytics.ownErrors}</span>
            <span class="kpi-lbl">Eig. Fehler</span>
          </div>
          <div class="kpi-box">
            <span class="kpi-num">{analytics.passAvgFormatted}</span>
            <span class="kpi-lbl">
              Ø Annahme ({analytics.passCount})
              {#if analytics.passPositivePct !== null}
                · +{analytics.passPositivePct}%
              {/if}
            </span>
          </div>
        </div>

        <div class="detail-columns">
          <!-- LINKE SPALTE: SPIELER-SCORECARD & ROTATIONS-ANALYSE -->
          <div class="detail-col">
            <section class="panel-card">
              <h3 class="panel-title">Spieler-Statistik</h3>
              {#if analytics.playerStats.length === 0}
                <p class="muted-note">Keine spielerbezogenen Kontakte in dieser Auswahl erfasst.</p>
              {:else}
                <div class="table-wrap">
                  <table class="stat-table">
                    <thead>
                      <tr>
                        <th>Spieler/in</th>
                        <th>Kills</th>
                        <th>Asse</th>
                        <th>Blk</th>
                        <th>Dig</th>
                        <th>Fehl.</th>
                        <th>Ø Ann.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each analytics.playerStats as ps (ps.player)}
                        <tr>
                          <td class="player-cell">{ps.player}</td>
                          <td>{ps.kills}</td>
                          <td>{ps.aces}</td>
                          <td>{ps.blocks}</td>
                          <td>{ps.digs}</td>
                          <td class="err-cell">{ps.errors}</td>
                          <td>
                            {ps.passCount > 0 ? `${(ps.passSum / ps.passCount).toFixed(2)} (${ps.passCount})` : '–'}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </section>

            <section class="panel-card">
              <h3 class="panel-title">Rotations-Bilanz (Läufer R1–R6)</h3>
              <div class="rot-grid">
                {#each analytics.rotationStats as rs (rs.rot)}
                  <div class="rot-card" class:pos={rs.diff > 0} class:neg={rs.diff < 0}>
                    <span class="rot-name">R{rs.rot}</span>
                    <span class="rot-diff">{rs.diff > 0 ? `+${rs.diff}` : rs.diff}</span>
                    <span class="rot-sub">+{rs.won} / −{rs.lost}</span>
                    <span class="rot-so">
                      SO {rs.sideoutPct !== null ? `${rs.sideoutPct}%` : '–'}
                    </span>
                  </div>
                {/each}
              </div>
            </section>
          </div>

        <!-- RECHTE SPALTE: VOLLSTÄNDIGER SPIELVERLAUF -->
        <section class="panel-card">
          <h3 class="panel-title">Gespeicherter Spielverlauf ({filteredEvents.length})</h3>
          {#if filteredEvents.length === 0}
            <p class="muted-note">Keine Events für diesen Filter vorhanden.</p>
          {:else}
            <ul class="review-event-list">
              {#each filteredEvents as ev (ev.id)}
                <li class="rev-item {ev.quality}">
                  <div class="rev-top">
                    <span class="rev-set">S{ev.setNumber ?? 1}</span>
                    <span class="rev-rot">R{ev.rotation}</span>
                    <span class="rev-time">{ev.timestamp}</span>
                    {#if ev.scoreAfter}
                      <span class="rev-score">{ev.scoreAfter}</span>
                    {/if}
                    {#if ev.isSideout}
                      <span class="rev-sideout">Side-out</span>
                    {/if}
                    {#if ev.isMatchEnd}
                      <span class="rev-end">Ende</span>
                    {/if}
                    {#if ev.player}
                      <span class="rev-player">{ev.player} {ev.position ? `(P${ev.position})` : ''}</span>
                    {/if}
                  </div>
                  <div class="rev-action">{ev.action}</div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .history-view {
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #f8fafc;
    color: #0f172a;
    box-sizing: border-box;
  }

  .hv-header {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #ffffff;
    padding: 12px 16px;
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
    position: sticky;
    top: 0;
    z-index: 40;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .hv-header-inner {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .hv-back-btn,
  .hv-util-btn {
    min-height: 38px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid #475569;
    background: #334155;
    color: #f8fafc;
    font-size: 0.8rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }

  .hv-back-btn:hover,
  .hv-util-btn:hover:not(:disabled) {
    background: #475569;
  }

  .hv-title-wrap {
    flex: 1;
    min-width: 180px;
  }

  .hv-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 900;
    color: #f8fafc;
  }

  .hv-subtitle {
    margin: 0;
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .hv-actions {
    display: flex;
    gap: 6px;
  }

  .pin-bar {
    max-width: 1400px;
    margin: 10px auto 0;
    padding-top: 10px;
    border-top: 1px solid #334155;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .pin-label {
    font-size: 0.78rem;
    font-weight: 700;
    color: #cbd5e1;
  }

  .pin-input {
    flex: 1;
    min-width: 180px;
    min-height: 36px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid #64748b;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.85rem;
  }

  .pin-save-btn {
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 8px;
    border: none;
    background: #10b981;
    color: #022c22;
    font-weight: 800;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .hv-body {
    max-width: 1400px;
    width: 100%;
    margin: 0 auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
  }

  .feedback-banner {
    background: #ecfdf5;
    border: 1.5px solid #10b981;
    color: #065f46;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 0.85rem;
    font-weight: 700;
  }

  .error-banner {
    background: #fffbeb;
    border: 1.5px solid #f59e0b;
    color: #92400e;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 0.84rem;
    font-weight: 700;
  }

  .outbox-card {
    background: #eff6ff;
    border: 2px solid #3b82f6;
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .outbox-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  .outbox-title {
    margin: 0 0 2px;
    font-size: 0.95rem;
    font-weight: 900;
    color: #1e3a8a;
  }

  .outbox-sub {
    margin: 0;
    font-size: 0.76rem;
    color: #1e40af;
  }

  .sync-now-btn {
    min-height: 40px;
    padding: 8px 14px;
    border-radius: 9px;
    border: none;
    background: #2563eb;
    color: #ffffff;
    font-weight: 800;
    font-size: 0.82rem;
    cursor: pointer;
    touch-action: manipulation;
  }

  .outbox-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .outbox-item {
    background: #ffffff;
    border: 1px solid #bfdbfe;
    border-radius: 9px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .outbox-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85rem;
  }

  .outbox-meta {
    font-size: 0.74rem;
    color: #64748b;
  }

  .outbox-item-btns {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ob-open-btn {
    min-height: 34px;
    padding: 4px 10px;
    border-radius: 7px;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    color: #0f172a;
    font-size: 0.76rem;
    font-weight: 700;
    cursor: pointer;
  }

  .ob-del-btn {
    min-width: 34px;
    min-height: 34px;
    border-radius: 7px;
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #dc2626;
    font-weight: 800;
    cursor: pointer;
  }

  .loading-box,
  .empty-archive {
    background: #ffffff;
    border: 1.5px dashed #cbd5e1;
    border-radius: 14px;
    padding: 36px 20px;
    text-align: center;
    color: #475569;
  }

  .empty-archive h2 {
    margin: 0 0 6px;
    font-size: 1.1rem;
    color: #0f172a;
  }

  .empty-archive p {
    margin: 0 auto;
    max-width: 460px;
    font-size: 0.85rem;
  }

  .matches-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  @media (min-width: 820px) {
    .matches-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .match-card {
    text-align: left;
    background: #ffffff;
    border: 2px solid #e2e8f0;
    border-left: 6px solid #64748b;
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    cursor: pointer;
    touch-action: manipulation;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
    color: #0f172a;
    box-sizing: border-box;
  }

  .match-card.won {
    border-left-color: #10b981;
  }

  .match-card.lost {
    border-left-color: #ef4444;
  }

  .match-card:hover {
    border-color: #94a3b8;
  }

  .mc-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .mc-date {
    font-size: 0.74rem;
    font-weight: 700;
    color: #64748b;
  }

  .mc-badge {
    font-size: 0.7rem;
    font-weight: 900;
    padding: 2px 8px;
    border-radius: 9999px;
    background: #e2e8f0;
    color: #334155;
  }

  .mc-badge.us {
    background: #d1fae5;
    color: #065f46;
  }

  .mc-badge.them {
    background: #fee2e2;
    color: #991b1b;
  }

  .mc-teams-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .mc-teams {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 1rem;
    font-weight: 900;
  }

  .mc-vs {
    font-size: 0.78rem;
    color: #94a3b8;
    font-weight: 700;
  }

  .mc-team-them {
    color: #334155;
  }

  .mc-sets-score {
    font-size: 1.35rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    background: #0f172a;
    color: #ffffff;
    padding: 3px 10px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .mc-set-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .mc-set-pill {
    font-size: 0.7rem;
    font-weight: 800;
    background: #f1f5f9;
    color: #334155;
    padding: 2px 7px;
    border-radius: 6px;
  }

  .mc-sys-pill {
    font-size: 0.7rem;
    font-weight: 800;
    background: #dbeafe;
    color: #1e40af;
    padding: 2px 7px;
    border-radius: 6px;
  }

  .mc-kpis {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 0.74rem;
    font-weight: 700;
    color: #475569;
    padding-top: 6px;
    border-top: 1px solid #f1f5f9;
  }

  /* --- DETAIL VIEW --- */
  .detail-hero {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    color: #f8fafc;
    border-radius: 14px;
    padding: 16px;
    border: 2px solid #475569;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .detail-hero.won {
    border-color: #10b981;
  }

  .detail-hero.lost {
    border-color: #f43f5e;
  }

  .dh-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .dh-badge {
    font-size: 0.74rem;
    font-weight: 800;
    color: #fcd34d;
  }

  .dh-teams {
    margin: 2px 0 0;
    font-size: 1.25rem;
    font-weight: 900;
    color: #ffffff;
  }

  .dh-sets-box {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .dh-set-chip {
    padding: 5px 10px;
    border-radius: 8px;
    font-size: 0.82rem;
    background: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
  }

  .dh-set-chip.us {
    background: rgba(16, 185, 129, 0.25);
    border: 1px solid #10b981;
    color: #ecfdf5;
  }

  .dh-set-chip.them {
    background: rgba(244, 63, 94, 0.25);
    border: 1px solid #f43f5e;
    color: #fff1f2;
  }

  .dh-roster {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.14);
    font-size: 0.75rem;
    color: #cbd5e1;
  }

  .roster-line strong {
    color: #ffffff;
  }

  .set-filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .set-tab {
    min-height: 38px;
    padding: 6px 14px;
    border-radius: 9999px;
    border: 1.5px solid #cbd5e1;
    background: #ffffff;
    color: #334155;
    font-size: 0.8rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }

  .set-tab.active {
    background: #0f172a;
    border-color: #0f172a;
    color: #ffffff;
  }

  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  @media (min-width: 640px) {
    .kpi-strip {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 1024px) {
    .kpi-strip {
      grid-template-columns: repeat(6, 1fr);
    }
  }

  .kpi-box {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .kpi-num {
    font-size: 1.3rem;
    font-weight: 900;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }

  .kpi-lbl {
    font-size: 0.72rem;
    font-weight: 700;
    color: #64748b;
  }

  .detail-columns {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    align-items: start;
  }

  @media (min-width: 960px) {
    .detail-columns {
      grid-template-columns: 1fr 1.15fr;
    }
  }

  .detail-col {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .panel-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px;
    box-sizing: border-box;
    min-width: 0;
  }

  .panel-title {
    margin: 0 0 12px;
    font-size: 0.95rem;
    font-weight: 900;
    color: #0f172a;
  }

  .muted-note {
    margin: 0;
    font-size: 0.82rem;
    color: #64748b;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .stat-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .stat-table th,
  .stat-table td {
    padding: 7px 8px;
    text-align: center;
    border-bottom: 1px solid #f1f5f9;
    font-variant-numeric: tabular-nums;
  }

  .stat-table th:first-child,
  .stat-table td.player-cell {
    text-align: left;
    font-weight: 800;
  }

  .stat-table th {
    font-size: 0.72rem;
    color: #64748b;
    text-transform: uppercase;
  }

  .err-cell {
    color: #dc2626;
    font-weight: 700;
  }

  .rot-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  @media (min-width: 540px) {
    .rot-grid {
      grid-template-columns: repeat(6, 1fr);
    }
  }

  .rot-card {
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    border-radius: 10px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .rot-card.pos {
    background: #ecfdf5;
    border-color: #6ee7b7;
  }

  .rot-card.neg {
    background: #fef2f2;
    border-color: #fca5a5;
  }

  .rot-name {
    font-size: 0.72rem;
    font-weight: 900;
    color: #475569;
  }

  .rot-diff {
    font-size: 1.15rem;
    font-weight: 900;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
  }

  .rot-sub {
    font-size: 0.68rem;
    font-weight: 700;
    color: #64748b;
  }

  .review-event-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
    max-height: 540px;
    overflow-y: auto;
  }

  .rev-item {
    padding: 8px 10px;
    border-radius: 8px;
    background: #f8fafc;
    border-left: 4px solid #94a3b8;
  }

  .rev-item.good {
    background: #f0fdf4;
    border-left-color: #10b981;
  }

  .rev-item.bad {
    background: #fef2f2;
    border-left-color: #ef4444;
  }

  .rev-item.neutral {
    background: #eff6ff;
    border-left-color: #3b82f6;
  }

  .rev-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    font-size: 0.68rem;
    color: #64748b;
    margin-bottom: 2px;
  }

  .rev-set {
    background: #334155;
    color: #ffffff;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .rev-rot {
    background: #0f172a;
    color: #ffffff;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .rev-time {
    font-family: monospace;
  }

  .rev-score {
    background: #dbeafe;
    color: #1e40af;
    font-weight: 900;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .rev-sideout {
    background: #fef3c7;
    color: #92400e;
    font-weight: 800;
    padding: 0 5px;
    border-radius: 4px;
  }

  .rev-end {
    background: #f59e0b;
    color: #0f172a;
    font-weight: 900;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .rev-player {
    background: #e2e8f0;
    color: #1e293b;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .rev-action {
    font-size: 0.88rem;
    font-weight: 700;
    color: #0f172a;
  }

  .local-archive-sec {
    margin-bottom: 18px;
  }

  .local-sec-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .local-sec-title {
    margin: 0;
    font-size: 0.96rem;
    font-weight: 900;
    color: #0f172a;
  }

  .local-sec-sub {
    font-size: 0.78rem;
    color: #64748b;
    font-weight: 600;
  }

  .mc-badges-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mc-local-pill {
    font-size: 0.68rem;
    font-weight: 800;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 6px;
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
  }

  .mc-del-btn {
    border: 1px solid #fecaca;
    background: #fff1f2;
    color: #b91c1c;
    border-radius: 6px;
    width: 24px;
    height: 24px;
    font-size: 0.72rem;
    font-weight: 900;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .mc-del-btn:hover {
    background: #fee2e2;
  }

  .dh-export-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #f1f5f9;
  }

  .exp-btn {
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    color: #1e293b;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 0.78rem;
    font-weight: 800;
    cursor: pointer;
    transition: background 0.12s;
  }

  .exp-btn:hover {
    background: #f1f5f9;
  }

  .exp-btn.primary {
    background: #0f172a;
    border-color: #0f172a;
    color: #ffffff;
  }

  .exp-btn.primary:hover {
    background: #1e293b;
  }

  .exp-feedback {
    font-size: 0.78rem;
    font-weight: 700;
    color: #15803d;
  }

  .rot-so {
    font-size: 0.68rem;
    font-weight: 700;
    color: #475569;
  }
</style>
