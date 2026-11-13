<script lang="ts">
  import { generateId } from './id';
  import {
    deleteTeamPreset,
    getTeamPresets,
    saveTeamPreset
  } from './api';
  import {
    detectLineupWarnings,
    formatPlayerDisplay,
    getDefaultLineupForSystem
  } from './matchEngine';
  import type {
    MatchSetup,
    MatchFormat,
    SystemType,
    PlayerRole,
    PlayerSetup,
    BenchPlayer,
    ServingTeam,
    RotationPosition,
    TeamPreset
  } from './types';

  let { onStartMatch } = $props<{ onStartMatch: (setup: MatchSetup) => void }>();

  let teamName = $state('TVE Damen 6');
  let opponentName = $state('Gegner');
  let selectedSystem = $state<SystemType>('5-1');
  let matchFormat = $state<MatchFormat>('bo5');
  let initialServe = $state<ServingTeam>('us');
  let startingRotation = $state<RotationPosition>(1);

  let lineup = $state<PlayerSetup[]>(getDefaultLineupForSystem('5-1'));
  let bench = $state<BenchPlayer[]>([
    { id: 'bench-libero-1', number: '10', name: 'Libero 1', role: 'L', isLibero: true }
  ]);

  let presets = $state<TeamPreset[]>(typeof window !== 'undefined' ? getTeamPresets() : []);
  let selectedPresetId = $state<string>('');
  let presetFeedback = $state<string | null>(null);

  let newExtraNum = $state('');
  let newExtraName = $state('');
  let newExtraRole = $state<PlayerRole>('OH1');
  let newExtraIsLibero = $state(false);

  const courtRoleOptions: { value: PlayerRole; label: string }[] = [
    { value: 'S', label: 'Zuspiel (S)' },
    { value: 'S1', label: 'Zuspiel 1 (S1)' },
    { value: 'S2', label: 'Zuspiel 2 (S2)' },
    { value: 'OH1', label: 'Außen 1 (OH1)' },
    { value: 'OH2', label: 'Außen 2 (OH2)' },
    { value: 'MB1', label: 'Mitte 1 (MB1)' },
    { value: 'MB2', label: 'Mitte 2 (MB2)' },
    { value: 'OPP', label: 'Diagonal (OPP)' }
  ];

  const lineupWarnings = $derived(detectLineupWarnings(lineup, selectedSystem));

  function applySystemTemplate() {
    const template = getDefaultLineupForSystem(selectedSystem);
    lineup = lineup.map((p, idx) => ({
      ...p,
      role: template[idx].role
    }));
  }

  function handleSavePreset() {
    const cleanTeam = teamName.trim() || 'Mein Team';
    const existing = presets.find((p) => p.id === selectedPresetId);
    const preset: TeamPreset = {
      id: existing?.id ?? generateId('preset'),
      name: `${cleanTeam} (${selectedSystem})`,
      teamName: cleanTeam,
      system: selectedSystem,
      players: lineup.map((p) => ({ ...p })),
      bench: bench.map((b) => ({ ...b })),
      updatedAt: new Date().toISOString()
    };
    presets = saveTeamPreset(preset);
    selectedPresetId = preset.id;
    presetFeedback = `Kader "${preset.name}" gespeichert.`;
    setTimeout(() => (presetFeedback = null), 3000);
  }

  function handleLoadPreset(presetId: string) {
    selectedPresetId = presetId;
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    teamName = preset.teamName;
    selectedSystem = preset.system;
    lineup = preset.players.map((p, idx) => ({
      ...p,
      position: (idx + 1) as RotationPosition
    }));
    bench = preset.bench.map((b) => ({ ...b }));
    presetFeedback = `Kader "${preset.name}" geladen.`;
    setTimeout(() => (presetFeedback = null), 2500);
  }

  function handleDeletePreset() {
    if (!selectedPresetId) return;
    presets = deleteTeamPreset(selectedPresetId);
    selectedPresetId = '';
    presetFeedback = 'Kader-Vorlage gelöscht.';
    setTimeout(() => (presetFeedback = null), 2500);
  }

  function shiftLineupOrder(direction: 'cw' | 'ccw') {
    if (lineup.length !== 6) return;
    const rotated =
      direction === 'cw'
        ? [lineup[1], lineup[2], lineup[3], lineup[4], lineup[5], lineup[0]]
        : [lineup[5], lineup[0], lineup[1], lineup[2], lineup[3], lineup[4]];
    lineup = rotated.map((p, idx) => ({
      ...p,
      position: (idx + 1) as RotationPosition
    }));
  }

  function swapLineupRows(idxA: number, idxB: number) {
    if (idxA < 0 || idxB < 0 || idxA >= lineup.length || idxB >= lineup.length) return;
    const next = [...lineup];
    const tmp = next[idxA];
    next[idxA] = next[idxB];
    next[idxB] = tmp;
    lineup = next.map((p, idx) => ({
      ...p,
      position: (idx + 1) as RotationPosition
    }));
  }

  function addExtraPlayer() {
    const trimmed = newExtraName.trim();
    if (!trimmed) return;

    bench = [
      ...bench,
      {
        id: generateId('bench'),
        number: newExtraNum.trim() || undefined,
        name: trimmed,
        role: newExtraIsLibero ? 'L' : newExtraRole,
        isLibero: newExtraIsLibero
      }
    ];

    newExtraNum = '';
    newExtraName = '';
    newExtraIsLibero = false;
  }

  function toggleBenchLibero(index: number) {
    const p = bench[index];
    if (!p) return;
    const nextLibero = !p.isLibero;
    p.isLibero = nextLibero;
    if (nextLibero) {
      p.role = 'L';
    } else if (p.role === 'L') {
      p.role = 'OH1';
    }
  }

  function removeBenchPlayer(id: string) {
    bench = bench.filter((p) => p.id !== id);
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    let finalBench = [...bench];
    if (newExtraName.trim()) {
      finalBench.push({
        id: generateId('bench'),
        number: newExtraNum.trim() || undefined,
        name: newExtraName.trim(),
        role: newExtraIsLibero ? 'L' : newExtraRole,
        isLibero: newExtraIsLibero
      });
      newExtraNum = '';
      newExtraName = '';
    }

    const cleanedBench = finalBench.map((b, idx) => ({
      ...b,
      number: b.number?.trim() || undefined,
      name: b.name.trim() || (b.isLibero ? `Libero ${idx + 1}` : `Bank #${idx + 1}`),
      role: (b.isLibero ? 'L' : b.role) as PlayerRole
    }));

    const cleanedPlayers: PlayerSetup[] = lineup.map((p, idx) => ({
      ...p,
      id: p.id ?? generateId('starter'),
      position: (idx + 1) as RotationPosition,
      number: p.number?.trim() || undefined,
      name: p.name.trim() || `Pos ${idx + 1}`
    }));

    const formattedLineup = cleanedPlayers.map((p) => formatPlayerDisplay(p));

    onStartMatch({
      teamName: teamName.trim() || 'Mein Team',
      opponentName: opponentName.trim() || 'Gegner',
      system: selectedSystem,
      matchFormat,
      startingRotation,
      lineup: formattedLineup,
      players: cleanedPlayers,
      bench: cleanedBench,
      initialServe
    });
  }
</script>

<div class="setup-card">
  <div class="setup-top-bar">
    <h2>Spiel-Setup & Taktik</h2>

    <!-- TEAM PRESET BAR -->
    <div class="preset-bar">
      {#if presets.length > 0}
        <select
          class="preset-select"
          value={selectedPresetId}
          onchange={(e) => handleLoadPreset(e.currentTarget.value)}
          aria-label="Gespeicherten Kader laden"
        >
          <option value="">Kader laden…</option>
          {#each presets as pr (pr.id)}
            <option value={pr.id}>{pr.name}</option>
          {/each}
        </select>
        {#if selectedPresetId}
          <button
            type="button"
            class="preset-del-btn"
            onclick={handleDeletePreset}
            title="Ausgewählte Kader-Vorlage löschen"
          >
            ✕
          </button>
        {/if}
      {/if}
      <button type="button" class="preset-save-btn" onclick={handleSavePreset}>
        Kader speichern
      </button>
    </div>
  </div>

  {#if presetFeedback}
    <div class="preset-feedback" role="status">{presetFeedback}</div>
  {/if}

  <form onsubmit={handleSubmit} class="setup-form">
    <div class="setup-col-main">
      <!-- Teamnamen -->
      <div class="form-row">
        <div class="form-group">
          <label for="team">Dein Team</label>
          <input id="team" type="text" bind:value={teamName} required placeholder="z.B. TVE Damen 6" />
        </div>

        <div class="form-group">
          <label for="opponent">Gegner</label>
          <input id="opponent" type="text" bind:value={opponentName} required placeholder="z.B. Gegner" />
        </div>
      </div>

      <!-- Spielsystem, Match-Format & Erster Aufschlag -->
      <div class="form-group highlight-group">
        <div class="system-format-row">
          <div class="sub-field">
            <label for="system-select">Spielsystem</label>
            <div class="system-with-apply">
              <select id="system-select" bind:value={selectedSystem} class="system-dropdown">
                <option value="5-1">5-1 System (1 Zuspieler/in)</option>
                <option value="6-2">6-2 System (2 Zuspieler hinten)</option>
                <option value="4-2">4-2 System (Zuspiel vorne)</option>
              </select>
              <button
                type="button"
                class="apply-sys-btn"
                onclick={applySystemTemplate}
                title="Standard-Rollen für dieses Spielsystem auf Pos 1–6 anwenden"
              >
                Rollen anpassen
              </button>
            </div>
          </div>

          <div class="sub-field">
            <label for="format-select">Satz-Modus</label>
            <select id="format-select" bind:value={matchFormat} class="system-dropdown">
              <option value="bo5">Best of 5 (Satz 5 bis 15)</option>
              <option value="bo3">Best of 3 (Satz 3 bis 15)</option>
              <option value="open">Offen / Trainingssatz</option>
            </select>
          </div>
        </div>

        <div class="serve-and-rot-row">
          <div class="sub-field">
            <span class="serve-group-label">Erster Aufschlag</span>
            <div class="serve-toggle-row" role="radiogroup" aria-label="Erster Aufschlag">
              <button
                type="button"
                class="serve-choice-btn"
                class:active={initialServe === 'us'}
                aria-checked={initialServe === 'us'}
                role="radio"
                onclick={() => (initialServe = 'us')}
              >
                {teamName.trim() || 'Dein Team'}
              </button>
              <button
                type="button"
                class="serve-choice-btn opponent"
                class:active={initialServe === 'them'}
                aria-checked={initialServe === 'them'}
                role="radio"
                onclick={() => (initialServe = 'them')}
              >
                {opponentName.trim() || 'Gegner'}
              </button>
            </div>
          </div>

          <div class="sub-field">
            <span class="serve-group-label">Start-Rotation</span>
            <div class="start-rot-pills" role="radiogroup" aria-label="Start-Rotation wählen">
              {#each [1, 2, 3, 4, 5, 6] as const as r}
                <button
                  type="button"
                  class="start-rot-pill"
                  class:active={startingRotation === r}
                  onclick={() => (startingRotation = r)}
                >
                  R{r}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <div class="lineup-header">
        <div>
          <h3>Startaufstellung (Pos 1–6)</h3>
          <p class="subtitle">Trikotnummer, Name & taktische Rolle eintragen:</p>
        </div>
        <div class="lineup-shift-btns">
          <button type="button" class="shift-btn" onclick={() => shiftLineupOrder('ccw')} title="Aufstellung gegen Uhrzeigersinn schieben">↺</button>
          <button type="button" class="shift-btn" onclick={() => shiftLineupOrder('cw')} title="Aufstellung im Uhrzeigersinn rotieren">↻</button>
        </div>
      </div>

      {#if lineupWarnings.length > 0}
        <div class="lineup-warning-box" role="status">
          {#each lineupWarnings as w}
            <div>⚠ {w}</div>
          {/each}
        </div>
      {/if}

      <!-- Startaufstellung (Positionen 1 bis 6) -->
      <div class="lineup-list">
        {#each lineup as player, index (player.id ?? index)}
          <div class="pos-row">
            <span class="pos-badge">P{player.position}{player.position === 1 ? ' ★' : ''}</span>

            <input
              type="text"
              maxlength="3"
              placeholder="#"
              bind:value={lineup[index].number}
              class="num-input"
              aria-label={`Trikotnummer Position ${player.position}`}
            />

            <input
              type="text"
              placeholder={`Spieler/in ${player.position}`}
              bind:value={lineup[index].name}
              class="name-input"
            />

            <select bind:value={lineup[index].role} class="role-select">
              {#each courtRoleOptions as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>

            <button
              type="button"
              class="swap-btn"
              onclick={() => swapLineupRows(index, (index + 1) % 6)}
              title={`Mit Position ${((index + 1) % 6) + 1} tauschen`}
              aria-label={`Position ${player.position} nach unten tauschen`}
            >
              ⇅
            </button>
          </div>
        {/each}
      </div>
    </div>

    <!-- AUSWECHSELSPIELER & LIBERO (BANK) -->
    <div class="bench-setup-section">
      <h3>Auswechselspieler & Libero (Bank)</h3>
      <p class="subtitle">
        Registriere alle Bankspieler vor Spielbeginn. Markiere Liberos mit <strong>Libero</strong>.
      </p>

      <div class="add-extra-box">
        <div class="add-extra-top">
          <input
            type="text"
            maxlength="3"
            placeholder="#"
            bind:value={newExtraNum}
            class="num-input"
            aria-label="Trikotnummer Extra-Spieler"
          />

          <input
            type="text"
            placeholder="Extra-Spieler Name..."
            bind:value={newExtraName}
            class="name-input"
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addExtraPlayer();
              }
            }}
          />

          {#if !newExtraIsLibero}
            <select bind:value={newExtraRole} class="role-select" aria-label="Rolle des Auswechselspielers">
              {#each courtRoleOptions as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          {/if}
        </div>

        <div class="add-extra-actions">
          <label class="libero-checkbox" class:checked={newExtraIsLibero}>
            <input type="checkbox" bind:checked={newExtraIsLibero} />
            <span>Als Libero (L) markieren</span>
          </label>

          <button
            type="button"
            class="add-player-btn"
            onclick={addExtraPlayer}
            disabled={!newExtraName.trim()}
          >
            + Spieler hinzufügen
          </button>
        </div>
      </div>

      {#if bench.length === 0}
        <p class="empty-bench-hint">Noch keine Auswechselspieler oder Liberos registriert.</p>
      {:else}
        <div class="bench-list">
          {#each bench as bPlayer, index (bPlayer.id)}
            <div class="bench-row" class:is-libero={bPlayer.isLibero}>
              <button
                type="button"
                class="libero-toggle-pill"
                class:active={bPlayer.isLibero}
                onclick={() => toggleBenchLibero(index)}
                title="Als Libero markieren / aufheben"
                aria-pressed={bPlayer.isLibero}
              >
                {bPlayer.isLibero ? 'Libero' : 'Bank'}
              </button>

              <input
                type="text"
                maxlength="3"
                placeholder="#"
                bind:value={bench[index].number}
                class="num-input"
                aria-label="Trikotnummer"
              />

              <input
                type="text"
                bind:value={bench[index].name}
                placeholder="Name"
                class="name-input"
              />

              {#if bPlayer.isLibero}
                <span class="libero-role-tag">L</span>
              {:else}
                <select bind:value={bench[index].role} class="role-select">
                  {#each courtRoleOptions as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              {/if}

              <button
                type="button"
                class="remove-bench-btn"
                onclick={() => removeBenchPlayer(bPlayer.id)}
                aria-label="Spieler entfernen"
                title="Spieler entfernen"
              >
                ✕
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <button type="submit" class="start-btn">
      Spiel starten & Tracker öffnen
    </button>
  </form>
</div>

<style>
  .setup-card {
    max-width: 520px;
    margin: 0 auto;
    padding: 1.5rem;
    background: #ffffff;
    color: #0f172a;
    color-scheme: light;
    text-align: left;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    font-family: system-ui, sans-serif;
    box-sizing: border-box;
  }

  @media (min-width: 600px) {
    .setup-card {
      max-width: 640px;
      padding: 1.75rem;
    }
  }

  @media (min-width: 900px), (min-width: 720px) and (orientation: landscape) {
    .setup-card {
      max-width: 1160px;
      width: calc(100% - 32px);
      margin: 20px auto;
      padding: 1.75rem 2rem;
    }

    .setup-form {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      gap: 24px;
      align-items: start;
    }

    .setup-col-main .lineup-list {
      margin-bottom: 0;
    }

    .bench-setup-section {
      border-top: none;
      padding: 16px;
      margin-bottom: 0;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
    }

    .bench-setup-section h3 {
      margin-top: 0;
    }

    .start-btn {
      grid-column: 1 / -1;
    }
  }

  .setup-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .setup-card h2 {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 800;
    color: #0f172a;
  }

  .preset-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .preset-select {
    padding: 7px 10px;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 700;
    background: #ffffff;
    color: #0f172a;
  }

  .preset-save-btn {
    padding: 7px 12px;
    border: 1.5px solid #0f172a;
    border-radius: 8px;
    background: #0f172a;
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }

  .preset-del-btn {
    padding: 6px 9px;
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #dc2626;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 800;
    cursor: pointer;
  }

  .preset-feedback {
    background: #ecfdf5;
    border: 1px solid #86efac;
    color: #065f46;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 700;
    margin-bottom: 12px;
  }

  .setup-card h3 {
    margin: 0.75rem 0 0.4rem;
    font-size: 1rem;
    font-weight: 800;
    color: #0f172a;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-group {
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-group label,
  .sub-field label {
    font-weight: bold;
    font-size: 0.82rem;
    color: #475569;
  }

  .form-group input,
  .system-dropdown {
    padding: 9px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.95rem;
    background-color: #ffffff;
    color: #0f172a;
    width: 100%;
    box-sizing: border-box;
  }

  .highlight-group {
    background: #f1f5f9;
    padding: 12px;
    border-radius: 10px;
    gap: 10px;
  }

  .system-format-row,
  .serve-and-rot-row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  @media (min-width: 560px) {
    .system-format-row,
    .serve-and-rot-row {
      grid-template-columns: 1fr 1fr;
    }
  }

  .sub-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .system-with-apply {
    display: flex;
    gap: 6px;
  }

  .system-dropdown {
    background: white;
    font-weight: bold;
    color: #1e293b;
  }

  .apply-sys-btn {
    padding: 0 10px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #334155;
    border-radius: 6px;
    font-size: 0.72rem;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  .apply-sys-btn:hover {
    background: #e2e8f0;
  }

  .serve-group-label {
    font-weight: bold;
    font-size: 0.82rem;
    color: #475569;
  }

  .serve-toggle-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .serve-choice-btn {
    min-height: 40px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 2px solid #cbd5e1;
    background: #ffffff;
    color: #475569;
    font-size: 0.82rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .serve-choice-btn.active {
    background: #ecfdf5;
    border-color: #16a34a;
    color: #15803d;
  }

  .serve-choice-btn.opponent.active {
    background: #fff1f2;
    border-color: #e11d48;
    color: #be123c;
  }

  .start-rot-pills {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  }

  .start-rot-pill {
    min-height: 40px;
    border-radius: 7px;
    border: 1.5px solid #cbd5e1;
    background: #ffffff;
    color: #334155;
    font-size: 0.78rem;
    font-weight: 800;
    cursor: pointer;
  }

  .start-rot-pill.active {
    background: #2563eb;
    border-color: #1d4ed8;
    color: #ffffff;
  }

  .lineup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .lineup-shift-btns {
    display: flex;
    gap: 4px;
  }

  .shift-btn,
  .swap-btn {
    min-width: 34px;
    min-height: 34px;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    color: #334155;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }

  .shift-btn:hover,
  .swap-btn:hover {
    background: #e2e8f0;
  }

  .lineup-warning-box {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 0.78rem;
    font-weight: 700;
    margin-bottom: 10px;
  }

  .subtitle {
    font-size: 0.8rem;
    color: #64748b;
    margin-top: 0;
    margin-bottom: 10px;
  }

  .lineup-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 1.5rem;
  }

  .pos-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pos-badge {
    min-width: 44px;
    font-size: 0.78rem;
    font-weight: 800;
    color: #1e293b;
    background: #e2e8f0;
    padding: 7px 6px;
    border-radius: 6px;
    text-align: center;
    white-space: nowrap;
  }

  .num-input {
    width: 44px;
    flex-shrink: 0;
    padding: 8px 4px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.86rem;
    font-weight: 800;
    text-align: center;
    box-sizing: border-box;
  }

  .name-input {
    flex: 1;
    min-width: 0;
    padding: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background-color: #ffffff;
    color: #0f172a;
    font-size: 0.88rem;
  }

  .name-input::placeholder,
  .num-input::placeholder,
  .form-group input::placeholder {
    color: #94a3b8;
  }

  .role-select {
    padding: 8px 6px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background-color: #ffffff;
    color: #0f172a;
    font-weight: 700;
    font-size: 0.82rem;
    max-width: 145px;
  }

  .bench-setup-section {
    border-top: 2px solid #f1f5f9;
    padding-top: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .add-extra-box {
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
  }

  .add-extra-top {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .add-extra-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .libero-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    color: #334155;
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
  }

  .libero-checkbox.checked {
    background: #ecfdf5;
    border-color: #10b981;
    color: #065f46;
  }

  .libero-checkbox input {
    margin: 0;
    accent-color: #059669;
  }

  .add-player-btn {
    min-height: 36px;
    padding: 6px 12px;
    background: #0f172a;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }

  .add-player-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .empty-bench-hint {
    font-size: 0.8rem;
    color: #94a3b8;
    font-style: italic;
    margin: 4px 0 0;
  }

  .bench-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .bench-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 8px;
  }

  .bench-row.is-libero {
    background: #f0fdf4;
    border-color: #86efac;
  }

  .libero-toggle-pill {
    min-height: 34px;
    padding: 4px 8px;
    font-size: 0.74rem;
    font-weight: 800;
    border-radius: 6px;
    border: 1.5px solid #cbd5e1;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
    white-space: nowrap;
    touch-action: manipulation;
  }

  .libero-toggle-pill.active {
    background: #059669;
    border-color: #047857;
    color: #ffffff;
  }

  .libero-role-tag {
    font-size: 0.78rem;
    font-weight: 800;
    color: #065f46;
    background: #d1fae5;
    padding: 6px 10px;
    border-radius: 6px;
    white-space: nowrap;
  }

  .remove-bench-btn {
    min-width: 32px;
    min-height: 32px;
    border: none;
    background: transparent;
    color: #94a3b8;
    font-size: 0.9rem;
    font-weight: 800;
    border-radius: 6px;
    cursor: pointer;
  }

  .remove-bench-btn:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  .start-btn {
    width: 100%;
    min-height: 48px;
    padding: 14px;
    background: #16a34a;
    color: white;
    font-size: 1.05rem;
    font-weight: bold;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    touch-action: manipulation;
    transition: background-color 0.15s ease, transform 0.1s ease;
  }

  .start-btn:hover {
    background: #15803d;
  }
</style>
