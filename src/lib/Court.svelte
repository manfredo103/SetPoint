<script lang="ts">
  import type { PlayerSelection, RotationPosition, FormationMode, ServingTeam } from './types';
  import ReceiveFormation from './ReceiveFormation.svelte';

  interface Props {
    myTeamLineup?: (string | any)[];
    opponentLineup?: string[];
    currentRotation?: number;
    opponentRotation?: number;
    selectedPlayer?: PlayerSelection | null;
    onSelectPlayer?: (selection: PlayerSelection | null) => void;
    onRotationChange?: (rotation: number) => void;
    showOpponent?: boolean;
    myTeamName?: string;
    opponentName?: string;
    formationMode?: FormationMode;
    onFormationChange?: (mode: FormationMode) => void;
    activeLiberoName?: string | null;
    servingTeam?: ServingTeam;
  }

  let {
    myTeamLineup = $bindable(["#1 (S)", "#2 (OH1)", "#3 (MB1)", "#4 (OPP)", "#5 (OH2)", "#6 (MB2)"]),
    opponentLineup = $bindable(["#1", "#2", "#3", "#4", "#5", "#6"]),
    currentRotation = $bindable(1),
    opponentRotation = $bindable(1),
    selectedPlayer = $bindable(null),
    onSelectPlayer,
    onRotationChange,
    showOpponent = true,
    myTeamName = "Mein Team",
    opponentName = "Gegner",
    formationMode = $bindable<FormationMode>('base'),
    onFormationChange,
    activeLiberoName = 'L',
    servingTeam = 'us'
  }: Props = $props();

  // Rotations-Formel für Uhrzeigersinn-Rotation (Läufer zählt herunter: 1 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1):
  // playerIndex = (pos - rot + 6) % 6
  // Inklusive automatischem FIVB Libero-Wechsel (L ersetzt MB1/MB2 im Hinterfeld Pos 1, 5, 6;
  // im Vorderfeld Pos 2, 3, 4 wechselt L automatisch wieder mit MB1/MB2 zurück)
  function getPlayerAtPosition(
    lineup: (string | any)[],
    pos: RotationPosition,
    rot: number,
    applyLiberoRule: boolean = true
  ) {
    const playerIndex = (pos - rot + 6) % 6;
    const item = lineup ? lineup[playerIndex] : undefined;
    let playerStr = `#${playerIndex + 1}`;
    let roleStr = '';
    if (typeof item === 'string') {
      playerStr = item;
      const match = item.match(/\((MB1|MB2|MB)\)/i);
      if (match) roleStr = match[1].toUpperCase();
    } else if (item && typeof item === 'object') {
      roleStr = (item.role ?? '').toUpperCase();
      playerStr = item.name ? (item.role ? `${item.name} (${item.role})` : item.name) : (item.role ?? `#${playerIndex + 1}`);
    }

    const isBackRow = pos === 1 || pos === 5 || pos === 6;
    const isMB = roleStr === 'MB1' || roleStr === 'MB2' || roleStr === 'MB';
    if (applyLiberoRule && isBackRow && isMB && activeLiberoName) {
      playerStr = activeLiberoName === 'L' ? `L (für ${roleStr})` : `${activeLiberoName} (L)`;
    }

    return {
      player: playerStr,
      playerIndex
    };
  }

  const activeCourtPlayerNames = $derived.by(() => {
    const map: Partial<Record<RotationPosition, string>> = {};
    for (const pos of [1, 2, 3, 4, 5, 6] as RotationPosition[]) {
      map[pos] = getPlayerAtPosition(myTeamLineup, pos, currentRotation, true).player;
    }
    return map;
  });

  function handleNextRotation() {
    // Im Volleyball rotiert man im Uhrzeigersinn (Läufer zählt herunter: 1 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1)
    const nextRot = currentRotation === 1 ? 6 : currentRotation - 1;
    currentRotation = nextRot;
    onRotationChange?.(nextRot);

    // Wenn aktuell ein eigener Spieler ausgewählt ist, dessen Metadaten aktualisieren
    if (selectedPlayer && selectedPlayer.team === 'myTeam') {
      const { player, playerIndex } = getPlayerAtPosition(myTeamLineup, selectedPlayer.position, nextRot);
      selectedPlayer = {
        ...selectedPlayer,
        player,
        playerIndex,
        rotation: nextRot
      };
      onSelectPlayer?.(selectedPlayer);
    }
  }

  function handlePrevRotation() {
    // Rückwärts (gegen den Uhrzeigersinn: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 1)
    const prevRot = (currentRotation % 6) + 1;
    currentRotation = prevRot;
    onRotationChange?.(prevRot);

    if (selectedPlayer && selectedPlayer.team === 'myTeam') {
      const { player, playerIndex } = getPlayerAtPosition(myTeamLineup, selectedPlayer.position, prevRot);
      selectedPlayer = {
        ...selectedPlayer,
        player,
        playerIndex,
        rotation: prevRot
      };
      onSelectPlayer?.(selectedPlayer);
    }
  }

  function handleSelect(team: 'myTeam' | 'opponent', position: RotationPosition) {
    if (isSelected(team, position)) {
      selectedPlayer = null;
      onSelectPlayer?.(null);
      return;
    }

    const rot = team === 'myTeam' ? currentRotation : opponentRotation;
    const lineup = team === 'myTeam' ? myTeamLineup : opponentLineup;
    const { player, playerIndex } = getPlayerAtPosition(lineup, position, rot);
    const row = (position === 2 || position === 3 || position === 4) ? 'front' : 'back';
    const isServer =
      position === 1 &&
      ((team === 'myTeam' && servingTeam === 'us') ||
        (team === 'opponent' && servingTeam === 'them'));

    const selection: PlayerSelection = {
      team,
      position,
      player,
      playerIndex,
      rotation: rot,
      row,
      isServer
    };

    selectedPlayer = selection;
    onSelectPlayer?.(selection);
  }

  function isSelected(team: 'myTeam' | 'opponent', position: RotationPosition): boolean {
    return (
      selectedPlayer !== null &&
      selectedPlayer.team === team &&
      selectedPlayer.position === position
    );
  }

  function setFormation(mode: FormationMode) {
    formationMode = mode;
    onFormationChange?.(mode);
  }

  function toggleFormation() {
    const nextMode: FormationMode = formationMode === 'base' ? 'receive' : 'base';
    setFormation(nextMode);
  }

  // Position Metadaten für Tooltips und Barrierefreiheit
  const posLabels: Record<RotationPosition, string> = {
    1: 'Pos 1 (Hinten Rechts / Aufschlag)',
    2: 'Pos 2 (Vorne Rechts)',
    3: 'Pos 3 (Vorne Mitte)',
    4: 'Pos 4 (Vorne Links)',
    5: 'Pos 5 (Hinten Links)',
    6: 'Pos 6 (Hinten Mitte)'
  };
</script>

<div class="court-wrapper">
  <!-- FORMATIONS-SWITCHER (HAUPTTOGGLE: GRUNDPOSITION vs ANNAHME-RIEGEL) -->
  <div class="formation-switch-container">
    <div class="formation-tabs" role="tablist" aria-label="Spielfeld Formations-Auswahl">
      <button
        type="button"
        role="tab"
        class="tab-btn"
        class:active={formationMode === 'base'}
        aria-selected={formationMode === 'base'}
        onclick={() => setFormation('base')}
      >
        <span class="tab-label">Grundaufstellung</span>
      </button>

      <button
        type="button"
        role="tab"
        class="tab-btn receive-tab"
        class:active={formationMode === 'receive'}
        aria-selected={formationMode === 'receive'}
        onclick={() => setFormation('receive')}
      >
        <span class="tab-label">Annahme-Aufstellung</span>
      </button>
    </div>

    <button
      type="button"
      class="quick-toggle-btn"
      onclick={toggleFormation}
      title="Zwischen Grundaufstellung und Annahme-Riegel wechseln"
      aria-label="Formation umschalten"
    >
      ⇄
    </button>


      <div class="rotation-badge">
        <span class="rot-title">Rot.</span>
        <span class="rot-value">{currentRotation}</span>
      </div>

	<button 
	type="button" 
	class="rot-btn prev" 
	onclick={handleNextRotation}
	aria-label="Nächste Rotation (im Uhrzeigersinn)"
	title="Nächste Rotation (im Uhrzeigersinn)"
	>
	<span class="icon">↻</span>
	<!--<span class="label"></span> -->
	</button>
  </div>

  <!-- ROTATION BAR & SCHNELLWAHL -->

  <header class="court-header">
  <!--
    <div class="rotation-control">
      <button 
        type="button"
        class="rot-btn prev"
        onclick={handlePrevRotation}
        aria-label="Vorherige Rotation"
        title="Vorherige Rotation"
      >
        ↺
      </button>

      <div class="rotation-badge">
        <span class="rot-title">Rotation</span>
        <span class="rot-value">{currentRotation}</span>
      </div>

      <button 
        type="button" 
        class="rot-btn next" 
        onclick={handleNextRotation}
        aria-label="Nächste Rotation (im Uhrzeigersinn)"
        title="Nächste Rotation (im Uhrzeigersinn)"
      >
        <span class="icon">↻</span>
        <span class="label">Nächste Rotation</span>
      </button>
    </div> 
	-->

    <!-- Quick Rotation Pill Strip (1 bis 6) -->
    <div class="rotation-pills" role="radiogroup" aria-label="Rotation direkt wählen">
      {#each [1, 2, 3, 4, 5, 6] as rot}
        <button
          type="button"
          class="pill-btn"
          class:active={currentRotation === rot}
          onclick={() => {
            currentRotation = rot;
            onRotationChange?.(rot);
            if (selectedPlayer && selectedPlayer.team === 'myTeam') {
              const { player, playerIndex } = getPlayerAtPosition(myTeamLineup, selectedPlayer.position, rot);
              selectedPlayer = { ...selectedPlayer, player, playerIndex, rotation: rot };
              onSelectPlayer?.(selectedPlayer);
            }
          }}
          aria-label={`Rotation ${rot}`}
          aria-checked={currentRotation === rot}
          role="radio"
        >
          {rot}
        </button>
      {/each}
    </div>
  </header>

  <!-- ANZEIGE DES FELDES -->
  {#if formationMode === 'receive'}
    <div class="svg-court-wrapper" role="region" aria-label="5-1 Annahme und Transition">
      <ReceiveFormation
        bind:currentRotation
        playerNames={activeCourtPlayerNames}
        hasLibero={Boolean(activeLiberoName)}
      />
    </div>
  {:else}
    <!-- ═════════════════════════════════════════════════════════════ -->
    <!-- KLASSISCHES SPIELFELD (GRUNDAUFSTELLUNG)                      -->
    <!-- ═════════════════════════════════════════════════════════════ -->
    <div class="court-card" role="region" aria-label="Volleyball Spielfeld">
      
      {#if showOpponent}
        <!-- GEGNER HÄLFTE (OBEN) -->
        <section class="court-half opponent-half" aria-label="Gegnerische Feldhälfte">
          <div class="half-header">
            <span class="badge opponent-badge">
              {opponentName}
            </span>
            <span class="half-hint">Rückraum oben • Netz unten</span>
          </div>

          <div class="grid-section back-row">
            <!-- Gegner Hinterzone (180° gedreht, Blick zum Netz): Pos 1 (Links oben / Aufschlag), Pos 6 (Mitte), Pos 5 (Rechts oben) -->
            {#each [1, 6, 5] as const as pos}
              {@const { player } = getPlayerAtPosition(opponentLineup, pos, opponentRotation)}
              {@const isOppServerPos = pos === 1 && servingTeam === 'them'}
              <button
                type="button"
                class="pos-box opponent-box"
                class:server-box={isOppServerPos}
                class:selected={isSelected('opponent', pos)}
                onclick={() => handleSelect('opponent', pos)}
                aria-label={`Gegner ${posLabels[pos]}: ${player}${isOppServerPos ? ' (Aufschlag)' : ''}`}
                aria-pressed={isSelected('opponent', pos)}
              >
                <span class="pos-badge" class:server-badge={isOppServerPos}>P{pos}</span>
                <span class="player-name">{player}</span>
                {#if isOppServerPos}
                  <div class="serve-indicator" title="Gegnerischer Aufschlag">
                    <span class="serve-text">SERVE</span>
                  </div>
                {/if}
              </button>
            {/each}
          </div>

          <!-- 3-Meter Angriffslinie (Gegner) -->
          <div class="attack-line" aria-hidden="true">
            <span class="line-label"></span>
          </div>

          <div class="grid-section front-row">
            <!-- Gegner Vorderzone am Netz (180° gedreht): Pos 2 (Links / ggü. P4), Pos 3 (Mitte / ggü. P3), Pos 4 (Rechts / ggü. P2) -->
            {#each [2, 3, 4] as const as pos}
              {@const { player } = getPlayerAtPosition(opponentLineup, pos, opponentRotation)}
              <button
                type="button"
                class="pos-box opponent-box front"
                class:selected={isSelected('opponent', pos)}
                onclick={() => handleSelect('opponent', pos)}
                aria-label={`Gegner ${posLabels[pos]}: ${player}`}
                aria-pressed={isSelected('opponent', pos)}
              >
                <span class="pos-badge">P{pos}</span>
                <span class="player-name">{player}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <!-- DAS NETZ (TRENNLINIE MIT ANTENNEN) -->
      <div class="net-separator" aria-label="Netzlinie">
        <div class="antenna left" aria-hidden="true" title="Antenne Links"></div>
        <div class="net-band">
          <span class="net-mesh" aria-hidden="true">══════</span>
          <span class="net-title">NETZ</span>
          <span class="net-mesh" aria-hidden="true">══════</span>
        </div>
        <div class="antenna right" aria-hidden="true" title="Antenne Rechts"></div>
      </div>

      <!-- MEIN TEAM HÄLFTE (UNTEN) -->
      <section class="court-half my-half" aria-label="Eigene Feldhälfte">
        <!-- MODUS: REGULÄRE GRUNDAUFSTELLUNG (2x3 GRID) -->
        <div class="half-header">
          <span class="badge my-badge">{myTeamName}</span>
          <span class="half-hint">Netz oben • Rückraum unten</span>
        </div>

        <div class="grid-section front-row">
          {#each [4, 3, 2] as const as pos}
            {@const { player } = getPlayerAtPosition(myTeamLineup, pos, currentRotation)}
            <button
              type="button"
              class="pos-box my-box front"
              class:selected={isSelected('myTeam', pos)}
              onclick={() => handleSelect('myTeam', pos)}
              aria-label={`${myTeamName} ${posLabels[pos]}: ${player}`}
              aria-pressed={isSelected('myTeam', pos)}
            >
              <span class="pos-badge">P{pos}</span>
              <span class="player-name">{player}</span>
              <span class="zone-tag">Vorne</span>
            </button>
          {/each}
        </div>

        <div class="attack-line" aria-hidden="true">
          <span class="line-label"></span>
        </div>

        <div class="grid-section back-row">
          {#each [5, 6, 1] as const as pos}
            {@const { player } = getPlayerAtPosition(myTeamLineup, pos, currentRotation)}
            {@const isServerPos = pos === 1 && servingTeam === 'us'}
            <button
              type="button"
              class="pos-box my-box back"
              class:server-box={isServerPos}
              class:selected={isSelected('myTeam', pos)}
              onclick={() => handleSelect('myTeam', pos)}
              aria-label={`${myTeamName} ${posLabels[pos]}: ${player}${isServerPos ? ' (Aufschlag)' : ''}`}
              aria-pressed={isSelected('myTeam', pos)}
            >
              <span class="pos-badge" class:server-badge={isServerPos}>
                P{pos}
              </span>

              <span class="player-name">{player}</span>

              {#if isServerPos}
                <div class="serve-indicator" title="Aufschlagender Spieler">
                  <span class="serve-text">SERVE</span>
                </div>
              {:else}
                <span class="zone-tag">Hinten</span>
              {/if}
            </button>
          {/each}
        </div>
      </section>

    </div>
  {/if}

  <!-- AKTIVER SPIELER STATUS-BANNER (FÜR SCHNELLES TOUCH-FEEDBACK) -->
  {#if selectedPlayer}
    <div class="active-player-banner" role="status">
      <div class="banner-left">
        <span class="status-dot"></span>
        <span class="banner-team">
          {selectedPlayer.team === 'myTeam' ? myTeamName : opponentName}
        </span>
        <span class="banner-player">{selectedPlayer.player}</span>
      </div>
      <div class="banner-right">
        <span class="banner-pos">Pos {selectedPlayer.position}</span>
        <span class="banner-row">
          {selectedPlayer.row === 'front' ? 'Vorderzone' : 'Hinterzone'}
          {#if selectedPlayer.isServer}• Aufschlag{/if}
        </span>
      </div>
    </div>
  {/if}
</div>

<style>
  :root {
    --court-border: #0f172a;
    --net-color: #020617;
    --antenna-color: #dc2626;
    --my-court-bg: #eff6ff;
    --my-court-border: #3b82f6;
    --opponent-court-bg: #fff1f2;
    --opponent-court-border: #f43f5e;
    --active-highlight: #f59e0b;
    --active-ring: #fbbf24;
    --serve-highlight: #16a34a;
  }

  .court-wrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
    -webkit-user-select: none;
    box-sizing: border-box;
  }

  @media (min-width: 600px) {
    .court-wrapper {
      max-width: 580px;
      gap: 14px;
    }
  }

  @media (min-width: 900px), (min-width: 720px) and (orientation: landscape) {
    .court-wrapper {
      max-width: 100%;
    }
  }

  /* Kompaktere vertikale Abstände im Querformat (iPad Mini Landscape & 16:9 / 16:10 Laptops) */
  @media (orientation: landscape) and (max-height: 880px) {
    .court-wrapper {
      gap: 8px;
    }
    .tab-btn,
    .quick-toggle-btn,
    .rot-btn,
    .rotation-badge {
      min-height: 42px;
    }
    .pill-btn {
      min-height: 38px;
      font-size: 0.95rem;
    }
    .court-half {
      padding: 6px 8px;
    }
    .attack-line {
      margin: 4px 0;
      height: 6px;
    }
    .net-separator {
      height: 20px;
    }
  }

  /* --- FORMATIONS-SWITCHER (TABS & SCHNELLTASTE) --- */
  .formation-switch-container {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .formation-tabs {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    background-color: #e2e8f0;
    padding: 4px;
    border-radius: 12px;
    gap: 4px;
  }

  .tab-btn {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: transparent;
    border: none;
    border-radius: 9px;
    font-size: 0.9rem;
    font-weight: 700;
    color: #475569;
    cursor: pointer;
    touch-action: manipulation;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    color: #0f172a;
  }

  .tab-btn.active {
    background-color: #ffffff;
    color: #1e3a8a;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  }

  .tab-btn.receive-tab.active {
    color: #065f46;
  }

  .quick-toggle-btn {
    min-width: 48px;
    min-height: 48px;
    background-color: #0f172a;
    color: #ffffff;
    border: none;
    border-radius: 12px;
    font-size: 1.25rem;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    transition: transform 0.1s ease, background-color 0.15s ease;
  }

  .quick-toggle-btn:hover {
    background-color: #1e293b;
  }

  .quick-toggle-btn:active {
    transform: scale(0.95);
  }

  /* --- HEADER & ROTATIONS-STEUERUNG --- */
  .court-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .rot-btn {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 1rem;
    font-weight: 700;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 0.1s ease, background-color 0.15s ease, box-shadow 0.15s ease;
  }

  .rot-btn:active {
    transform: scale(0.97);
  }

  .rot-btn.prev {
    width: 48px;
    background-color: #e2e8f0;
    /*color: #1e293b;*/
    color: #ffffff;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    /*font-size: 1.3rem;*/
  }

  .rot-btn.prev:hover {
    background-color: #cbd5e1;
  }

  .rot-btn .icon {
    font-size: 1.25rem;
    line-height: 1;
  }

  .rotation-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /*min-width: 70px;*/
    min-height: 48px;
    background-color: #0f172a;
    color: #f8fafc;
    border-radius: 10px;
    padding: 0 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .rot-title {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    line-height: 1;
    margin-bottom: 2px;
  }

  .rot-value {
    font-size: 1.2rem;
    font-weight: 800;
    color: #38bdf8;
    line-height: 1;
  }

  /* Quick Pill Selector */
  .rotation-pills {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    width: 100%;
  }

  .pill-btn {
    min-height: 48px;
    background-color: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    font-weight: 700;
    font-size: 1.05rem;
    color: #334155;
    cursor: pointer;
    touch-action: manipulation;
    transition: all 0.15s ease;
  }

  .pill-btn:hover {
    background-color: #e2e8f0;
  }

  .pill-btn.active {
    background-color: #2563eb;
    color: #ffffff;
    border-color: #1d4ed8;
    box-shadow: 0 2px 4px rgba(37, 99, 235, 0.35);
  }

  /* --- SVG COURT WRAPPER --- */
  .svg-court-wrapper {
    width: 100%;
    border: 3px solid #0f172a;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.12), 0 4px 6px -4px rgba(0, 0, 0, 0.08);
    background-color: #ffffff;
    padding: 8px;
    box-sizing: border-box;
  }

  /* --- SPIELFELD-CONTAINER (KLASSISCH) --- */
  .court-card {
    width: 100%;
    background-color: #ffffff;
    border: 3px solid #0f172a;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.12), 0 4px 6px -4px rgba(0, 0, 0, 0.08);
  }

  .court-half {
    padding: 8px 10px;
    position: relative;
    box-sizing: border-box;
  }

  .opponent-half {
    background: linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%);
  }

  .my-half {
    background: linear-gradient(180deg, #dbeafe 0%, #eff6ff 100%);
  }

  .half-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .badge {
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 8px;
    border-radius: 9999px;
  }

  .opponent-badge {
    background-color: #fecdd3;
    color: #9f1239;
    border: 1px solid #f43f5e;
  }

  .my-badge {
    background-color: #bfdbfe;
    color: #1e40af;
    border: 1px solid #3b82f6;
  }

  .half-hint {
    font-size: 0.65rem;
    color: #64748b;
    font-weight: 500;
  }

  /* 3-Spalten Grid für Grundaufstellung */
  .grid-section {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  /* 3-Meter Angriffslinie */
  .attack-line {
    margin: 6px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 2px dashed rgba(15, 23, 42, 0.35);
    height: 10px;
    position: relative;
  }

  .line-label {
    position: absolute;
    top: -6px;
    background-color: rgba(255, 255, 255, 0.85);
    padding: 0 6px;
    font-size: 0.55rem;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: 4px;
  }

  /* --- DAS NETZ --- */
  .net-separator {
    display: flex;
    align-items: center;
    height: 24px;
    background-color: #090d16;
    color: #ffffff;
    position: relative;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    z-index: 5;
  }

  .antenna {
    width: 6px;
    height: 100%;
    background: repeating-linear-gradient(
      0deg,
      #dc2626,
      #dc2626 4px,
      #ffffff 4px,
      #ffffff 8px
    );
    flex-shrink: 0;
  }

  .net-band {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.15em;
    color: #f8fafc;
  }

  .net-mesh {
    color: #475569;
    letter-spacing: -1px;
    font-size: 0.65rem;
  }

  .net-title {
    background-color: #ffffff;
    color: #0f172a;
    padding: 1px 8px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  /* --- SPIELER BOXEN (TOUCH TARGETS) --- */
  .pos-box {
    min-height: 54px;
    padding: 6px 4px;
    background-color: #ffffff;
    border: 2px solid #cbd5e1;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 0.1s ease, border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
    box-sizing: border-box;
    text-align: center;
  }

  @media (min-width: 600px) and (min-height: 800px) {
    .pos-box {
      min-height: 64px;
      padding: 8px 6px;
    }
  }

  .pos-box:hover {
    border-color: #64748b;
  }

  .pos-box:active {
    transform: scale(0.96);
  }

  .pos-badge {
    position: absolute;
    top: 3px;
    left: 4px;
    font-size: 0.65rem;
    font-weight: 800;
    color: #64748b;
    background-color: #f1f5f9;
    padding: 1px 4px;
    border-radius: 4px;
    line-height: 1;
  }

  .player-name {
    font-size: 0.95rem;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.15;
    word-break: break-word;
    padding: 0 2px;
  }

  .zone-tag {
    font-size: 0.55rem;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    margin-top: 2px;
    line-height: 1;
  }

  /* Spezifische Stylings für eigenes Team & Gegner */
  .opponent-box {
    border-color: #fca5a5;
  }

  .opponent-box.front {
    border-color: #f87171;
    background-color: #fffafb;
  }

  .my-box {
    border-color: #93c5fd;
  }

  .my-box.front {
    border-color: #60a5fa;
    background-color: #f8fbff;
  }

  /* Aufschlag-Position 1 (Aktives Aufschlagrecht auf Mein Team oder Gegner) */
  .pos-box.server-box {
    border: 2px solid #16a34a;
    background: linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%);
    box-shadow: 0 0 0 1px #86efac;
  }

  .server-badge {
    background-color: #16a34a !important;
    color: #ffffff !important;
  }

  .serve-indicator {
    display: flex;
    align-items: center;
    gap: 3px;
    background-color: #15803d;
    color: #ffffff;
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    padding: 1px 5px;
    border-radius: 9999px;
    margin-top: 2px;
    box-shadow: 0 1px 2px rgba(22, 163, 74, 0.4);
    animation: pulse-serve 2s infinite ease-in-out;
  }

  .serve-text {
    line-height: 1;
  }

  @keyframes pulse-serve {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
      background-color: #166534;
    }
  }

  /* --- AKTIVER / AUSGEWÄHLTER SPIELER (SELECTION HIGHLIGHT) --- */
  .pos-box.selected {
    border: 3px solid #d97706 !important;
    background-color: #fffbeb !important;
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.4), 0 4px 6px -1px rgba(0, 0, 0, 0.15) !important;
    transform: translateY(-2px);
    z-index: 10;
  }

  .pos-box.selected .pos-badge {
    background-color: #d97706 !important;
    color: #ffffff !important;
  }

  .pos-box.selected .player-name {
    color: #78350f !important;
  }

  /* --- BANNER FÜR AKTIVEN SPIELER --- */
  .active-player-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 48px;
    background-color: #1e293b;
    color: #ffffff;
    padding: 8px 14px;
    border-radius: 10px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    box-sizing: border-box;
    border-left: 5px solid #f59e0b;
  }

  .banner-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    background-color: #f59e0b;
    border-radius: 50%;
    animation: blink 1.2s infinite ease-in-out;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .banner-team {
    font-size: 0.75rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .banner-player {
    font-size: 1.05rem;
    font-weight: 800;
    color: #f8fafc;
  }

  .banner-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .banner-pos {
    font-size: 0.85rem;
    font-weight: 800;
    color: #38bdf8;
  }

  .banner-row {
    font-size: 0.65rem;
    color: #cbd5e1;
    font-weight: 500;
  }
</style>
