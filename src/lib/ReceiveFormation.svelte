<script lang="ts">
  import type { RotationPosition } from './types';
  import {
    getPhasePlayers,
    LIBERO_SWAP_BY_ROTATION,
    type PlayerKey,
    type TacticalPhase
  } from './formations';
  import { validateFormation, type FormationPlayer } from './validateFormation';

  interface Props {
    currentRotation?: number;
    phase?: TacticalPhase;
    labels?: Partial<Record<RotationPosition, string>>;
    playerNames?: Partial<Record<RotationPosition, string>>;
    hasLibero?: boolean;
  }

  let {
    currentRotation = $bindable(1),
    phase = $bindable<TacticalPhase>('receive'),
    labels = {},
    playerNames = {},
    hasLibero = true
  }: Props = $props();

  type Mode = 'default' | 'custom';
  let mode = $state<Mode>('default');

  // Reactive on-court players (always 6 active players: S, OH1, OH2, OPP, L, and either MB1 or MB2)
  let players = $state<FormationPlayer[]>(getPhasePlayers(1, 'receive'));

  // Sync coordinates & automatic FIVB Libero <-> MB1/MB2 replacement whenever rotation or phase changes
  $effect(() => {
    players = getPhasePlayers(currentRotation, phase);
  });

  // Front row (Pos 4, 3, 2) and Back row (Pos 5, 6, 1) ordered left-to-right
  const frontRowPlayers = $derived(
    ([4, 3, 2] as RotationPosition[])
      .map((pos) => players.find((p) => p.pos === pos))
      .filter((p): p is FormationPlayer => p !== undefined)
  );

  const backRowPlayers = $derived(
    ([5, 6, 1] as RotationPosition[])
      .map((pos) => players.find((p) => p.pos === pos))
      .filter((p): p is FormationPlayer => p !== undefined)
  );

  // Real-time FIVB legality validation in $derived state
  const errors = $derived(validateFormation(players, currentRotation));
  const legal = $derived(errors.length === 0);
  const faultyPositions = $derived(new Set(errors.flatMap((e) => e.positions)));

  function setPhase(nextPhase: TacticalPhase) {
    phase = nextPhase;
    players = getPhasePlayers(currentRotation, nextPhase);
  }

  function setMode(nextMode: Mode) {
    mode = nextMode;
    if (nextMode === 'default') {
      players = getPhasePlayers(currentRotation, phase);
    }
  }

  function resetPositions() {
    players = getPhasePlayers(currentRotation, phase);
  }

  // Pointer-event drag & drop for Custom ("Edit Positions") mode
  let courtEl: HTMLDivElement | undefined = $state();
  let draggingPos = $state<RotationPosition | null>(null);

  function clamp(v: number) {
    return Math.min(100, Math.max(0, v));
  }

  function onPointerDown(e: PointerEvent, p: FormationPlayer) {
    if (mode !== 'custom') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingPos = p.pos;
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent, p: FormationPlayer) {
    if (draggingPos !== p.pos || !courtEl) return;
    const r = courtEl.getBoundingClientRect();
    p.x = clamp(((e.clientX - r.left) / r.width) * 100);
    p.y = clamp(((e.clientY - r.top) / r.height) * 100);
  }

  function onPointerUp(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    draggingPos = null;
  }

  const ROLE_COLORS: Record<PlayerKey, string> = {
    S: '#d97706',
    OH1: '#0284c7',
    OH2: '#0369a1',
    MB1: '#4f46e5',
    MB2: '#6366f1',
    OPP: '#7c3aed',
    L: '#059669'
  };

  function effectiveRole(p: FormationPlayer): PlayerKey {
    const raw = (p.label ?? 'OH1') as PlayerKey;
    if (raw === 'L' && !hasLibero) {
      return (LIBERO_SWAP_BY_ROTATION[currentRotation] ?? LIBERO_SWAP_BY_ROTATION[1]).replacedBackMB;
    }
    return raw;
  }
</script>

<section class="rf" aria-label="5-1 Taktische Formation (Annahme & Transition)">
  <!-- FRONT & BACK ROW OVERVIEW -->
  <div class="rows-card" aria-label="Spieler in Vorderfeld und Hinterfeld">
    <div class="row-line">
      <span class="row-label">Vorderfeld</span>
      <div class="row-chips">
        {#each frontRowPlayers as p (p.pos)}
          {@const roleKey = effectiveRole(p)}
          <span
            class="player-chip"
            style="--chip-color: {ROLE_COLORS[roleKey] ?? '#0284c7'}"
            title={playerNames[p.pos] ?? labels[p.pos] ?? roleKey}
          >
            <span class="chip-dot"></span>
            <span class="chip-name">{playerNames[p.pos] ?? labels[p.pos] ?? roleKey}</span>
            <span class="chip-pos">P{p.pos}</span>
          </span>
        {/each}
      </div>
    </div>

    <div class="row-line">
      <span class="row-label">Hinterfeld</span>
      <div class="row-chips">
        {#each backRowPlayers as p (p.pos)}
          {@const roleKey = effectiveRole(p)}
          <span
            class="player-chip"
            style="--chip-color: {ROLE_COLORS[roleKey] ?? '#0284c7'}"
            title={playerNames[p.pos] ?? labels[p.pos] ?? roleKey}
          >
            <span class="chip-dot"></span>
            <span class="chip-name">{playerNames[p.pos] ?? labels[p.pos] ?? roleKey}</span>
            <span class="chip-pos">P{p.pos}</span>
          </span>
        {/each}
      </div>
    </div>
  </div>

  <!-- PHASE SWITCHER: RECEIVE vs TRANSITION -->
  <div class="phase-bar" role="tablist" aria-label="Taktische Phase">
    <button
      type="button"
      role="tab"
      aria-selected={phase === 'receive'}
      class="phase-btn"
      class:active={phase === 'receive'}
      onclick={() => setPhase('receive')}
    >
      Annahme (Receive)
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={phase === 'transition'}
      class="phase-btn"
      class:active={phase === 'transition'}
      onclick={() => setPhase('transition')}
    >
      Angriff (Transition)
    </button>
  </div>

  <!-- MODE SWITCHER: DEFAULT FORMATIONS vs EDIT POSITIONS -->
  <div class="bar">
    <div class="seg" role="tablist" aria-label="Positions-Modus">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'default'}
        class:active={mode === 'default'}
        onclick={() => setMode('default')}
      >
        Default Formations
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'custom'}
        class:active={mode === 'custom'}
        onclick={() => setMode('custom')}
      >
        Edit Positions
      </button>
    </div>
    {#if mode === 'custom'}
      <button type="button" class="reset" onclick={resetPositions}>Reset</button>
    {/if}
  </div>

  <!-- FIVB LEGALITY STATUS: only shown when an illegal positional fault occurs -->
  {#if phase === 'receive' && !legal}
    <div class="badge bad" role="alert" aria-live="polite">
      Illegal Positional Fault
    </div>
    <ul class="errs">
      {#each errors as err}
        <li>{err.message}</li>
      {/each}
    </ul>
  {/if}

  <!-- INTERACTIVE COURT WITH SMOOTH CSS TRANSITIONS -->
  <div class="court" bind:this={courtEl} class:custom={mode === 'custom'}>
    <div class="net">NETZ </div>
    <div class="attack-line">
      <span class="attack-label">3m-Linie</span>
    </div>

    {#each players as p (p.label ?? p.pos)}
      {@const roleKey = effectiveRole(p)}
      <div
        class="token"
        class:dragging={draggingPos === p.pos}
        class:fault={phase === 'receive' && faultyPositions.has(p.pos)}
        class:locked={mode === 'default'}
        style="left: {p.x}%; top: {p.y}%; --role-bg: {ROLE_COLORS[roleKey] ?? '#0284c7'};"
        role="button"
        tabindex="0"
        title={playerNames[p.pos] ? `${playerNames[p.pos]} (Pos ${p.pos})` : undefined}
        aria-label={`${playerNames[p.pos] ?? roleKey} (Pos ${p.pos}), X ${Math.round(p.x)}%, Y ${Math.round(p.y)}%`}
        onpointerdown={(e) => onPointerDown(e, p)}
        onpointermove={(e) => onPointerMove(e, p)}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
      >
        <span class="role-tag">{labels[p.pos] ?? roleKey}</span>
        <span class="pos-sub">P{p.pos}</span>
        {#if draggingPos === p.pos}
          <span class="coords">{Math.round(p.x)}% / {Math.round(p.y)}%</span>
        {/if}
      </div>
    {/each}
  </div>
</section>

<style>
  .rf {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    box-sizing: border-box;
  }

  @media (min-width: 900px), (min-width: 720px) and (orientation: landscape) {
    .rf {
      max-width: 100%;
    }
  }

  @media (orientation: landscape) and (max-height: 880px) {
    .rf {
      gap: 7px;
    }
    .phase-btn,
    .seg button,
    .reset {
      min-height: 40px;
    }
    .court {
      max-width: min(100%, 48vh);
      margin: 0 auto;
    }
  }

  .rows-card {
    background: #f8fafc;
    border: 2px solid #cbd5e1;
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-sizing: border-box;
  }

  .row-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .row-label {
    min-width: 72px;
    font-size: 0.72rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #475569;
  }

  .row-chips {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
  }

  .player-chip {
    min-width: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 6px;
    padding: 4px 6px;
    font-size: 0.76rem;
    box-sizing: border-box;
  }

  .chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--chip-color, #0284c7);
    flex-shrink: 0;
  }

  .chip-name {
    font-weight: 800;
    color: #0f172a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .chip-pos {
    font-size: 0.65rem;
    font-weight: 700;
    color: #64748b;
    flex-shrink: 0;
  }

  .phase-bar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    background: #f1f5f9;
    padding: 4px;
    border-radius: 12px;
    border: 2px solid #cbd5e1;
    box-sizing: border-box;
  }

  .phase-btn {
    min-height: 48px;
    padding: 0 12px;
    font-size: 0.85rem;
    font-weight: 800;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: #475569;
    cursor: pointer;
    touch-action: manipulation;
    box-sizing: border-box;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .phase-btn.active {
    background: #0284c7;
    color: #ffffff;
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.35);
  }

  .bar {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .seg {
    display: flex;
    flex: 1;
    border: 2px solid #0f172a;
    border-radius: 10px;
    overflow: hidden;
    box-sizing: border-box;
  }

  .seg button,
  .reset {
    min-height: 48px;
    padding: 0 14px;
    font-weight: 800;
    font-size: 0.82rem;
    border: none;
    background: #ffffff;
    color: #0f172a;
    cursor: pointer;
    touch-action: manipulation;
    box-sizing: border-box;
  }

  .seg button {
    flex: 1;
  }

  .seg button.active {
    background: #0f172a;
    color: #ffffff;
  }

  .reset {
    border: 2px solid #0f172a;
    border-radius: 10px;
  }

  .badge {
    padding: 10px 12px;
    border-radius: 10px;
    font-weight: 800;
    font-size: 0.88rem;
    text-align: center;
    box-sizing: border-box;
  }

  .badge.bad {
    background: #fee2e2;
    color: #991b1b;
    border: 2px solid #dc2626;
  }

  .errs {
    margin: 0;
    padding-left: 20px;
    color: #991b1b;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .court {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 55%, #bfdbfe 100%);
    border: 3px solid #0f172a;
    border-top: none;
    border-radius: 0 0 10px 10px;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    box-sizing: border-box;
  }

  .net {
    position: absolute;
    top: -10px;
    left: -3px;
    right: -3px;
    height: 16px;
    background: #0f172a;
    color: #ffffff;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 2px;
    text-align: center;
    line-height: 16px;
    border-radius: 3px;
    z-index: 2;
  }

  .attack-line {
    position: absolute;
    left: 0;
    right: 0;
    top: 33.33%;
    border-top: 2px dashed #1e3a8a;
    pointer-events: none;
  }

  .attack-label {
    position: absolute;
    top: -16px;
    left: 6px;
    font-size: 9px;
    font-weight: 800;
    color: #1e3a8a;
    text-transform: uppercase;
  }

  .token {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--role-bg, #0284c7);
    color: #ffffff;
    border: 2px solid #0f172a;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1.05;
    font-weight: 900;
    box-shadow: 0 3px 6px rgba(15, 23, 42, 0.3);
    /* Smooth CSS transition when switching between Receive and Transition phases */
    transition:
      left 0.55s cubic-bezier(0.22, 1, 0.36, 1),
      top 0.55s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.15s ease,
      background-color 0.15s ease;
    touch-action: none;
    outline: none;
    z-index: 3;
  }

  .role-tag {
    font-size: 0.8rem;
    font-weight: 900;
  }

  .pos-sub {
    font-size: 0.58rem;
    font-weight: 700;
    opacity: 0.92;
  }

  .court.custom .token {
    cursor: grab;
  }

  /* Hover: only box-shadow, no border-width or dimension changes (prevents layout shift) */
  .token:hover {
    box-shadow:
      0 0 0 3px rgba(245, 158, 11, 0.65),
      0 3px 6px rgba(15, 23, 42, 0.3);
  }

  .token:focus-visible {
    outline: 3px solid #f59e0b;
    outline-offset: 2px;
  }

  /* Disable left/top transition while actively dragging so pointer tracking is immediate */
  .token.dragging {
    cursor: grabbing;
    transition: box-shadow 0.1s ease;
    box-shadow:
      0 0 0 4px #f59e0b,
      0 8px 16px rgba(15, 23, 42, 0.45);
    z-index: 10;
  }

  .token.fault {
    background: #dc2626;
    box-shadow: 0 0 0 3px #fecaca;
  }

  .coords {
    position: absolute;
    top: -24px;
    background: #0f172a;
    color: #ffffff;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
