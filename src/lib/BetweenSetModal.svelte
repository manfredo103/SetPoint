<script lang="ts">
  import type { RotationPosition, ServingTeam } from './types';

  interface Props {
    open: boolean;
    nextSetNumber: number;
    targetPoints: number;
    teamName: string;
    opponentName: string;
    defaultServe: ServingTeam;
    defaultRotation?: RotationPosition;
    hasSubstitutions?: boolean;
    onCancel: () => void;
    onConfirm: (options: {
      startingRotation: RotationPosition;
      opponentRotation: RotationPosition;
      servingTeam: ServingTeam;
      restoreStartingLineup: boolean;
      flipCourt: boolean;
    }) => void;
  }

  let {
    open,
    nextSetNumber,
    targetPoints,
    teamName,
    opponentName,
    defaultServe,
    defaultRotation = 1,
    hasSubstitutions = false,
    onCancel,
    onConfirm
  }: Props = $props();

  let startingRotation = $state<RotationPosition>(1);
  let opponentRotation = $state<RotationPosition>(1);
  let servingTeam = $state<ServingTeam>('us');
  let restoreStartingLineup = $state(true);
  let flipCourt = $state(false);

  $effect(() => {
    if (open) {
      startingRotation = defaultRotation;
      opponentRotation = 1;
      servingTeam = defaultServe;
      restoreStartingLineup = true;
      flipCourt = false;
    }
  });

  function handleConfirm() {
    onConfirm({
      startingRotation,
      opponentRotation,
      servingTeam,
      restoreStartingLineup,
      flipCourt
    });
  }
</script>

{#if open}
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="bsm-title">
    <div class="modal-card">
      <h2 id="bsm-title" class="modal-title">
        Satz {nextSetNumber} starten {targetPoints === 15 ? '(Tie-Break bis 15)' : `(bis ${targetPoints})`}
      </h2>
      <p class="modal-sub">
        Kurze Aufstellungs- & Aufschlag-Bestätigung vor Anpfiff von Satz {nextSetNumber}:
      </p>

      <div class="modal-group">
        <span class="group-label">Erster Aufschlag</span>
        <div class="toggle-grid">
          <button
            type="button"
            class="choice-btn"
            class:active={servingTeam === 'us'}
            onclick={() => (servingTeam = 'us')}
          >
            {teamName}
          </button>
          <button
            type="button"
            class="choice-btn opp"
            class:active={servingTeam === 'them'}
            onclick={() => (servingTeam = 'them')}
          >
            {opponentName}
          </button>
        </div>
      </div>

      <div class="modal-group">
        <span class="group-label">Start-Rotation ({teamName})</span>
        <div class="rot-row">
          {#each [1, 2, 3, 4, 5, 6] as const as r}
            <button
              type="button"
              class="rot-pill"
              class:active={startingRotation === r}
              onclick={() => (startingRotation = r)}
            >
              R{r}
            </button>
          {/each}
        </div>
      </div>

      <div class="modal-group">
        <span class="group-label">Start-Rotation ({opponentName})</span>
        <div class="rot-row">
          {#each [1, 2, 3, 4, 5, 6] as const as r}
            <button
              type="button"
              class="rot-pill opp"
              class:active={opponentRotation === r}
              onclick={() => (opponentRotation = r)}
            >
              R{r}
            </button>
          {/each}
        </div>
      </div>

      <div class="modal-checks">
        {#if hasSubstitutions}
          <label class="check-row">
            <input type="checkbox" bind:checked={restoreStartingLineup} />
            <span>Start-6 aus Satz 1 wiederherstellen (Auswechslungen zurücksetzen)</span>
          </label>
        {/if}
        <label class="check-row">
          <input type="checkbox" bind:checked={flipCourt} />
          <span>Seitenwechsel (Spielfeld-Ansicht um 180° drehen)</span>
        </label>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn-cancel" onclick={onCancel}>Abbrechen</button>
        <button type="button" class="btn-confirm" onclick={handleConfirm}>
          Satz {nextSetNumber} starten (0:0)
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 200;
  }

  .modal-card {
    width: 100%;
    max-width: 440px;
    background: #ffffff;
    color: #0f172a;
    border-radius: 14px;
    padding: 18px;
    box-shadow: 0 20px 30px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-sizing: border-box;
  }

  .modal-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
  }

  .modal-sub {
    margin: -6px 0 0;
    font-size: 0.8rem;
    color: #64748b;
  }

  .modal-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-label {
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    color: #475569;
  }

  .toggle-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .choice-btn {
    min-height: 42px;
    border-radius: 8px;
    border: 2px solid #cbd5e1;
    background: #ffffff;
    color: #334155;
    font-weight: 800;
    font-size: 0.84rem;
    cursor: pointer;
    touch-action: manipulation;
  }

  .choice-btn.active {
    background: #ecfdf5;
    border-color: #16a34a;
    color: #15803d;
  }

  .choice-btn.opp.active {
    background: #fff1f2;
    border-color: #e11d48;
    color: #be123c;
  }

  .rot-row {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 5px;
  }

  .rot-pill {
    min-height: 38px;
    border-radius: 8px;
    border: 1.5px solid #cbd5e1;
    background: #f8fafc;
    color: #334155;
    font-weight: 800;
    font-size: 0.82rem;
    cursor: pointer;
    touch-action: manipulation;
  }

  .rot-pill.active {
    background: #2563eb;
    border-color: #1d4ed8;
    color: #ffffff;
  }

  .rot-pill.opp.active {
    background: #e11d48;
    border-color: #be123c;
    color: #ffffff;
  }

  .modal-checks {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #f8fafc;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #334155;
    cursor: pointer;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .btn-cancel,
  .btn-confirm {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 8px;
    font-weight: 800;
    font-size: 0.86rem;
    border: none;
    cursor: pointer;
    touch-action: manipulation;
  }

  .btn-cancel {
    background: #f1f5f9;
    color: #334155;
  }

  .btn-confirm {
    background: #16a34a;
    color: #ffffff;
  }
</style>
