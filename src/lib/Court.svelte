<script lang="ts">
  import type {
    PlayerSelection,
    RotationPosition,
    FormationMode,
    ServingTeam,
    SystemType,
    PlayerSetup
  } from './types';
  import ReceiveFormation from './ReceiveFormation.svelte';
  import {
    formatPlayerDisplay,
    getIndexForCourtPos,
    rotateClockwise
  } from './matchEngine';

  interface Props {
    myTeamLineup?: PlayerSetup[];
    opponentLineup?: string[];
    currentRotation?: number;
    opponentRotation?: number;
    selectedPlayer?: PlayerSelection | null;
    onSelectPlayer?: (selection: PlayerSelection | null) => void;
    onRotationChange?: (rotation: number) => void;
    onOpponentRotationChange?: (rotation: number) => void;
    onOpponentLineupChange?: (lineup: string[]) => void;
    showOpponent?: boolean;
    myTeamName?: string;
    opponentName?: string;
    system?: SystemType;
    formationMode?: FormationMode;
    onFormationChange?: (mode: FormationMode) => void;
    activeLiberoName?: string | null;
    liberoCanServe?: boolean;
    servingTeam?: ServingTeam;
    courtFlipped?: boolean;
  }

  let {
    myTeamLineup = $bindable<PlayerSetup[]>([]),
    opponentLineup = $bindable<string[]>(['#1', '#2', '#3', '#4', '#5', '#6']),
    currentRotation = $bindable(1),
    opponentRotation = $bindable(1),
    selectedPlayer = $bindable(null),
    onSelectPlayer,
    onRotationChange,
    onOpponentRotationChange,
    onOpponentLineupChange,
    showOpponent = true,
    myTeamName = 'Mein Team',
    opponentName = 'Gegner',
    system = '5-1',
    formationMode = $bindable<FormationMode>('base'),
    onFormationChange,
    activeLiberoName = 'L',
    liberoCanServe = false,
    servingTeam = 'us',
    courtFlipped = $bindable(false)
  }: Props = $props();

  let editingOpponent = $state(false);

  function getPlayerAtPosition(
    lineup: (string | PlayerSetup)[],
    pos: RotationPosition,
    rot: number,
    applyLiberoRule: boolean = true
  ) {
    const playerIndex = getIndexForCourtPos(pos, rot);
    const item = lineup ? lineup[playerIndex] : undefined;
    let playerStr = `#${playerIndex + 1}`;
    let playerNum: string | undefined;
    let roleStr = '';

    if (typeof item === 'string') {
      playerStr = item;
      const match = item.match(/\((MB1|MB2|MB)\)/i);
      if (match) roleStr = match[1].toUpperCase();
    } else if (item && typeof item === 'object') {
      roleStr = (item.role ?? '').toUpperCase();
      playerNum = item.number?.trim() || undefined;
      playerStr = item.name
        ? formatPlayerDisplay(item)
        : (item.role ?? `#${playerIndex + 1}`);
    }

    const isBackRow = pos === 1 || pos === 5 || pos === 6;
    const liberoAllowedOnPos = isBackRow && (pos !== 1 || servingTeam === 'them' || liberoCanServe);
    const isMB = roleStr === 'MB1' || roleStr === 'MB2' || roleStr === 'MB';
    if (applyLiberoRule && liberoAllowedOnPos && isMB && activeLiberoName) {
      playerStr = activeLiberoName === 'L' ? `L (für ${roleStr})` : `${activeLiberoName} (L)`;
      playerNum = undefined;
    }

    return {
      player: playerStr,
      playerNum,
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

  // Detect opponent setter position (if tagged with S, Z, (S), (Z), Zuspiel)
  const opponentSetterHint = $derived.by<string | null>(() => {
    for (const pos of [1, 2, 3, 4, 5, 6] as RotationPosition[]) {
      const idx = getIndexForCourtPos(pos, opponentRotation);
      const label = (opponentLineup[idx] ?? '').trim();
      if (/\b(Z|S|Z1|Z2|S1|S2|Zuspiel)\b/i.test(label) || /\((Z|S|Z1|Z2|S1|S2)\)/i.test(label)) {
        const isFront = pos === 2 || pos === 3 || pos === 4;
        return isFront
          ? `Z vorne (P${pos}) • 2 Angreifer`
          : `Z hinten (P${pos}) • 3 Angreifer`;
      }
    }
    return null;
  });

  function handleNextRotation() {
    const nextRot = rotateClockwise(currentRotation as RotationPosition);
    currentRotation = nextRot;
    onRotationChange?.(nextRot);
    syncSelectedMyPlayer(nextRot);
  }

  function handleNextOpponentRotation() {
    const nextRot = rotateClockwise(opponentRotation as RotationPosition);
    opponentRotation = nextRot;
    onOpponentRotationChange?.(nextRot);
    if (selectedPlayer && selectedPlayer.team === 'opponent') {
      const { player, playerIndex } = getPlayerAtPosition(
        opponentLineup,
        selectedPlayer.position,
        nextRot,
        false
      );
      selectedPlayer = {
        ...selectedPlayer,
        player,
        playerIndex,
        rotation: nextRot,
        isServer: selectedPlayer.position === 1 && servingTeam === 'them'
      };
      onSelectPlayer?.(selectedPlayer);
    }
  }

  function syncSelectedMyPlayer(rot: number) {
    if (selectedPlayer && selectedPlayer.team === 'myTeam') {
      const { player, playerNum, playerIndex } = getPlayerAtPosition(
        myTeamLineup,
        selectedPlayer.position,
        rot
      );
      selectedPlayer = {
        ...selectedPlayer,
        player,
        playerNum,
        playerIndex,
        rotation: rot,
        isServer: selectedPlayer.position === 1 && servingTeam === 'us'
      };
      onSelectPlayer?.(selectedPlayer);
    }
  }

  function updateOpponentSlot(pos: RotationPosition, value: string) {
    const idx = getIndexForCourtPos(pos, opponentRotation);
    const next = [...opponentLineup];
    next[idx] = value;
    opponentLineup = next;
    onOpponentLineupChange?.(next);
  }

  function handleSelect(team: 'myTeam' | 'opponent', position: RotationPosition) {
    if (team === 'opponent' && editingOpponent) return;

    if (isSelected(team, position)) {
      selectedPlayer = null;
      onSelectPlayer?.(null);
      return;
    }

    const rot = team === 'myTeam' ? currentRotation : opponentRotation;
    const lineup = team === 'myTeam' ? myTeamLineup : opponentLineup;
    const { player, playerNum, playerIndex } = getPlayerAtPosition(
      lineup,
      position,
      rot,
      team === 'myTeam'
    );
    const row = position === 2 || position === 3 || position === 4 ? 'front' : 'back';
    const isServer =
      position === 1 &&
      ((team === 'myTeam' && servingTeam === 'us') ||
        (team === 'opponent' && servingTeam === 'them'));

    const selection: PlayerSelection = {
      team,
      position,
      player,
      playerNum,
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

  const posLabels: Record<RotationPosition, string> = {
    1: 'Pos 1 (Hinten Rechts / Aufschlag)',
    2: 'Pos 2 (Vorne Rechts)',
    3: 'Pos 3 (Vorne Mitte)',
    4: 'Pos 4 (Vorne Links)',
    5: 'Pos 5 (Hinten Links)',
    6: 'Pos 6 (Hinten Mitte)'
  };
</script>

{#snippet opponentHalfBlock(flipped: boolean)}
  <section class="court-half opponent-half" aria-label="Gegnerische Feldhälfte">
    <div class="half-header">
      <div class="half-title-group">
        <span class="badge opponent-badge">{opponentName}</span>
        {#if opponentSetterHint}
          <span class="opp-setter-pill">{opponentSetterHint}</span>
        {/if}
      </div>

      <div class="opp-controls">
        <button
          type="button"
          class="opp-ctrl-btn"
          onclick={handleNextOpponentRotation}
          title="Gegner-Rotation weiterrücken (↻)"
        >
          R{opponentRotation} ↻
        </button>
        <button
          type="button"
          class="opp-ctrl-btn"
          class:active={editingOpponent}
          onclick={() => (editingOpponent = !editingOpponent)}
          title="Gegner-Positionen beschriften (z.B. #12 Z, #7 AA)"
        >
          {editingOpponent ? 'Fertig' : '✎ Notiz'}
        </button>
      </div>
    </div>

    {#if editingOpponent}
      <p class="opp-edit-hint">
        Kürzel eintragen (Tipp: <strong>Z</strong> oder <strong>S</strong> markiert Zuspieler für 2/3-Angreifer-Warnung):
      </p>
    {/if}

    {#if !flipped}
      <!-- Standard: Rückraum oben [1, 6, 5], Vorderzone unten [2, 3, 4] -->
      <div class="grid-section back-row">
        {#each [1, 6, 5] as const as pos}
          {@render opponentPosBox(pos)}
        {/each}
      </div>
      <div class="attack-line" aria-hidden="true"><span class="line-label"></span></div>
      <div class="grid-section front-row">
        {#each [2, 3, 4] as const as pos}
          {@render opponentPosBox(pos, true)}
        {/each}
      </div>
    {:else}
      <!-- Gespiegelt (Seitenwechsel): Vorderzone oben am Netz [4, 3, 2], Rückraum unten [5, 6, 1] -->
      <div class="grid-section front-row">
        {#each [4, 3, 2] as const as pos}
          {@render opponentPosBox(pos, true)}
        {/each}
      </div>
      <div class="attack-line" aria-hidden="true"><span class="line-label"></span></div>
      <div class="grid-section back-row">
        {#each [5, 6, 1] as const as pos}
          {@render opponentPosBox(pos)}
        {/each}
      </div>
    {/if}
  </section>
{/snippet}

{#snippet opponentPosBox(pos: RotationPosition, isFront: boolean = false)}
  {@const idx = getIndexForCourtPos(pos, opponentRotation)}
  {@const { player } = getPlayerAtPosition(opponentLineup, pos, opponentRotation, false)}
  {@const isOppServerPos = pos === 1 && servingTeam === 'them'}
  {#if editingOpponent}
    <div class="pos-box opponent-box editing" class:front={isFront} class:server-box={isOppServerPos}>
      <span class="pos-badge" class:server-badge={isOppServerPos}>P{pos}</span>
      <input
        type="text"
        class="opp-inline-input"
        value={opponentLineup[idx] ?? `#${idx + 1}`}
        oninput={(e) => updateOpponentSlot(pos, e.currentTarget.value)}
        placeholder={`#${idx + 1}`}
        aria-label={`Gegner Position ${pos}`}
      />
    </div>
  {:else}
    <button
      type="button"
      class="pos-box opponent-box"
      class:front={isFront}
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
          <span class="serve-text">AUFSCHLAG</span>
        </div>
      {/if}
    </button>
  {/if}
{/snippet}

{#snippet myHalfBlock(flipped: boolean)}
  <section class="court-half my-half" aria-label="Eigene Feldhälfte">
    <div class="half-header">
      <span class="badge my-badge">{myTeamName}</span>
      <span class="half-hint">{flipped ? 'Rückraum oben • Netz unten' : 'Netz oben • Rückraum unten'}</span>
    </div>

    {#if !flipped}
      <div class="grid-section front-row">
        {#each [4, 3, 2] as const as pos}
          {@render myPosBox(pos, true)}
        {/each}
      </div>
      <div class="attack-line" aria-hidden="true"><span class="line-label"></span></div>
      <div class="grid-section back-row">
        {#each [5, 6, 1] as const as pos}
          {@render myPosBox(pos, false)}
        {/each}
      </div>
    {:else}
      <div class="grid-section back-row">
        {#each [1, 6, 5] as const as pos}
          {@render myPosBox(pos, false)}
        {/each}
      </div>
      <div class="attack-line" aria-hidden="true"><span class="line-label"></span></div>
      <div class="grid-section front-row">
        {#each [2, 3, 4] as const as pos}
          {@render myPosBox(pos, true)}
        {/each}
      </div>
    {/if}
  </section>
{/snippet}

{#snippet myPosBox(pos: RotationPosition, isFront: boolean)}
  {@const { player } = getPlayerAtPosition(myTeamLineup, pos, currentRotation)}
  {@const isServerPos = pos === 1 && servingTeam === 'us'}
  <button
    type="button"
    class="pos-box my-box"
    class:front={isFront}
    class:back={!isFront}
    class:server-box={isServerPos}
    class:selected={isSelected('myTeam', pos)}
    onclick={() => handleSelect('myTeam', pos)}
    aria-label={`${myTeamName} ${posLabels[pos]}: ${player}${isServerPos ? ' (Aufschlag)' : ''}`}
    aria-pressed={isSelected('myTeam', pos)}
  >
    <span class="pos-badge" class:server-badge={isServerPos}>P{pos}</span>
    <span class="player-name">{player}</span>
    {#if isServerPos}
      <div class="serve-indicator" title="Aufschlagender Spieler">
        <span class="serve-text">AUFSCHLAG</span>
      </div>
    {:else}
      <span class="zone-tag">{isFront ? 'Vorne' : 'Hinten'}</span>
    {/if}
  </button>
{/snippet}

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
        <span class="tab-label">Annahme ({system})</span>
      </button>
    </div>

    {#if formationMode === 'base' && showOpponent}
      <button
        type="button"
        class="flip-btn"
        class:active={courtFlipped}
        onclick={() => (courtFlipped = !courtFlipped)}
        title="Seitenwechsel: Spielfeld-Ansicht um 180° drehen"
        aria-label="Seitenwechsel umschalten"
        aria-pressed={courtFlipped}
      >
        ⇅
      </button>
    {:else}
      <button
        type="button"
        class="quick-toggle-btn"
        onclick={toggleFormation}
        title="Zwischen Grundaufstellung und Annahme-Riegel wechseln"
        aria-label="Formation umschalten"
      >
        ⇄
      </button>
    {/if}

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
    </button>
  </div>

  <!-- QUICK ROTATION PILL STRIP (1 BIS 6) -->
  <header class="court-header">
    <div class="rotation-pills" role="radiogroup" aria-label="Rotation direkt wählen">
      {#each [1, 2, 3, 4, 5, 6] as rot}
        <button
          type="button"
          class="pill-btn"
          class:active={currentRotation === rot}
          onclick={() => {
            currentRotation = rot;
            onRotationChange?.(rot);
            syncSelectedMyPlayer(rot);
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
    <div class="svg-court-wrapper" role="region" aria-label={`${system} Annahme und Transition`}>
      <ReceiveFormation
        bind:currentRotation
        playerNames={activeCourtPlayerNames}
        hasLibero={Boolean(activeLiberoName)}
        courtPlayers={myTeamLineup}
        {system}
        selectedPosition={selectedPlayer?.team === 'myTeam' ? selectedPlayer.position : null}
        onSelectPosition={(pos) => handleSelect('myTeam', pos)}
      />
    </div>
  {:else}
    <div class="court-card" role="region" aria-label="Volleyball Spielfeld">
      {#if !courtFlipped}
        {#if showOpponent}
          {@render opponentHalfBlock(false)}
        {/if}

        <div class="net-separator" aria-label="Netzlinie">
          <div class="antenna left" aria-hidden="true" title="Antenne Links"></div>
          <div class="net-band">
            <span class="net-mesh" aria-hidden="true">══════</span>
            <span class="net-title">NETZ</span>
            <span class="net-mesh" aria-hidden="true">══════</span>
          </div>
          <div class="antenna right" aria-hidden="true" title="Antenne Rechts"></div>
        </div>

        {@render myHalfBlock(false)}
      {:else}
        {@render myHalfBlock(true)}

        <div class="net-separator" aria-label="Netzlinie">
          <div class="antenna left" aria-hidden="true" title="Antenne Links"></div>
          <div class="net-band">
            <span class="net-mesh" aria-hidden="true">══════</span>
            <span class="net-title">NETZ</span>
            <span class="net-mesh" aria-hidden="true">══════</span>
          </div>
          <div class="antenna right" aria-hidden="true" title="Antenne Rechts"></div>
        </div>

        {#if showOpponent}
          {@render opponentHalfBlock(true)}
        {/if}
      {/if}
    </div>
  {/if}

  <!-- AKTIVER SPIELER STATUS-BANNER -->
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
    gap: 10px;
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
      gap: 12px;
    }
  }

  @media (min-width: 900px), (min-width: 720px) and (orientation: landscape) {
    .court-wrapper {
      max-width: 100%;
    }
  }

  @media (orientation: landscape) and (max-height: 880px) {
    .court-wrapper {
      gap: 8px;
    }
    .tab-btn,
    .quick-toggle-btn,
    .flip-btn,
    .rot-btn,
    .rotation-badge {
      min-height: 42px;
    }
    .pill-btn {
      min-height: 36px;
      font-size: 0.92rem;
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

  .formation-switch-container {
    display: flex;
    align-items: center;
    gap: 6px;
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
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: transparent;
    border: none;
    border-radius: 9px;
    font-size: 0.85rem;
    font-weight: 700;
    color: #475569;
    cursor: pointer;
    touch-action: manipulation;
    transition: all 0.15s ease;
    padding: 0 6px;
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

  .quick-toggle-btn,
  .flip-btn {
    min-width: 44px;
    min-height: 46px;
    background-color: #0f172a;
    color: #ffffff;
    border: none;
    border-radius: 10px;
    font-size: 1.15rem;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    transition: transform 0.1s ease, background-color 0.15s ease;
  }

  .flip-btn {
    background-color: #f1f5f9;
    color: #334155;
    border: 1.5px solid #cbd5e1;
  }

  .flip-btn.active {
    background-color: #0f172a;
    color: #ffffff;
    border-color: #0f172a;
  }

  .court-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .rot-btn {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    touch-action: manipulation;
  }

  .rot-btn.prev {
    width: 44px;
    color: #ffffff;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
  }

  .rot-btn .icon {
    font-size: 1.2rem;
    line-height: 1;
  }

  .rotation-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    background-color: #0f172a;
    color: #f8fafc;
    border-radius: 10px;
    padding: 0 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .rot-title {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    line-height: 1;
    margin-bottom: 2px;
  }

  .rot-value {
    font-size: 1.15rem;
    font-weight: 800;
    color: #38bdf8;
    line-height: 1;
  }

  .rotation-pills {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    width: 100%;
  }

  .pill-btn {
    min-height: 44px;
    background-color: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    font-weight: 700;
    font-size: 1rem;
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
    gap: 6px;
    margin-bottom: 6px;
    flex-wrap: wrap;
  }

  .half-title-group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .opp-setter-pill {
    font-size: 0.65rem;
    font-weight: 800;
    color: #9f1239;
    background: #ffffff;
    border: 1px solid #fda4af;
    border-radius: 9999px;
    padding: 1px 7px;
  }

  .opp-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .opp-ctrl-btn {
    padding: 2px 7px;
    font-size: 0.68rem;
    font-weight: 800;
    border-radius: 6px;
    border: 1px solid #fda4af;
    background: #ffffff;
    color: #9f1239;
    cursor: pointer;
    touch-action: manipulation;
  }

  .opp-ctrl-btn.active {
    background: #be123c;
    border-color: #be123c;
    color: #ffffff;
  }

  .opp-edit-hint {
    margin: 0 0 6px;
    font-size: 0.68rem;
    color: #881337;
    font-weight: 600;
  }

  .badge {
    font-size: 0.72rem;
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

  .grid-section {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .attack-line {
    margin: 6px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 2px dashed rgba(15, 23, 42, 0.35);
    height: 8px;
    position: relative;
  }

  .net-separator {
    display: flex;
    align-items: center;
    height: 22px;
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

  .pos-box {
    min-height: 52px;
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

  .pos-box.editing {
    cursor: default;
    padding-top: 16px;
  }

  .opp-inline-input {
    width: 90%;
    padding: 3px 4px;
    border: 1.5px solid #f43f5e;
    border-radius: 5px;
    font-size: 0.78rem;
    font-weight: 800;
    text-align: center;
    color: #0f172a;
    background: #ffffff;
    box-sizing: border-box;
  }

  @media (min-width: 600px) and (min-height: 800px) {
    .pos-box {
      min-height: 62px;
      padding: 8px 6px;
    }
  }

  .pos-box:hover {
    border-color: #64748b;
  }

  .pos-box:active:not(.editing) {
    transform: scale(0.96);
  }

  .pos-badge {
    position: absolute;
    top: 3px;
    left: 4px;
    font-size: 0.62rem;
    font-weight: 800;
    color: #64748b;
    background-color: #f1f5f9;
    padding: 1px 4px;
    border-radius: 4px;
    line-height: 1;
  }

  .player-name {
    font-size: 0.88rem;
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
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.04em;
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

  .active-player-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 46px;
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
    min-width: 0;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    background-color: #f59e0b;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .banner-team {
    font-size: 0.72rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .banner-player {
    font-size: 1rem;
    font-weight: 800;
    color: #f8fafc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .banner-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    flex-shrink: 0;
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
