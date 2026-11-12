<script lang="ts">
  import { generateId } from './id';
  import type {
    MatchSetup,
    SystemType,
    PlayerRole,
    PlayerSetup,
    BenchPlayer,
    ServingTeam
  } from './types';

  // Props: Event-Callback, um die fertigen Daten an die Hauptseite zu übergeben
  let { onStartMatch } = $props<{ onStartMatch: (setup: MatchSetup) => void }>();

  let teamName = $state("TVE Damen 6");
  let opponentName = $state("Gegner");
  let selectedSystem = $state<SystemType>("5-1");
  let initialServe = $state<ServingTeam>("us");

  // Standard-Aufstellung für das 5-1 System (Pos 1 bis 6)
  let lineup = $state<PlayerSetup[]>([
    { id: 'starter-1', position: 1, name: "Zuspieler/in 1", role: "S" },
    { id: 'starter-2', position: 2, name: "Außenangriff 1", role: "OH1" },
    { id: 'starter-3', position: 3, name: "Mittelblock 1", role: "MB1" },
    { id: 'starter-4', position: 4, name: "Diagonal", role: "OPP" },
    { id: 'starter-5', position: 5, name: "Außenangriff 2", role: "OH2" },
    { id: 'starter-6', position: 6, name: "Mittelblock 2", role: "MB2" }
  ]);

  // Vorregistrierte Auswechselspieler & Libero(s) für das Spiel
  let bench = $state<BenchPlayer[]>([
    { id: 'bench-libero-1', name: "Libero 1", role: "L", isLibero: true }
  ]);

  // Formular-Felder zum Hinzufügen weiterer Bankspieler
  let newExtraName = $state("");
  let newExtraRole = $state<PlayerRole>("OH1");
  let newExtraIsLibero = $state(false);

  // Feldspieler-Rollen für Startaufstellung & reguläre Auswechselspieler
  const courtRoleOptions: { value: PlayerRole; label: string }[] = [
    { value: 'S', label: 'Zuspiel (S)' },
    { value: 'OH1', label: 'Außen 1 (OH1)' },
    { value: 'OH2', label: 'Außen 2 (OH2)' },
    { value: 'MB1', label: 'Mitte 1 (MB1)' },
    { value: 'MB2', label: 'Mitte 2 (MB2)' },
    { value: 'OPP', label: 'Diagonal (OPP)' }
  ];

  function addExtraPlayer() {
    const trimmed = newExtraName.trim();
    if (!trimmed) return;

    bench = [
      ...bench,
      {
        id: generateId('bench'),
        name: trimmed,
        role: newExtraIsLibero ? 'L' : newExtraRole,
        isLibero: newExtraIsLibero
      }
    ];

    newExtraName = "";
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

    // Falls noch ein Name im "Extra-Spieler"-Feld steht, automatisch übernehmen
    let finalBench = [...bench];
    if (newExtraName.trim()) {
      finalBench.push({
        id: generateId('bench'),
        name: newExtraName.trim(),
        role: newExtraIsLibero ? 'L' : newExtraRole,
        isLibero: newExtraIsLibero
      });
      newExtraName = "";
    }

    const cleanedBench = finalBench
      .map((b, idx) => ({
        ...b,
        name: b.name.trim() || (b.isLibero ? `Libero ${idx + 1}` : `Bank #${idx + 1}`),
        role: (b.isLibero ? 'L' : b.role) as PlayerRole
      }));

    // Lineup in das erwartete string[] Format für Court & MatchSetup formatieren
    const formattedLineup = lineup.map((p) => {
      const trimmedName = p.name ? p.name.trim() : "";
      return trimmedName ? `${trimmedName} (${p.role})` : `Pos ${p.position} (${p.role})`;
    });

    onStartMatch({
      teamName: teamName.trim() || "Mein Team",
      opponentName: opponentName.trim() || "Gegner",
      system: selectedSystem,
      lineup: formattedLineup,
      players: lineup.map((p) => ({
        ...p,
        id: p.id ?? generateId('starter'),
        name: p.name.trim() || `Pos ${p.position}`
      })),
      bench: cleanedBench,
      initialServe
    });
  }
</script>

<div class="setup-card">
  <h2>Spiel-Setup & Taktik</h2>

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

      <!-- Dropdown für Spielsystem & Erster Aufschlag -->
      <div class="form-group highlight-group">
        <label for="system-select">Spielsystem</label>
        <select id="system-select" bind:value={selectedSystem} class="system-dropdown">
          <option value="5-1">5-1 System (1 Zuspieler/in)</option>
          <option value="6-2">6-2 System (2 Zuspieler/innen aus Hinterfeld)</option>
          <option value="4-2">4-2 System (Zuspiel von vorne)</option>
        </select>

        <span class="serve-group-label">Erster Aufschlag (Satzbeginn)</span>
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

      <h3>Startaufstellung (Rotation 1)</h3>
      <p class="subtitle">Trage die 6 Feldspielerinnen auf ihren Startpositionen (1–6) ein:</p>

      <!-- Startaufstellung (Positionen 1 bis 6) -->
      <div class="lineup-list">
        {#each lineup as player, index}
          <div class="pos-row">
            <span class="pos-badge">Pos {player.position} {player.position === 1 ? '(Aufschlag)' : ''}</span>

            <input
              type="text"
              placeholder={`Name / Trikot #${player.position}`}
              bind:value={lineup[index].name}
              class="name-input"
            />

            <select bind:value={lineup[index].role} class="role-select">
              {#each courtRoleOptions as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
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

      <!-- Neuen Extra-Spieler hinzufügen -->
      <div class="add-extra-box">
        <div class="add-extra-top">
          <input
            type="text"
            placeholder="Extra-Spieler Name / #Trikot..."
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

      <!-- Liste der registrierten Bankspieler -->
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
                bind:value={bench[index].name}
                placeholder="Name / #Trikot"
                class="name-input"
              />

              {#if bPlayer.isLibero}
                <span class="libero-role-tag">Rolle: L</span>
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
    max-width: 500px;
    margin: 0 auto;
    padding: 1.5rem;
    background: #ffffff;
    color: #0f172a;
    color-scheme: light;
    text-align: left;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    font-family: system-ui, sans-serif;
    box-sizing: border-box;
  }

  @media (min-width: 600px) {
    .setup-card {
      max-width: 620px;
      padding: 2rem;
    }
  }

  /* Landscape iPad & 16:9 / 16:10 Laptops: 2-Spalten-Setup */
  @media (min-width: 900px), (min-width: 720px) and (orientation: landscape) {
    .setup-card {
      max-width: 1140px;
      width: calc(100% - 32px);
      margin: 20px auto;
      padding: 1.75rem 2rem;
    }

    .setup-form {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
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
  .setup-card h2 {
    margin: 0 0 1rem;
    font-size: 1.35rem;
    font-weight: 800;
    color: #0f172a;
  }
  .setup-card h3 {
    margin: 0.75rem 0 0.6rem;
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
  .form-group label {
    font-weight: bold;
    font-size: 0.85rem;
    color: #475569;
  }
  .form-group input, .system-dropdown {
    padding: 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 1rem;
    background-color: #ffffff;
    color: #0f172a;
  }
  .highlight-group {
    background: #f1f5f9;
    padding: 12px;
    border-radius: 8px;
  }
  .system-dropdown {
    background: white;
    font-weight: bold;
    color: #1e293b;
  }
  .serve-group-label {
    margin-top: 8px;
    font-weight: bold;
    font-size: 0.85rem;
    color: #475569;
  }
  .serve-toggle-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .serve-choice-btn {
    min-height: 42px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 2px solid #cbd5e1;
    background: #ffffff;
    color: #475569;
    font-size: 0.85rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
    box-sizing: border-box;
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
  .subtitle {
    font-size: 0.8rem;
    color: #64748b;
    margin-top: -8px;
    margin-bottom: 12px;
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
    gap: 8px;
  }
  .pos-badge {
    min-width: 65px;
    font-size: 0.8rem;
    font-weight: bold;
    color: #1e293b;
    background: #e2e8f0;
    padding: 6px 8px;
    border-radius: 4px;
    text-align: center;
  }
  .name-input {
    flex: 1;
    min-width: 0;
    padding: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background-color: #ffffff;
    color: #0f172a;
    font-size: 0.9rem;
  }
  .name-input::placeholder,
  .form-group input::placeholder {
    color: #94a3b8;
  }
  .role-select {
    padding: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background-color: #ffffff;
    color: #0f172a;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .role-select option,
  .system-dropdown option {
    background-color: #ffffff;
    color: #0f172a;
  }

  /* --- AUSWECHSELSPIELER & LIBERO SEKTION --- */
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
    gap: 8px;
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
    font-size: 0.82rem;
    font-weight: 700;
    color: #334155;
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    padding: 7px 10px;
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
    min-height: 38px;
    padding: 6px 12px;
    background: #0f172a;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 0.82rem;
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
    min-width: 34px;
    min-height: 34px;
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
  .start-btn:active {
    transform: scale(0.98);
  }
</style>
