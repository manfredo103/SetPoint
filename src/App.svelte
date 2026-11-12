<script lang="ts">
  import SetupForm from './lib/SetupForm.svelte';
  import Court from './lib/Court.svelte';
  import MatchHistory from './lib/MatchHistory.svelte';
  import LegalPage from './lib/LegalPage.svelte';
  import { generateId, formatEventTime } from './lib/id';
  import {
    uploadMatch,
    enqueueOfflineMatch,
    getOfflineOutbox,
    getStoredApiKey,
    setStoredApiKey,
    ApiUnauthorizedError,
    ApiNetworkError
  } from './lib/api';
  import type {
    PlayerSelection,
    VolleyballEvent,
    EventCategory,
    EventQuality,
    MatchSetup,
    FormationMode,
    PlayerSetup,
    BenchPlayer,
    RotationPosition,
    CompletedSet,
    VolleyballMatchPayload,
    MatchWinner,
    LegalTab
  } from './lib/types';

  const ACTIVE_MATCH_STORAGE_KEY = 'setpoint_active_match';

  interface ActiveMatchSnapshot {
    step: 'setup' | 'tracker' | 'history' | 'legal';
    returnStepFromHistory: 'setup' | 'tracker';
    returnStepFromLegal: 'setup' | 'tracker' | 'history';
    matchData: MatchSetup;
    matchId: string;
    matchStartedAt: string;
    myScore: number;
    opponentScore: number;
    servingTeam: 'us' | 'them';
    completedSets: CompletedSet[];
    currentRotation: RotationPosition;
    formationMode: FormationMode;
    courtPlayers: PlayerSetup[];
    benchPlayers: BenchPlayer[];
    activeLiberoId: string | null;
    liberoAutoSwap: boolean;
    substitutionCount: number;
    events: VolleyballEvent[];
    opponentLineup: string[];
    matchEndedManually: boolean;
    continuePast25: boolean;
    saveStatus: 'idle' | 'saving' | 'saved' | 'queued' | 'error';
    saveMessage: string | null;
  }

  function loadActiveMatchFromStorage(): ActiveMatchSnapshot | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(ACTIVE_MATCH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.matchData) {
        return parsed as ActiveMatchSnapshot;
      }
    } catch (e) {
      console.warn('Could not load active match from localStorage:', e);
    }
    return null;
  }

  const initialSavedMatch = loadActiveMatchFromStorage();

  // Svelte 5 States
  let step = $state<'setup' | 'tracker' | 'history' | 'legal'>(
    initialSavedMatch ? (initialSavedMatch.step === 'tracker' ? 'tracker' : initialSavedMatch.step) : 'setup'
  );
  let returnStepFromHistory = $state<'setup' | 'tracker'>(
    initialSavedMatch?.returnStepFromHistory ?? 'setup'
  );
  let returnStepFromLegal = $state<'setup' | 'tracker' | 'history'>(
    initialSavedMatch?.returnStepFromLegal ?? 'setup'
  );
  let activeLegalTab = $state<LegalTab>('privacy');
  let matchData = $state<MatchSetup | null>(initialSavedMatch?.matchData ?? null);
  let matchId = $state(initialSavedMatch?.matchId ?? generateId('match'));
  let matchStartedAt = $state(initialSavedMatch?.matchStartedAt ?? new Date().toISOString());
  let restoredMatchNotice = $state(Boolean(initialSavedMatch?.matchData));

  function openLegalView(tab: LegalTab) {
    if (step !== 'legal') {
      returnStepFromLegal = step;
    }
    activeLegalTab = tab;
    step = 'legal';
    if (typeof window !== 'undefined') {
      window.location.hash = tab;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  $effect(() => {
    if (typeof window === 'undefined') return;
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '') as LegalTab;
      if (hash === 'privacy' || hash === 'terms' || hash === 'cookies' || hash === 'impressum') {
        if (step !== 'legal') {
          returnStepFromLegal = step;
        }
        activeLegalTab = hash;
        step = 'legal';
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  });

  // Cloud / InfluxDB Save States
  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'queued' | 'error'>(
    initialSavedMatch?.saveStatus ?? 'idle'
  );
  let saveMessage = $state<string | null>(initialSavedMatch?.saveMessage ?? null);
  let showApiPinPrompt = $state(false);
  let apiPinInput = $state(getStoredApiKey());
  let outboxCount = $state(getOfflineOutbox().length);

  // Live Match Roster & Substitution States
  let courtPlayers = $state<PlayerSetup[]>(initialSavedMatch?.courtPlayers ?? []);
  let benchPlayers = $state<BenchPlayer[]>(initialSavedMatch?.benchPlayers ?? []);
  let activeLiberoId = $state<string | null>(initialSavedMatch?.activeLiberoId ?? null);
  let liberoAutoSwap = $state(initialSavedMatch?.liberoAutoSwap ?? true);
  let substitutionCount = $state(initialSavedMatch?.substitutionCount ?? 0);
  let showSubPanel = $state(false);
  let subOutIndex = $state<number | null>(null);
  let subInBenchId = $state<string | null>(null);

  // Smart Scoreboard & Serve States (Svelte 5)
  let myScore = $state(initialSavedMatch?.myScore ?? 0);
  let opponentScore = $state(initialSavedMatch?.opponentScore ?? 0);
  let servingTeam = $state<'us' | 'them'>(initialSavedMatch?.servingTeam ?? 'us');

  // Match-End & Multi-Set States (Regelwerk: ≥25 Punkte mit ≥2 Punkten Vorsprung + manuelles Spielende)
  const RULEBOOK_TARGET_POINTS = 25;
  const RULEBOOK_MIN_LEAD = 2;
  let matchEndedManually = $state(initialSavedMatch?.matchEndedManually ?? false);
  let continuePast25 = $state(initialSavedMatch?.continuePast25 ?? false);
  let completedSets = $state<CompletedSet[]>(initialSavedMatch?.completedSets ?? []);

  // Svelte 5 Runes State
  let currentRotation = $state<number>(initialSavedMatch?.currentRotation ?? 1);
  let formationMode = $state<FormationMode>(initialSavedMatch?.formationMode ?? 'base');
  let selectedPlayer = $state<PlayerSelection | null>(null);
  let events = $state<VolleyballEvent[]>(initialSavedMatch?.events ?? []);
  let opponentLineup = $state<string[]>(initialSavedMatch?.opponentLineup ?? ["#1", "#2", "#3", "#4", "#5", "#6"]);

  function persistActiveMatch() {
    if (typeof window === 'undefined') return;
    if (!matchData) {
      localStorage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
      return;
    }
    const snapshot: ActiveMatchSnapshot = {
      step,
      returnStepFromHistory,
      returnStepFromLegal,
      matchData,
      matchId,
      matchStartedAt,
      myScore,
      opponentScore,
      servingTeam,
      completedSets,
      currentRotation: currentRotation as RotationPosition,
      formationMode,
      courtPlayers,
      benchPlayers,
      activeLiberoId,
      liberoAutoSwap,
      substitutionCount,
      events,
      opponentLineup,
      matchEndedManually,
      continuePast25,
      saveStatus,
      saveMessage
    };
    try {
      localStorage.setItem(ACTIVE_MATCH_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      console.warn('Could not persist active match to localStorage:', e);
    }
  }

  function clearActiveMatchStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
      localStorage.removeItem('activeMatch');
    } catch (e) {
      console.warn('Could not clear active match from localStorage:', e);
    }
  }

  // Automatisches Speichern bei jeder Zustandsänderung während eines aktiven Spiels
  $effect(() => {
    // Reaktivität auf relevante Variablen registrieren
    const _track = [
      step,
      returnStepFromHistory,
      returnStepFromLegal,
      myScore,
      opponentScore,
      servingTeam,
      currentRotation,
      formationMode,
      substitutionCount,
      activeLiberoId,
      liberoAutoSwap,
      matchEndedManually,
      continuePast25,
      saveStatus,
      saveMessage,
      completedSets,
      events,
      courtPlayers,
      benchPlayers
    ];
    if (matchData) {
      persistActiveMatch();
    }
  });

  // Schutz vor versehentlichem Neuladen / Verlassen der Seite bei laufendem Spiel
  $effect(() => {
    if (typeof window === 'undefined') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (matchData && (myScore > 0 || opponentScore > 0 || events.length > 0 || completedSets.length > 0)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  });

  function checkRulebookWin(us: number, them: number): 'us' | 'them' | null {
    if (us >= RULEBOOK_TARGET_POINTS && us - them >= RULEBOOK_MIN_LEAD) return 'us';
    if (them >= RULEBOOK_TARGET_POINTS && them - us >= RULEBOOK_MIN_LEAD) return 'them';
    return null;
  }

  // Derived Libero & Bench lists
  const registeredLiberos = $derived(benchPlayers.filter((b) => b.isLibero));
  const regularBenchPlayers = $derived(benchPlayers.filter((b) => !b.isLibero));
  const activeLibero = $derived(
    registeredLiberos.find((l) => l.id === activeLiberoId) ?? registeredLiberos[0] ?? null
  );
  const effectiveLiberoName = $derived(
    liberoAutoSwap && activeLibero ? activeLibero.name : null
  );
  const canUndoScoreAction = $derived(
    events.length > 0 && Boolean(events[0]?.scoreSnapshot)
  );

  // Automatische Spielende-Erkennung (≥25 Punkte & ≥2 Vorsprung) + Manuelles Ende (z.B. 5. Satz)
  const rulebookWinner = $derived(checkRulebookWin(myScore, opponentScore));
  const isRulebookMatchOver = $derived(rulebookWinner !== null && !continuePast25);
  const isMatchOver = $derived(isRulebookMatchOver || matchEndedManually);
  const currentSetNumber = $derived(completedSets.length + 1);

  const allMatchSets = $derived.by<CompletedSet[]>(() => {
    if (myScore > 0 || opponentScore > 0 || completedSets.length === 0) {
      return [...completedSets, { setNumber: currentSetNumber, myScore, opponentScore }];
    }
    return [...completedSets];
  });

  const setsStanding = $derived.by(() => {
    let us = 0;
    let them = 0;
    for (const s of allMatchSets) {
      if (s.myScore > s.opponentScore) us++;
      else if (s.opponentScore > s.myScore) them++;
    }
    return { us, them };
  });

  const matchWinner = $derived.by<MatchWinner | null>(() => {
    if (!isMatchOver) return null;
    if (allMatchSets.length > 1) {
      if (setsStanding.us > setsStanding.them) return 'us';
      if (setsStanding.them > setsStanding.us) return 'them';
    }
    if (myScore > opponentScore) return 'us';
    if (opponentScore > myScore) return 'them';
    return 'tie';
  });

  // Live-Hinweis bei Satz-/Matchball oder Verlängerung (24:24+)
  const crunchTimeHint = $derived.by<string | null>(() => {
    if (isMatchOver || continuePast25) return null;
    if (myScore >= 24 && opponentScore >= 24 && myScore === opponentScore) {
      return `Verlängerung (${myScore}:${opponentScore}) • +2 Vorsprung nötig`;
    }
    if (myScore >= 24 && myScore - opponentScore === 1) {
      return `Match-/Satzball ${matchData?.teamName ?? 'Wir'}!`;
    }
    if (opponentScore >= 24 && opponentScore - myScore === 1) {
      return `Match-/Satzball ${matchData?.opponentName ?? 'Gegner'}`;
    }
    return null;
  });

  // Kompakte Post-Match-Statistiken für die Spielende-Übersicht
  const matchSummaryStats = $derived.by(() => {
    let aces = 0;
    let kills = 0;
    let blocks = 0;
    let passSum = 0;
    let passCount = 0;

    for (const ev of events) {
      if (ev.actionId === 'ace') aces++;
      if (ev.actionId === 'kill' || ev.actionId === 'tip_kill') kills++;
      if (ev.actionId === 'block') blocks++;
      if (ev.passRating !== undefined) {
        passSum += ev.passRating;
        passCount++;
      }
    }

    return {
      aces,
      kills,
      blocks,
      passAvg: passCount > 0 ? (passSum / passCount).toFixed(2) : '–',
      passCount
    };
  });

  function handleStartMatch(data: MatchSetup) {
    matchData = data;
    matchId = generateId('match');
    matchStartedAt = new Date().toISOString();
    saveStatus = 'idle';
    saveMessage = null;
    showApiPinPrompt = false;
    outboxCount = getOfflineOutbox().length;
    myScore = 0;
    opponentScore = 0;
    servingTeam = data.initialServe ?? 'us';
    matchEndedManually = false;
    continuePast25 = false;
    completedSets = [];
    currentRotation = 1;
    events = [];
    selectedPlayer = null;
    substitutionCount = 0;
    subOutIndex = null;
    subInBenchId = null;

    courtPlayers = (data.players ?? []).map((p, idx) => ({
      id: p.id ?? `starter-${idx + 1}`,
      position: (idx + 1) as RotationPosition,
      name: p.name,
      role: p.role
    }));

    benchPlayers = (data.bench ?? []).map((b) => ({ ...b }));
    const firstLibero = benchPlayers.find((b) => b.isLibero);
    activeLiberoId = firstLibero ? firstLibero.id : null;
    liberoAutoSwap = Boolean(firstLibero);

    step = 'tracker';
    restoredMatchNotice = false;
    persistActiveMatch();
  }

  function openHistoryView(from: 'setup' | 'tracker') {
    returnStepFromHistory = from;
    outboxCount = getOfflineOutbox().length;
    step = 'history';
  }

  function buildMatchPayload(): VolleyballMatchPayload {
    return {
      matchId,
      startedAt: matchStartedAt,
      endedAt: new Date().toISOString(),
      teamName: matchData?.teamName ?? 'Mein Team',
      opponentName: matchData?.opponentName ?? 'Gegner',
      system: matchData?.system ?? '5-1',
      initialServe: matchData?.initialServe,
      winner: matchWinner ?? 'tie',
      endReason: isRulebookMatchOver ? 'rulebook' : 'manual',
      sets: allMatchSets,
      players: courtPlayers,
      bench: benchPlayers,
      events
    };
  }

  async function handleSaveMatch() {
    if (!matchData || saveStatus === 'saving') return;
    saveStatus = 'saving';
    saveMessage = null;

    if (showApiPinPrompt) {
      setStoredApiKey(apiPinInput);
    }

    const payload = buildMatchPayload();
    try {
      const res = await uploadMatch(payload, apiPinInput);
      saveStatus = 'saved';
      showApiPinPrompt = false;
      outboxCount = getOfflineOutbox().length;
      saveMessage = `Spiel (${allMatchSets.length} ${allMatchSets.length === 1 ? 'Satz' : 'Sätze'}, ${res.syncedEvents} Events) in InfluxDB gespeichert!`;
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        saveStatus = 'error';
        showApiPinPrompt = true;
        saveMessage = 'Team-PIN (VOLLEYBALL_API_KEY) erforderlich oder ungültig.';
      } else if (err instanceof ApiNetworkError) {
        enqueueOfflineMatch(payload);
        outboxCount = getOfflineOutbox().length;
        saveStatus = 'queued';
        saveMessage = 'Keine Server-Verbindung: Spiel wurde lokal gesichert und kann später unter „Gespeicherte Spiele“ hochgeladen werden.';
      } else {
        saveStatus = 'error';
        saveMessage = err instanceof Error ? err.message : 'Fehler beim Speichern.';
      }
    }
  }

  function handleReset() {
    if (confirm("Möchtest du das aktuelle Spiel beenden und ein neues Setup starten?")) {
      clearActiveMatchStorage();
      step = 'setup';
      matchData = null;
      courtPlayers = [];
      benchPlayers = [];
      activeLiberoId = null;
      events = [];
      completedSets = [];
      myScore = 0;
      opponentScore = 0;
      currentRotation = 1;
      substitutionCount = 0;
      matchEndedManually = false;
      continuePast25 = false;
      saveStatus = 'idle';
      saveMessage = null;
      restoredMatchNotice = false;
    }
  }

  // Aktuelle Feldposition (1–6) eines Spielers anhand seines Lineup-Index (0–5) berechnen:
  // Da playerIndex = (pos - currentRotation + 6) % 6 gilt, ist pos = ((playerIndex + currentRotation - 1) % 6) + 1
  function getCurrentPosForIndex(playerIndex: number, rot: number): RotationPosition {
    return (((playerIndex + rot - 1) % 6) + 1) as RotationPosition;
  }

  function getCourtPlayerLabelAtPos(pos: RotationPosition, rot: number) {
    const playerIndex = (pos - rot + 6) % 6;
    const item = courtPlayers[playerIndex];
    const roleStr = (item?.role ?? '').toUpperCase();
    let player = item?.name
      ? item.role
        ? `${item.name} (${item.role})`
        : item.name
      : `#${playerIndex + 1}`;

    const isBackRow = pos === 1 || pos === 5 || pos === 6;
    const isMB = roleStr === 'MB1' || roleStr === 'MB2';
    if (isBackRow && isMB && effectiveLiberoName) {
      player = `${effectiveLiberoName} (L)`;
    }

    return { player, playerIndex };
  }

  function syncSelectionState(rot: number = currentRotation) {
    if (!selectedPlayer) return;
    if (selectedPlayer.team === 'myTeam') {
      const { player, playerIndex } = getCourtPlayerLabelAtPos(selectedPlayer.position, rot);
      selectedPlayer = {
        ...selectedPlayer,
        player,
        playerIndex,
        rotation: rot,
        isServer: selectedPlayer.position === 1 && servingTeam === 'us'
      };
      subOutIndex = playerIndex;
    } else {
      selectedPlayer = {
        ...selectedPlayer,
        isServer: selectedPlayer.position === 1 && servingTeam === 'them'
      };
    }
  }

  // Zentrale Side-out & Punkt-Logik nach offiziellen Volleyball-Regeln
  function addPoint(winningTeam: 'us' | 'them') {
    if (winningTeam === 'us') {
      myScore++;
      if (servingTeam === 'them') {
        // Side-out gewonnen! Aufschlagrecht wechselt zu uns + wir rotieren im Uhrzeigersinn (Läufer zählt herunter: 1 -> 6 -> ... -> 1)
        servingTeam = 'us';
        const nextRot = currentRotation === 1 ? 6 : currentRotation - 1;
        currentRotation = nextRot;
        syncSelectionState(nextRot);
      }
    } else {
      opponentScore++;
      if (servingTeam === 'us') {
        // Side-out für den Gegner! Aufschlagrecht wechselt, wir rotieren NICHT
        servingTeam = 'them';
        syncSelectionState(currentRotation);
      }
    }
  }

  function setServingTeamManual(team: 'us' | 'them') {
    if (isMatchOver || servingTeam === team) return;
    servingTeam = team;
    syncSelectionState(currentRotation);
  }

  function adjustScoreManual(team: 'us' | 'them', delta: -1) {
    if (team === 'us') {
      myScore = Math.max(0, myScore + delta);
    } else {
      opponentScore = Math.max(0, opponentScore + delta);
    }
    if (checkRulebookWin(myScore, opponentScore) === null) {
      continuePast25 = false;
    }
  }

  function logManualPoint(winningTeam: 'us' | 'them') {
    if (isMatchOver) return;
    const id = generateId('pt');
    const timestamp = formatEventTime();
    const snapshot = {
      myScore,
      opponentScore,
      servingTeam,
      rotation: currentRotation as RotationPosition
    };
    const eventRotation = currentRotation as RotationPosition;
    const prevServe = servingTeam;

    addPoint(winningTeam);
    const didSideout = prevServe !== servingTeam;
    const reachedRulebookEnd = !continuePast25 && checkRulebookWin(myScore, opponentScore) !== null;
    const teamLabel =
      winningTeam === 'us'
        ? matchData?.teamName ?? 'Mein Team'
        : matchData?.opponentName ?? 'Gegner';

    const newEvent: VolleyballEvent = {
      id,
      timestamp,
      isoTimestamp: new Date().toISOString(),
      setNumber: currentSetNumber,
      category: 'note',
      quality: winningTeam === 'us' ? 'good' : 'bad',
      action: `Punkt ${teamLabel}`,
      rotation: eventRotation,
      team: winningTeam === 'us' ? 'myTeam' : 'opponent',
      scoreAfter: `${myScore}:${opponentScore}`,
      isSideout: didSideout || undefined,
      isMatchEnd: reachedRulebookEnd || undefined,
      scoreSnapshot: snapshot
    };

    saveStatus = 'idle';
    events = [newEvent, ...events];
  }

  function undoLastEvent() {
    if (!canUndoScoreAction) return;
    const [latest, ...rest] = events;
    if (latest.actionId === 'manual_end') {
      matchEndedManually = false;
    }
    if (latest.scoreSnapshot) {
      myScore = latest.scoreSnapshot.myScore;
      opponentScore = latest.scoreSnapshot.opponentScore;
      servingTeam = latest.scoreSnapshot.servingTeam;
      currentRotation = latest.scoreSnapshot.rotation;
      syncSelectionState(latest.scoreSnapshot.rotation);
    }
    if (checkRulebookWin(myScore, opponentScore) === null) {
      continuePast25 = false;
    }
    saveStatus = 'idle';
    saveMessage = null;
    events = rest;
  }

  function handleManualEndMatch() {
    if (isMatchOver) return;
    if (!confirm(`Spiel beim Stand von ${myScore}:${opponentScore} jetzt beenden (z.B. 5. Satz / vorzeitiges Spielende)?`)) {
      return;
    }

    const snapshot = {
      myScore,
      opponentScore,
      servingTeam,
      rotation: currentRotation as RotationPosition
    };
    matchEndedManually = true;
    saveStatus = 'idle';
    saveMessage = null;

    const myName = matchData?.teamName ?? 'Mein Team';
    const oppName = matchData?.opponentName ?? 'Gegner';
    const summaryText =
      myScore > opponentScore
        ? `Sieg ${myName} (${myScore}:${opponentScore})`
        : opponentScore > myScore
          ? `Sieg ${oppName} (${myScore}:${opponentScore})`
          : `Endstand ${myScore}:${opponentScore}`;

    const endEvent: VolleyballEvent = {
      id: generateId('end'),
      timestamp: formatEventTime(),
      isoTimestamp: new Date().toISOString(),
      setNumber: currentSetNumber,
      actionId: 'manual_end',
      category: 'note',
      quality: myScore > opponentScore ? 'good' : myScore < opponentScore ? 'bad' : 'neutral',
      action: `Spiel manuell beendet — ${summaryText}`,
      rotation: currentRotation as RotationPosition,
      scoreAfter: `${myScore}:${opponentScore}`,
      isMatchEnd: true,
      scoreSnapshot: snapshot
    };

    events = [endEvent, ...events];
  }

  function handleResumeMatch() {
    if (matchEndedManually) {
      matchEndedManually = false;
      if (events[0]?.actionId === 'manual_end') {
        events = events.slice(1);
      }
    }
    if (checkRulebookWin(myScore, opponentScore) !== null) {
      continuePast25 = true;
    }
    saveStatus = 'idle';
    saveMessage = null;
  }

  function startNewSetInternal() {
    if (myScore > 0 || opponentScore > 0) {
      completedSets = [
        ...completedSets,
        { setNumber: completedSets.length + 1, myScore, opponentScore }
      ];
    }
    myScore = 0;
    opponentScore = 0;
    matchEndedManually = false;
    continuePast25 = false;
    saveStatus = 'idle';
    saveMessage = null;
    currentRotation = 1;
    substitutionCount = 0;
    servingTeam = servingTeam === 'us' ? 'them' : 'us';
    syncSelectionState(1);

    const nextSetNum = completedSets.length + 1;
    events = [
      {
        id: generateId('set'),
        timestamp: formatEventTime(),
        isoTimestamp: new Date().toISOString(),
        setNumber: nextSetNum,
        category: 'note',
        quality: 'neutral',
        action: `Satz ${nextSetNum} gestartet (0:0)`,
        rotation: 1
      },
      ...events
    ];
  }

  function handleNewSet() {
    if (isMatchOver) {
      startNewSetInternal();
      return;
    }
    if (confirm("Neuen Satz starten? Spielstand (0:0), Rotation (R1) und Wechselzähler (0/6) werden zurückgesetzt.")) {
      startNewSetInternal();
    }
  }

  function performSubstitution() {
    if (isMatchOver || subOutIndex === null || !subInBenchId) return;
    const outgoing = courtPlayers[subOutIndex];
    const incomingBenchIdx = benchPlayers.findIndex(
      (b) => b.id === subInBenchId && !b.isLibero
    );
    if (!outgoing || incomingBenchIdx === -1) return;

    const incoming = benchPlayers[incomingBenchIdx];
    const currentPos = getCurrentPosForIndex(subOutIndex, currentRotation);
    const row: 'front' | 'back' =
      currentPos === 2 || currentPos === 3 || currentPos === 4 ? 'front' : 'back';

    // Swap players between court and bench
    courtPlayers[subOutIndex] = {
      id: incoming.id,
      position: outgoing.position,
      name: incoming.name,
      role: incoming.role
    };

    benchPlayers[incomingBenchIdx] = {
      id: outgoing.id ?? generateId('player'),
      name: outgoing.name,
      role: outgoing.role,
      isLibero: false
    };

    substitutionCount += 1;

    // Falls der ausgewechselte Spieler gerade ausgewählt war, Auswahl aktualisieren
    if (selectedPlayer && selectedPlayer.team === 'myTeam' && selectedPlayer.playerIndex === subOutIndex) {
      selectedPlayer = {
        ...selectedPlayer,
        player: `${incoming.name} (${incoming.role})`
      };
    }

    // Wechsel im Spielverlauf protokollieren
    events = [
      {
        id: generateId('sub'),
        timestamp: formatEventTime(),
        isoTimestamp: new Date().toISOString(),
        setNumber: currentSetNumber,
        category: 'substitution',
        quality: 'neutral',
        action: `Wechsel: ${incoming.name} (${incoming.role}) rein für ${outgoing.name} (${outgoing.role})`,
        rotation: currentRotation as RotationPosition,
        player: `${incoming.name} (${incoming.role})`,
        position: currentPos,
        row,
        team: 'myTeam'
      },
      ...events
    ];

    subInBenchId = null;
  }

  function switchActiveLibero(libero: BenchPlayer) {
    if (activeLibero?.id === libero.id && liberoAutoSwap) return;
    activeLiberoId = libero.id;
    liberoAutoSwap = true;

    events = [
      {
        id: generateId('lib'),
        timestamp: formatEventTime(),
        isoTimestamp: new Date().toISOString(),
        setNumber: currentSetNumber,
        category: 'substitution',
        quality: 'neutral',
        action: `Libero aktiv: ${libero.name} (L)`,
        rotation: currentRotation as RotationPosition,
        player: `${libero.name} (L)`,
        team: 'myTeam'
      },
      ...events
    ];
  }

  // Smart Quick Actions für implizites Scoring & detaillierte Nachbereitung (Post-Match Review)
  type ActionGroupId = 'us' | 'them' | 'rally';

  type QuickAction = {
    id: string;
    label: string;
    pointFor?: 'us' | 'them'; // Wenn ausgelassen: neutrale In-Rallye-Statistik ohne Punkt/Rotation
    group: ActionGroupId;
    category: EventCategory;
    quality: EventQuality;
    passRating?: 0 | 1 | 2 | 3; // 0–3 Skala für Annahme-Index in der Spielanalyse
  };

  let activeActionFilter = $state<'all' | ActionGroupId>('all');

  const actionGroups: { id: ActionGroupId; title: string; badge: string }[] = [
    { id: 'us', title: 'Eigene Punkte', badge: '+1 Wir' },
    { id: 'them', title: 'Punktverlust & Fehler', badge: '+1 Gegner' },
    { id: 'rally', title: 'Annahme & Rallye-Kontakte', badge: 'Review-Stat' }
  ];

  const quickActions: QuickAction[] = [
    // --- 1. EIGENE PUNKTE (pointFor: 'us') ---
    { id: 'ace', label: 'Ass', pointFor: 'us', group: 'us', category: 'serve', quality: 'good' },
    { id: 'kill', label: 'Kill Angriff', pointFor: 'us', group: 'us', category: 'attack', quality: 'good' },
    { id: 'tip_kill', label: 'Leger / Feinte +', pointFor: 'us', group: 'us', category: 'attack', quality: 'good' },
    { id: 'block', label: 'Kill Block', pointFor: 'us', group: 'us', category: 'block', quality: 'good' },
    { id: 'opp_err_serve', label: 'Geg. Aufschlag -', pointFor: 'us', group: 'us', category: 'serve', quality: 'good' },
    { id: 'opp_err', label: 'Gegner Fehler', pointFor: 'us', group: 'us', category: 'error', quality: 'good' },

    // --- 2. PUNKTVERLUST & EIGENE FEHLER (pointFor: 'them') ---
    { id: 'err_serve', label: 'Aufschlagfehler', pointFor: 'them', group: 'them', category: 'serve', quality: 'bad' },
    { id: 'err_rcv', label: 'Annahmefehler (0)', pointFor: 'them', group: 'them', category: 'reception', quality: 'bad', passRating: 0 },
    { id: 'err_atk', label: 'Angriff Aus/Netz', pointFor: 'them', group: 'them', category: 'attack', quality: 'bad' },
    { id: 'atk_blocked', label: 'Geblockt worden', pointFor: 'them', group: 'them', category: 'attack', quality: 'bad' },
    { id: 'err_set', label: 'Zuspielfehler', pointFor: 'them', group: 'them', category: 'setting', quality: 'bad' },
    { id: 'err_net', label: 'Netz / Übertritt', pointFor: 'them', group: 'them', category: 'error', quality: 'bad' },
    { id: 'err_def', label: 'Abwehr / Leger -', pointFor: 'them', group: 'them', category: 'defense', quality: 'bad' },
    { id: 'opp_kill', label: 'Gegner Kill', pointFor: 'them', group: 'them', category: 'defense', quality: 'bad' },

    // --- 3. IN-RALLYE & ANNAHME-QUALITÄT (Neutral, kein Punkt — essenziell für Review) ---
    { id: 'pass_3', label: 'Perfekte Annahme (3)', group: 'rally', category: 'reception', quality: 'good', passRating: 3 },
    { id: 'pass_2', label: 'Gute Annahme (2)', group: 'rally', category: 'reception', quality: 'neutral', passRating: 2 },
    { id: 'pass_1', label: 'Not-Annahme (1)', group: 'rally', category: 'reception', quality: 'bad', passRating: 1 },
    { id: 'serve_plus', label: 'Aufschlag Druck (+)', group: 'rally', category: 'serve', quality: 'good' },
    { id: 'set_assist', label: 'Starkes Zuspiel (+)', group: 'rally', category: 'setting', quality: 'good' },
    { id: 'block_touch', label: 'Block Touch (+)', group: 'rally', category: 'block', quality: 'good' },
    { id: 'def_dig', label: 'Starke Abwehr (Dig)', group: 'rally', category: 'defense', quality: 'good' },
    { id: 'freeball_over', label: 'Danke-Ball rüber', group: 'rally', category: 'attack', quality: 'bad' }
  ];

  const visibleActionGroups = $derived(
    activeActionFilter === 'all'
      ? actionGroups
      : actionGroups.filter((g) => g.id === activeActionFilter)
  );

  function getActionVariant(item: QuickAction): 'positive' | 'negative' | 'rally-good' | 'rally-warn' | 'neutral' {
    if (item.pointFor === 'us') return 'positive';
    if (item.pointFor === 'them') return 'negative';
    if (item.quality === 'good') return 'rally-good';
    if (item.quality === 'bad') return 'rally-warn';
    return 'neutral';
  }

  function handleSelectPlayer(selection: PlayerSelection | null) {
    selectedPlayer = selection;
    if (selection === null) {
      subOutIndex = null;
    } else if (selection.team === 'myTeam') {
      subOutIndex = selection.playerIndex;
    }
  }

  function handleRotationChange(newRot: number) {
    currentRotation = newRot;
  }

  function logAction(actionItem: QuickAction) {
    if (isMatchOver) return;
    const id = generateId('act');
    const timestamp = formatEventTime();
    const snapshot = {
      myScore,
      opponentScore,
      servingTeam,
      rotation: currentRotation as RotationPosition
    };
    const eventRotation = currentRotation as RotationPosition;
    const eventPlayer = selectedPlayer ? selectedPlayer.player : undefined;
    const eventPosition = selectedPlayer ? selectedPlayer.position : undefined;
    const eventRow = selectedPlayer ? selectedPlayer.row : undefined;
    const eventTeam = selectedPlayer ? selectedPlayer.team : 'myTeam';

    let didSideout = false;
    if (actionItem.pointFor) {
      const prevServe = servingTeam;
      addPoint(actionItem.pointFor);
      didSideout = prevServe !== servingTeam;
    }

    const reachedRulebookEnd = Boolean(
      actionItem.pointFor && !continuePast25 && checkRulebookWin(myScore, opponentScore) !== null
    );

    const newEvent: VolleyballEvent = {
      id,
      timestamp,
      isoTimestamp: new Date().toISOString(),
      setNumber: currentSetNumber,
      actionId: actionItem.id,
      category: actionItem.category,
      quality: actionItem.quality,
      action: actionItem.label,
      rotation: eventRotation,
      player: eventPlayer,
      position: eventPosition,
      row: eventRow,
      team: eventTeam,
      passRating: actionItem.passRating,
      scoreAfter: actionItem.pointFor ? `${myScore}:${opponentScore}` : undefined,
      isSideout: didSideout || undefined,
      isMatchEnd: reachedRulebookEnd || undefined,
      scoreSnapshot: snapshot
    };

    saveStatus = 'idle';
    events = [newEvent, ...events];
  }

  function deleteEvent(id: string) {
    events = events.filter((e) => e.id !== id);
  }

  function clearEvents() {
    if (confirm("Möchtest du wirklich alle geloggten Events löschen?")) {
      events = [];
    }
  }
</script>

<main
  class="app-container"
  class:is-setup={step === 'setup'}
  class:is-history={step === 'history'}
  class:is-legal={step === 'legal'}
>
  {#if step === 'history'}
    <!-- SCHRITT 3: Gespeicherte Spiele & Multi-Satz Nachbereitung -->
    <MatchHistory
      onBack={() => (step = returnStepFromHistory)}
      onOutboxChange={(count) => (outboxCount = count)}
    />

  {:else if step === 'legal'}
    <!-- RECHTLICHE HINWEISE / LEGAL NOTICE -->
    <LegalPage
      initialTab={activeLegalTab}
      onBack={() => {
        step = returnStepFromLegal;
        if (typeof window !== 'undefined' && window.location.hash) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }}
    />

  {:else if step === 'setup'}
    <!-- SCHRITT 1: Setup-Formular + Setup Header -->
    <header class="app-header">
      <div class="header-content">
        <div class="logo-area">
          <div>
            <h1 class="app-title">SetPoint</h1>
            <p class="app-subtitle">Volleyball Match & Rotations Tracker</p>
          </div>
        </div>
        <div class="header-badges">
          <button
            type="button"
            onclick={() => openHistoryView('setup')}
            class="reset-btn"
            title="Gespeicherte Spiele & Analyse öffnen"
          >
            Archiv
            {#if outboxCount > 0}
              <span class="outbox-pill">{outboxCount}</span>
            {/if}
          </button>
          <span class="badge setup-tag">SETUP</span>
        </div>
      </div>
    </header>

    <div class="setup-content">
      <SetupForm onStartMatch={handleStartMatch} />
    </div>

  {:else if step === 'tracker' && matchData}
    <!-- SCHRITT 2: Live-Tracker (Wird erst NACH dem Setup angezeigt) -->

    <!-- PWA App Header -->
    <header class="app-header">
      <div class="header-content">
        <div class="logo-area">
          <div>
            <h1 class="app-title">{matchData.teamName} vs {matchData.opponentName}</h1>
            <p class="app-subtitle">SetPoint • Live Match & Rotations Tracker</p>
          </div>
        </div>
        <div class="header-badges">
          {#if !isMatchOver}
            <button
              type="button"
              onclick={handleManualEndMatch}
              class="end-match-header-btn"
              title="Spiel manuell beenden (z.B. 5. Satz Tie-Break oder vorzeitiges Ende)"
            >
              Spiel beenden
            </button>
          {/if}
          <button
            type="button"
            onclick={() => openHistoryView('tracker')}
            class="reset-btn"
            title="Gespeicherte Spiele & Analyse öffnen"
          >
            Archiv
            {#if outboxCount > 0}
              <span class="outbox-pill">{outboxCount}</span>
            {/if}
          </button>
          <button type="button" onclick={handleReset} class="reset-btn">Neu</button>
          {#if isMatchOver}
            <span class="badge ended">BEENDET</span>
          {:else}
            <span class="badge live">LIVE</span>
          {/if}
        </div>
      </div>
    </header>

    <div class="app-content">
      {#if restoredMatchNotice}
        <div class="restored-banner" role="status">
          <span class="restored-text">
            Laufendes Spiel wiederhergestellt: {matchData.teamName} vs {matchData.opponentName} (Satz {currentSetNumber}, {myScore}:{opponentScore})
          </span>
          <button
            type="button"
            class="restored-dismiss"
            onclick={() => (restoredMatchNotice = false)}
            title="Hinweis schließen"
          >
            Verstanden
          </button>
        </div>
      {/if}
      <!-- AUTOMATISCHE & MANUELLE SPIELENDE-ANZEIGE -->
      {#if isMatchOver}
        <section
          class="match-over-banner"
          class:won-us={matchWinner === 'us'}
          class:won-them={matchWinner === 'them'}
          aria-live="polite"
        >
          <div class="mo-top">
            <div class="mo-headline">
              <div>
                <h2 class="mo-title">
                  {#if matchWinner === 'us'}
                    Spielende — Sieg für {matchData.teamName}!
                  {:else if matchWinner === 'them'}
                    Spielende — Sieg für {matchData.opponentName}
                  {:else}
                    Spiel beendet — Unentschieden
                  {/if}
                </h2>
                <span class="mo-reason">
                  {#if isRulebookMatchOver}
                    Automatisch erkannt (Regelwerk: ≥25 Punkte & ≥2 Punkte Vorsprung)
                  {:else}
                    Manuell beendet (z.B. 5. Satz Tie-Break / vorzeitiges Spielende)
                  {/if}
                </span>
              </div>
            </div>

            <div class="mo-final-score">
              {#if allMatchSets.length > 1}
                <span class="mo-score-nums">Sätze {setsStanding.us} : {setsStanding.them}</span>
                <div class="mo-prev-sets">
                  {#each allMatchSets as s (s.setNumber)}
                    <span class="mo-set-chip" class:current={s.setNumber === currentSetNumber}>
                      S{s.setNumber} {s.myScore}:{s.opponentScore}
                    </span>
                  {/each}
                </div>
              {:else}
                <span class="mo-score-nums">{myScore} : {opponentScore}</span>
              {/if}
            </div>
          </div>

          <!-- Kompakte Spielstatistik für direktes Coaching-Review -->
          <div class="mo-stats-grid">
            <div class="mo-stat">
              <span class="mo-stat-val">{matchSummaryStats.aces}</span>
              <span class="mo-stat-lbl">Asse</span>
            </div>
            <div class="mo-stat">
              <span class="mo-stat-val">{matchSummaryStats.kills}</span>
              <span class="mo-stat-lbl">Kills</span>
            </div>
            <div class="mo-stat">
              <span class="mo-stat-val">{matchSummaryStats.blocks}</span>
              <span class="mo-stat-lbl">Kill Blocks</span>
            </div>
            <div class="mo-stat">
              <span class="mo-stat-val">{matchSummaryStats.passAvg}</span>
              <span class="mo-stat-lbl">Ø Annahme ({matchSummaryStats.passCount})</span>
            </div>
          </div>

          {#if showApiPinPrompt}
            <div class="mo-pin-row">
              <label for="mo-pin-field" class="mo-pin-label">Team-PIN (`VOLLEYBALL_API_KEY`):</label>
              <input
                id="mo-pin-field"
                type="password"
                bind:value={apiPinInput}
                placeholder="PIN eingeben"
                class="mo-pin-input"
              />
              <button type="button" class="mo-btn save" onclick={handleSaveMatch}>
                Mit PIN speichern
              </button>
            </div>
          {/if}

          {#if saveMessage}
            <div
              class="mo-save-feedback"
              class:ok={saveStatus === 'saved'}
              class:queued={saveStatus === 'queued'}
              class:err={saveStatus === 'error'}
            >
              {saveMessage}
            </div>
          {/if}

          <div class="mo-actions">
            <button
              type="button"
              class="mo-btn save"
              onclick={handleSaveMatch}
              disabled={saveStatus === 'saving'}
              title="Komplettes Spiel inkl. aller Sätze, Aufstellung & Events über Go-Server in InfluxDB speichern"
            >
              {#if saveStatus === 'saving'}
                Speichere…
              {:else if saveStatus === 'saved'}
                In DB gespeichert (Erneut sichern)
              {:else if saveStatus === 'queued'}
                Lokal gesichert (Erneut versuchen)
              {:else}
                Spiel speichern
              {/if}
            </button>
            <button
              type="button"
              class="mo-btn primary"
              onclick={handleNewSet}
              title="Diesen Satz speichern und nächsten Satz bei 0:0 starten"
            >
              Nächster Satz (0:0)
            </button>
            <button
              type="button"
              class="mo-btn secondary"
              onclick={undoLastEvent}
              disabled={!canUndoScoreAction}
              title="Letzten Punkt bzw. Spielende rückgängig machen"
            >
              Undo
            </button>
            <button
              type="button"
              class="mo-btn secondary"
              onclick={handleResumeMatch}
              title="Aktuellen Satz ohne 25-Punkte-Sperre weiterspielen"
            >
              Weiterspielen
            </button>
            <button
              type="button"
              class="mo-btn secondary"
              onclick={() => openHistoryView('tracker')}
              title="Gespeicherte Spiele & Analyse ansehen"
            >
              Archiv
            </button>
            <button
              type="button"
              class="mo-btn dark"
              onclick={handleReset}
              title="Neues Spiel-Setup öffnen"
            >
              Neues Spiel
            </button>
          </div>
        </section>
      {/if}

      <div class="col-court">
      <!-- SMART SCOREBOARD & IMPLIZITES SIDE-OUT TRACKING -->
      <section
        class="scoreboard-section"
        class:match-over={isMatchOver}
        aria-label="Smart Scoreboard"
      >
        <div class="sb-toolbar">
          {#if isMatchOver}
            <span class="sb-phase-pill match-ended">Spiel beendet ({myScore}:{opponentScore})</span>
          {:else if servingTeam === 'us'}
            <span class="sb-phase-pill serving-us">Eigener Aufschlag (Break)</span>
          {:else}
            <span class="sb-phase-pill serving-them">Annahme • Punkt = Side-out ↻</span>
          {/if}

          <div class="sb-actions">
            <button
              type="button"
              class="sb-util-btn"
              onclick={undoLastEvent}
              disabled={!canUndoScoreAction}
              title="Letzte Aktion inkl. Punkt & Rotation rückgängig machen"
            >
              Undo
            </button>
            <button
              type="button"
              class="sb-util-btn"
              onclick={handleNewSet}
              title="Neuen Satz starten (0:0)"
            >
              0:0 Satz
            </button>
            <button
              type="button"
              class="sb-util-btn end-btn"
              onclick={handleManualEndMatch}
              disabled={isMatchOver}
              title="Spiel manuell beenden (z.B. 5. Satz Tie-Break bei 15 Punkten)"
            >
              Ende
            </button>
          </div>
        </div>

        {#if completedSets.length > 0 || crunchTimeHint}
          <div class="sb-meta-row">
            {#if completedSets.length > 0}
              <div class="sb-sets-strip">
                {#each completedSets as s (s.setNumber)}
                  <span class="sb-set-pill">S{s.setNumber} {s.myScore}:{s.opponentScore}</span>
                {/each}
                <span class="sb-set-pill active">
                  Satz {currentSetNumber}{currentSetNumber === 5 ? ' (Tie-Break)' : ''}
                </span>
              </div>
            {/if}
            {#if crunchTimeHint}
              <span class="sb-crunch-pill">{crunchTimeHint}</span>
            {/if}
          </div>
        {/if}

        <div class="sb-board">
          <!-- UNSER TEAM -->
          <div class="sb-team us" class:is-serving={servingTeam === 'us' && !isMatchOver}>
            <button
              type="button"
              class="sb-serve-pill"
              class:active={servingTeam === 'us'}
              disabled={isMatchOver}
              onclick={() => setServingTeamManual('us')}
              title="Aufschlagrecht manuell auf eigenes Team setzen"
            >
              {servingTeam === 'us' ? 'AUFSCHLAG' : 'Aufschlag hier'}
            </button>
            <span class="sb-team-name">{matchData.teamName}</span>
            <span class="sb-score">{myScore}</span>
            <div class="sb-btn-row">
              <button
                type="button"
                class="sb-minus-btn"
                onclick={() => adjustScoreManual('us', -1)}
                disabled={myScore === 0}
                aria-label="Eigenen Punkt korrigieren"
              >
                −
              </button>
              <button
                type="button"
                class="sb-plus-btn us"
                onclick={() => logManualPoint('us')}
                disabled={isMatchOver}
                aria-label="Punkt für eigenes Team"
              >
                +1 {servingTeam === 'them' ? '↻' : ''}
              </button>
            </div>
          </div>

          <!-- MITTE: DOPPELPUNKT & AKTUELLE ROTATION -->
          <div class="sb-vs">
            <span class="sb-colon">:</span>
            <span class="sb-rot-chip">R{currentRotation}</span>
          </div>

          <!-- GEGNER -->
          <div class="sb-team them" class:is-serving={servingTeam === 'them' && !isMatchOver}>
            <button
              type="button"
              class="sb-serve-pill them"
              class:active={servingTeam === 'them'}
              disabled={isMatchOver}
              onclick={() => setServingTeamManual('them')}
              title="Aufschlagrecht manuell auf Gegner setzen"
            >
              {servingTeam === 'them' ? 'AUFSCHLAG' : 'Aufschlag hier'}
            </button>
            <span class="sb-team-name">{matchData.opponentName}</span>
            <span class="sb-score">{opponentScore}</span>
            <div class="sb-btn-row">
              <button
                type="button"
                class="sb-minus-btn"
                onclick={() => adjustScoreManual('them', -1)}
                disabled={opponentScore === 0}
                aria-label="Gegnerischen Punkt korrigieren"
              >
                −
              </button>
              <button
                type="button"
                class="sb-plus-btn them"
                onclick={() => logManualPoint('them')}
                disabled={isMatchOver}
                aria-label="Punkt für Gegner"
              >
                +1
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Spielfeld-Komponente -->
      <section class="court-section">
        <Court
          bind:currentRotation
          bind:selectedPlayer
          bind:formationMode
          servingTeam={servingTeam}
          myTeamName={matchData.teamName}
          opponentName={matchData.opponentName}
          myTeamLineup={courtPlayers}
          opponentLineup={opponentLineup}
          activeLiberoName={effectiveLiberoName}
          onSelectPlayer={handleSelectPlayer}
          onRotationChange={handleRotationChange}
        />
      </section>

      <!-- LIVE SPIELERWECHSEL & LIBERO SEKTION -->
      <section class="sub-section" aria-label="Spielerwechsel und Bank">
        <button
          type="button"
          class="sub-header-btn"
          onclick={() => (showSubPanel = !showSubPanel)}
          aria-expanded={showSubPanel}
        >
          <div class="sub-header-left">
            <span class="sub-title">Spielerwechsel & Bank</span>
            <span class="sub-count-badge">Wechsel: {substitutionCount}/6</span>
            {#if activeLibero}
              <span class="libero-status-pill" class:paused={!liberoAutoSwap}>
                {activeLibero.name} {liberoAutoSwap ? '' : '(Pausiert)'}
              </span>
            {/if}
          </div>
          <span class="sub-chevron">{showSubPanel ? '▴' : '▾'}</span>
        </button>

        {#if showSubPanel}
          <div class="sub-body">
            <!-- LIBERO STEUERUNG (FALLS VOR SPIELBEGINN REGISTRIERT) -->
            {#if registeredLiberos.length > 0}
              <div class="libero-control-box">
                <div class="libero-box-top">
                  <span class="sub-group-label">Registrierte Liberos</span>
                  <label class="auto-swap-toggle">
                    <input type="checkbox" bind:checked={liberoAutoSwap} />
                    <span>Auto-Wechsel für MB</span>
                  </label>
                </div>

                <div class="libero-pills">
                  {#each registeredLiberos as lib (lib.id)}
                    <button
                      type="button"
                      class="libero-choice-btn"
                      class:active={activeLibero?.id === lib.id && liberoAutoSwap}
                      onclick={() => switchActiveLibero(lib)}
                    >
                      {lib.name} (L)
                      {#if activeLibero?.id === lib.id && liberoAutoSwap}
                        <span class="active-tag">AKTIV</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- REGULÄRER FELDSPIELER-WECHSEL -->
            <div class="regular-sub-box">
              <div class="sub-box-header">
                <span class="sub-group-label">Feldspieler ein-/auswechseln</span>
                {#if substitutionCount > 0}
                  <button
                    type="button"
                    class="reset-subs-link"
                    onclick={() => (substitutionCount = 0)}
                    title="Wechselzähler für neuen Satz zurücksetzen"
                  >
                    Neuer Satz (0/6)
                  </button>
                {/if}
              </div>

              {#if regularBenchPlayers.length === 0}
                <p class="no-bench-msg">
                  Keine regulären Feld-Auswechselspieler vor Spielbeginn registriert.
                </p>
              {:else}
                <div class="sub-step">
                  <span class="step-label">1. Vom Feld (Raus):</span>
                  <div class="sub-player-grid">
                    {#each courtPlayers as cp, idx (cp.id ?? idx)}
                      {@const curPos = getCurrentPosForIndex(idx, currentRotation)}
                      <button
                        type="button"
                        class="sub-choice-btn out"
                        class:selected={subOutIndex === idx}
                        onclick={() => (subOutIndex = subOutIndex === idx ? null : idx)}
                      >
                        <span class="p-pos">P{curPos}</span>
                        <span class="p-name">{cp.name}</span>
                        <span class="p-role">{cp.role}</span>
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="sub-step">
                  <span class="step-label">2. Von der Bank (Rein):</span>
                  <div class="sub-player-grid">
                    {#each regularBenchPlayers as bp (bp.id)}
                      <button
                        type="button"
                        class="sub-choice-btn in"
                        class:selected={subInBenchId === bp.id}
                        onclick={() => (subInBenchId = subInBenchId === bp.id ? null : bp.id)}
                      >
                        <span class="p-name">{bp.name}</span>
                        <span class="p-role">{bp.role}</span>
                      </button>
                    {/each}
                  </div>
                </div>

                <button
                  type="button"
                  class="confirm-sub-btn"
                  disabled={isMatchOver || subOutIndex === null || !subInBenchId}
                  onclick={performSubstitution}
                >
                  Wechsel jetzt durchführen
                </button>
              {/if}
            </div>
          </div>
        {/if}
      </section>
      </div>

      <div class="col-scouting">
      <!-- Scouting Quick Actions -->
      <section class="actions-section" aria-label="Aktions-Erfassung">
        <div class="section-header">
          <h2 class="section-title">Quick Actions & Scouting</h2>
          {#if isMatchOver}
            <span class="match-locked-tag">Spiel beendet — Aktionen gesperrt</span>
          {:else if selectedPlayer}
            <span class="target-tag">
              Ziel: <strong>{selectedPlayer.player}</strong> (P{selectedPlayer.position})
            </span>
          {:else}
            <span class="target-hint">Tippe auf einen Spieler für Zuordnung</span>
          {/if}
        </div>

        <!-- Schnellfilter für Fokus im Live-Spiel -->
        <div class="action-filter-bar" role="tablist" aria-label="Quick Actions filtern">
          <button
            type="button"
            role="tab"
            class="filter-chip"
            class:active={activeActionFilter === 'all'}
            aria-selected={activeActionFilter === 'all'}
            onclick={() => (activeActionFilter = 'all')}
          >
            Alle
          </button>
          <button
            type="button"
            role="tab"
            class="filter-chip"
            class:active={activeActionFilter === 'us'}
            aria-selected={activeActionFilter === 'us'}
            onclick={() => (activeActionFilter = 'us')}
          >
            Punkt Wir
          </button>
          <button
            type="button"
            role="tab"
            class="filter-chip"
            class:active={activeActionFilter === 'them'}
            aria-selected={activeActionFilter === 'them'}
            onclick={() => (activeActionFilter = 'them')}
          >
            Fehler / Geg.
          </button>
          <button
            type="button"
            role="tab"
            class="filter-chip"
            class:active={activeActionFilter === 'rally'}
            aria-selected={activeActionFilter === 'rally'}
            onclick={() => (activeActionFilter = 'rally')}
          >
            Annahme & Rallye
          </button>
        </div>

        <div class="action-groups-stack">
          {#each visibleActionGroups as grp (grp.id)}
            {@const groupItems = quickActions.filter((a) => a.group === grp.id)}
            <div class="action-group-block">
              <div class="action-group-header">
                <span class="action-group-title">{grp.title}</span>
                <span class="action-group-badge {grp.id}">{grp.badge}</span>
              </div>

              <div class="action-grid">
                {#each groupItems as actionItem (actionItem.id)}
                  {@const variant = getActionVariant(actionItem)}
                  <button
                    type="button"
                    class="action-btn {variant}"
                    disabled={isMatchOver}
                    onclick={() => logAction(actionItem)}
                  >
                    <span class="action-label">{actionItem.label}</span>
                    {#if actionItem.pointFor === 'us'}
                      <span class="action-impact us">
                        +1{servingTeam === 'them' ? ' ↻' : ''}
                      </span>
                    {:else if actionItem.pointFor === 'them'}
                      <span class="action-impact them">+1 </span>
                    {:else if actionItem.passRating !== undefined}
                      <span class="action-impact neutral">R{actionItem.passRating}</span>
                    {:else}
                      <span class="action-impact neutral">Stat</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </section>

      <!-- Event History Log -->
      <section class="history-section" aria-label="Event Verlauf">
        <div class="history-header">
          <h2 class="section-title">
            Spielverlauf <span class="count-pill">{events.length}</span>
          </h2>
          {#if events.length > 0}
            <button type="button" class="clear-btn" onclick={clearEvents}>
              Verlauf leeren
            </button>
          {/if}
        </div>

        {#if events.length === 0}
          <div class="empty-state">
            <p class="empty-text">Noch keine Aktionen erfasst.</p>
            <p class="empty-hint">Wähle einen Spieler auf dem Feld und tippe auf eine Quick Action.</p>
          </div>
        {:else}
          <ul class="event-list">
            {#each events as item (item.id)}
              <li class="event-item quality-{item.quality}">
                <div class="event-main">
                  <div class="event-top">
                    <span class="event-time">{item.timestamp}</span>
                    {#if completedSets.length > 0 || (item.setNumber && item.setNumber > 1)}
                      <span class="event-set">S{item.setNumber ?? 1}</span>
                    {/if}
                    <span class="event-rot">R{item.rotation}</span>
                    {#if item.scoreAfter}
                      <span class="event-score">{item.scoreAfter}</span>
                    {/if}
                    {#if item.isSideout}
                      <span class="event-sideout">Side-out</span>
                    {/if}
                    {#if item.isMatchEnd}
                      <span class="event-matchend">Spielende</span>
                    {/if}
                    {#if item.player}
                      <span class="event-player">
                        {item.player} {item.position ? `(P${item.position})` : ''}
                      </span>
                    {/if}
                  </div>
                  <div class="event-action">
                    {item.action}
                  </div>
                </div>
                <button
                  type="button"
                  class="delete-btn"
                  onclick={() => deleteEvent(item.id)}
                  aria-label="Event löschen"
                  title="Event löschen"
                >
                  ✕
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      </div>
    </div>
  {/if}

  <!-- GLOBALER APP FOOTER (FÜR ALLE INTERFACES) -->
  <footer class="app-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="footer-title">SetPoint</span>
        <span class="footer-dot">•</span>
        <span class="footer-tagline">Volleyball Match & Rotations Tracker</span>
      </div>

      <div class="footer-meta">
        <span class="footer-item">
          Modus:
          {#if step === 'setup'}
            <strong class="footer-hl">Setup</strong>
          {:else if step === 'history'}
            <strong class="footer-hl">Archiv</strong>
          {:else if step === 'legal'}
            <strong class="footer-hl">Rechtliches</strong>
          {:else}
            <strong class="footer-hl">
              Live (Satz {currentSetNumber})
            </strong>
          {/if}
        </span>
        <span class="footer-dot">•</span>
        <button type="button" class="footer-link" onclick={() => openLegalView('privacy')}>
          Privacy Policy
        </button>
        <span class="footer-dot">•</span>
        <button type="button" class="footer-link" onclick={() => openLegalView('terms')}>
          Terms of Service
        </button>
        <span class="footer-dot">•</span>
        <button type="button" class="footer-link" onclick={() => openLegalView('cookies')}>
          Cookie Settings
        </button>
        <span class="footer-dot">•</span>
        <button type="button" class="footer-link" onclick={() => openLegalView('impressum')}>
          Impressum
        </button>
        <span class="footer-dot">•</span>
        <span class="footer-item footer-copy">&copy; 2026 Markus Li</span>
      </div>
    </div>
  </footer>
</main>

<style>
  :global(body) {
    background-color: #f8fafc;
    color: #0f172a;
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }

  .app-container {
    width: 100%;
    max-width: 540px;
    margin: 0 auto;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    background-color: #f8fafc;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.05);
    box-sizing: border-box;
  }

  .app-container.is-history {
    max-width: 1860px;
  }

  .app-container.is-legal {
    max-width: 1200px;
  }

  .setup-content {
    max-width: 1140px;
    width: 100%;
    margin: 0 auto;
    padding: 14px 12px 28px;
    box-sizing: border-box;
    flex: 1;
  }

  .outbox-pill {
    background: #2563eb;
    color: #ffffff;
    font-size: 0.7rem;
    font-weight: 900;
    padding: 2px 8px;
    border-radius: 9999px;
  }

  @media (min-width: 600px) {
    .app-container {
      max-width: 720px;
    }
  }

  /* Rotated iPad (iPad Mini / Air Landscape) & Compact Laptops */
  @media (min-width: 900px), (min-width: 720px) and (orientation: landscape) {
    .app-container {
      max-width: 1440px;
    }

    .setup-content {
      padding: 20px 20px 36px;
    }
  }

  /* Widescreen 16:9 & 16:10 Laptops & Desktops */
  @media (min-width: 1260px) {
    .app-container {
      max-width: 1860px;
    }
  }

  /* --- HEADER --- */
  .app-header {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #ffffff;
    padding: 12px 16px;
    padding-top: calc(12px + env(safe-area-inset-top, 0px));
    /*position: sticky;*/
    top: 0;
    z-index: 50;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1800px;
    margin: 0 auto;
  }

  .logo-area {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .app-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #f8fafc;
  }

  .app-subtitle {
    margin: 0;
    font-size: 0.7rem;
    color: #94a3b8;
  }

  .header-badges {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .end-match-header-btn {
    background: #b91c1c;
    color: #ffffff;
    border: 1px solid #ef4444;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 0.75rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }

  .end-match-header-btn:hover {
    background: #dc2626;
  }

  .reset-btn {
    background: #334155;
    color: #f8fafc;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .badge.setup-tag {
    background-color: #2563eb;
    color: #ffffff;
    font-size: 0.65rem;
    font-weight: 900;
    padding: 3px 8px;
    border-radius: 9999px;
    letter-spacing: 0.08em;
  }

  .badge.live {
    background-color: #ef4444;
    color: #ffffff;
    font-size: 0.65rem;
    font-weight: 900;
    padding: 3px 8px;
    border-radius: 9999px;
    letter-spacing: 0.08em;
    animation: live-pulse 1.8s infinite;
  }

  .badge.ended {
    background-color: #f59e0b;
    color: #0f172a;
    font-size: 0.65rem;
    font-weight: 900;
    padding: 3px 8px;
    border-radius: 9999px;
    letter-spacing: 0.06em;
  }

  @keyframes live-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* --- CONTENT --- */
  .app-content {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: 100%;
    box-sizing: border-box;
  }

  .col-court,
  .col-scouting {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  /* 2-Spalten-Cockpit für gedrehtes iPad (iPad Mini / Air Landscape) & kleinere Laptops */
  @media (min-width: 900px), (min-width: 720px) and (orientation: landscape) {
    .app-content {
      display: grid;
      grid-template-columns: minmax(330px, 450px) minmax(0, 1fr);
      gap: 18px;
      align-items: start;
      padding: 16px 20px;
    }

    .col-court {
      gap: 12px;
    }
  }

  @media (min-width: 900px) and (min-height: 560px),
    (min-width: 720px) and (orientation: landscape) and (min-height: 560px) {
    .col-court {
      position: sticky;
      top: 66px;
    }
  }

  /* 3-Spalten-Widescreen-Cockpit für 16:9 & 16:10 Laptops (ab 1260px Breite) */
  @media (min-width: 1260px) {
    .app-content {
      grid-template-columns: minmax(360px, 1.02fr) minmax(420px, 1.32fr) minmax(290px, 0.86fr);
      gap: 20px;
      padding: 16px 24px;
    }

    .col-scouting {
      display: contents;
    }
  }

  /* Vertikale Platz-Optimierung für Querformat (iPad Landscape, 16:9 & 16:10 Screens) */
  @media (orientation: landscape) and (max-height: 880px) {
    .app-header {
      padding: 8px 20px;
      padding-top: calc(8px + env(safe-area-inset-top, 0px));
    }

    .scoreboard-section {
      padding: 9px 10px;
      gap: 6px;
    }

    .sb-score {
      font-size: 1.9rem;
    }

    .sb-minus-btn,
    .sb-plus-btn {
      min-height: 38px;
    }
  }

  .court-section {
    width: 100%;
  }

  /* --- RESTORED MATCH NOTICE --- */
  .restored-banner {
    grid-column: 1 / -1;
    background: #eff6ff;
    border: 1px solid #93c5fd;
    color: #1e40af;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 0.82rem;
    font-weight: 700;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    box-shadow: 0 2px 5px rgba(37, 99, 235, 0.08);
    box-sizing: border-box;
  }

  .restored-text {
    line-height: 1.4;
  }

  .restored-dismiss {
    background: #dbeafe;
    border: 1px solid #bfdbfe;
    color: #1e40af;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.76rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
    white-space: nowrap;
    transition: background 0.15s ease;
  }

  .restored-dismiss:hover {
    background: #bfdbfe;
  }

  /* --- MATCH OVER BANNER & POST-MATCH SUMMARY --- */
  .match-over-banner {
    grid-column: 1 / -1;
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    color: #f8fafc;
    border: 2px solid #f59e0b;
    border-radius: 14px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 10px 24px -6px rgba(15, 23, 42, 0.35);
    box-sizing: border-box;
  }

  .match-over-banner.won-us {
    background: linear-gradient(135deg, #064e3b 0%, #0f172a 100%);
    border-color: #10b981;
  }

  .match-over-banner.won-them {
    background: linear-gradient(135deg, #4c0519 0%, #0f172a 100%);
    border-color: #f43f5e;
  }

  .mo-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .mo-headline {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .mo-title {
    margin: 0 0 3px;
    font-size: 1.15rem;
    font-weight: 900;
    color: #ffffff;
    line-height: 1.2;
  }

  .mo-reason {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 700;
    color: #cbd5e1;
  }

  .mo-final-score {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .mo-score-nums {
    font-size: 1.85rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    background: rgba(15, 23, 42, 0.65);
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    padding: 4px 14px;
    border-radius: 10px;
    color: #ffffff;
    line-height: 1.1;
  }

  .mo-prev-sets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .mo-set-chip {
    font-size: 0.68rem;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.12);
    color: #cbd5e1;
  }

  .mo-set-chip.current {
    background: #f59e0b;
    color: #0f172a;
  }

  .mo-stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  @media (min-width: 600px) {
    .mo-stats-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  .mo-stat {
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .mo-stat-val {
    font-size: 1.25rem;
    font-weight: 900;
    color: #ffffff;
    font-variant-numeric: tabular-nums;
  }

  .mo-stat-lbl {
    font-size: 0.7rem;
    font-weight: 700;
    color: #cbd5e1;
  }

  .mo-pin-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    background: rgba(15, 23, 42, 0.65);
    border: 1px solid #f59e0b;
    padding: 10px 12px;
    border-radius: 10px;
  }

  .mo-pin-label {
    font-size: 0.78rem;
    font-weight: 800;
    color: #fde68a;
  }

  .mo-pin-input {
    flex: 1;
    min-width: 150px;
    min-height: 38px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid #64748b;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.86rem;
  }

  .mo-save-feedback {
    padding: 9px 12px;
    border-radius: 9px;
    font-size: 0.8rem;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.12);
    color: #f8fafc;
  }

  .mo-save-feedback.ok {
    background: rgba(16, 185, 129, 0.25);
    border: 1px solid #10b981;
    color: #ecfdf5;
  }

  .mo-save-feedback.queued {
    background: rgba(59, 130, 246, 0.25);
    border: 1px solid #60a5fa;
    color: #eff6ff;
  }

  .mo-save-feedback.err {
    background: rgba(239, 68, 68, 0.28);
    border: 1px solid #f87171;
    color: #fef2f2;
  }

  .mo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .mo-btn {
    min-height: 42px;
    padding: 8px 14px;
    border-radius: 9px;
    font-size: 0.82rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
    border: 1px solid transparent;
    box-sizing: border-box;
  }

  .mo-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .mo-btn.save {
    background: #f59e0b;
    color: #0f172a;
  }

  .mo-btn.save:hover:not(:disabled) {
    background: #fbbf24;
  }

  .mo-btn.primary {
    background: #10b981;
    color: #022c22;
  }

  .mo-btn.primary:hover:not(:disabled) {
    background: #34d399;
  }

  .mo-btn.secondary {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
    color: #f8fafc;
  }

  .mo-btn.secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }

  .mo-btn.dark {
    background: #0f172a;
    border-color: #475569;
    color: #e2e8f0;
  }

  .mo-btn.dark:hover:not(:disabled) {
    background: #1e293b;
  }

  /* --- SMART SCOREBOARD --- */
  .scoreboard-section {
    background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%);
    color: #f8fafc;
    border-radius: 14px;
    padding: 12px;
    box-shadow: 0 8px 18px -4px rgba(15, 23, 42, 0.28);
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 2px solid transparent;
    box-sizing: border-box;
  }

  .scoreboard-section.match-over {
    border-color: #f59e0b;
  }

  .sb-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sb-phase-pill {
    font-size: 0.72rem;
    font-weight: 800;
    padding: 4px 9px;
    border-radius: 9999px;
    letter-spacing: 0.02em;
  }

  .sb-phase-pill.serving-us {
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
    border: 1px solid rgba(52, 211, 153, 0.45);
  }

  .sb-phase-pill.serving-them {
    background: rgba(245, 158, 11, 0.2);
    color: #fcd34d;
    border: 1px solid rgba(251, 191, 36, 0.45);
  }

  .sb-phase-pill.match-ended {
    background: rgba(245, 158, 11, 0.25);
    color: #fde68a;
    border: 1px solid #f59e0b;
  }

  .sb-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sb-util-btn {
    min-height: 34px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid #475569;
    background: #334155;
    color: #f1f5f9;
    font-size: 0.74rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
    box-sizing: border-box;
  }

  .sb-util-btn.end-btn {
    background: #991b1b;
    border-color: #ef4444;
    color: #ffffff;
  }

  .sb-util-btn.end-btn:hover:not(:disabled) {
    background: #b91c1c;
  }

  .sb-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sb-sets-strip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
  }

  .sb-set-pill {
    font-size: 0.68rem;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 9999px;
    background: rgba(51, 65, 85, 0.8);
    color: #cbd5e1;
  }

  .sb-set-pill.active {
    background: #2563eb;
    color: #ffffff;
  }

  .sb-crunch-pill {
    font-size: 0.7rem;
    font-weight: 900;
    padding: 3px 9px;
    border-radius: 9999px;
    background: rgba(245, 158, 11, 0.22);
    border: 1px solid #f59e0b;
    color: #fde68a;
  }

  .sb-util-btn:hover:not(:disabled) {
    background: #475569;
  }

  .sb-util-btn:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .sb-board {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: stretch;
    gap: 8px;
  }

  .sb-team {
    background: rgba(15, 23, 42, 0.55);
    border: 2px solid #334155;
    border-radius: 12px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  }

  .sb-team.us.is-serving {
    border-color: #10b981;
    background: rgba(6, 95, 70, 0.28);
    box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.35);
  }

  .sb-team.them.is-serving {
    border-color: #f43f5e;
    background: rgba(136, 19, 55, 0.28);
    box-shadow: 0 0 0 1px rgba(244, 63, 94, 0.35);
  }

  .sb-serve-pill {
    padding: 3px 8px;
    border-radius: 9999px;
    border: 1px solid #475569;
    background: rgba(51, 65, 85, 0.6);
    color: #94a3b8;
    font-size: 0.64rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    cursor: pointer;
    touch-action: manipulation;
    box-sizing: border-box;
  }

  .sb-serve-pill.active {
    background: #10b981;
    border-color: #34d399;
    color: #022c22;
  }

  .sb-serve-pill.them.active {
    background: #f43f5e;
    border-color: #fb7185;
    color: #ffffff;
  }

  .sb-serve-pill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sb-team-name {
    font-size: 0.78rem;
    font-weight: 800;
    color: #cbd5e1;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sb-score {
    font-size: 2.35rem;
    font-weight: 900;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
    color: #ffffff;
    margin: 2px 0;
  }

  .sb-btn-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: 2px;
  }

  .sb-minus-btn {
    min-width: 40px;
    min-height: 44px;
    border-radius: 8px;
    border: 1px solid #475569;
    background: #1e293b;
    color: #cbd5e1;
    font-size: 1.1rem;
    font-weight: 900;
    cursor: pointer;
    touch-action: manipulation;
    box-sizing: border-box;
  }

  .sb-minus-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .sb-plus-btn {
    flex: 1;
    min-height: 44px;
    border-radius: 8px;
    border: none;
    font-size: 0.88rem;
    font-weight: 900;
    cursor: pointer;
    touch-action: manipulation;
    box-sizing: border-box;
  }

  .sb-plus-btn.us {
    background: #10b981;
    color: #022c22;
  }

  .sb-plus-btn.them {
    background: #f43f5e;
    color: #ffffff;
  }

  .sb-plus-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .sb-vs {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 2px;
  }

  .sb-colon {
    font-size: 1.8rem;
    font-weight: 900;
    color: #64748b;
    line-height: 1;
  }

  .sb-rot-chip {
    font-size: 0.72rem;
    font-weight: 900;
    background: #2563eb;
    color: #ffffff;
    padding: 3px 7px;
    border-radius: 6px;
  }

  /* --- SPIELERWECHSEL & BANK --- */
  .sub-section {
    background-color: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
  }

  .sub-header-btn {
    width: 100%;
    min-height: 50px;
    padding: 10px 14px;
    background: #f8fafc;
    border: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    touch-action: manipulation;
    text-align: left;
  }

  .sub-header-left {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sub-title {
    font-size: 0.92rem;
    font-weight: 800;
    color: #0f172a;
  }

  .sub-count-badge {
    font-size: 0.72rem;
    font-weight: 800;
    background: #e2e8f0;
    color: #334155;
    padding: 2px 7px;
    border-radius: 9999px;
  }

  .libero-status-pill {
    font-size: 0.72rem;
    font-weight: 800;
    background: #d1fae5;
    color: #065f46;
    border: 1px solid #6ee7b7;
    padding: 2px 7px;
    border-radius: 9999px;
  }

  .libero-status-pill.paused {
    background: #f1f5f9;
    color: #64748b;
    border-color: #cbd5e1;
  }

  .sub-chevron {
    font-size: 1rem;
    color: #475569;
    font-weight: 900;
  }

  .sub-body {
    padding: 12px 14px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .libero-control-box {
    background: #f0fdf4;
    border: 1px solid #a7f3d0;
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .libero-box-top,
  .sub-box-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sub-group-label {
    font-size: 0.8rem;
    font-weight: 800;
    color: #1e293b;
  }

  .auto-swap-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.75rem;
    font-weight: 700;
    color: #065f46;
    cursor: pointer;
  }

  .auto-swap-toggle input {
    accent-color: #059669;
  }

  .libero-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .libero-choice-btn {
    min-height: 40px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1.5px solid #6ee7b7;
    background: #ffffff;
    color: #065f46;
    font-size: 0.8rem;
    font-weight: 800;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    touch-action: manipulation;
  }

  .libero-choice-btn.active {
    background: #059669;
    border-color: #047857;
    color: #ffffff;
  }

  .active-tag {
    font-size: 0.62rem;
    background: rgba(255, 255, 255, 0.22);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .regular-sub-box {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .reset-subs-link {
    background: none;
    border: none;
    color: #2563eb;
    font-size: 0.73rem;
    font-weight: 700;
    cursor: pointer;
    padding: 2px 4px;
  }

  .no-bench-msg {
    margin: 0;
    font-size: 0.8rem;
    color: #64748b;
    font-style: italic;
  }

  .sub-step {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .step-label {
    font-size: 0.74rem;
    font-weight: 700;
    color: #475569;
  }

  .sub-player-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .sub-choice-btn {
    min-height: 44px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1.5px solid #cbd5e1;
    background: #f8fafc;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    touch-action: manipulation;
    text-align: left;
  }

  .sub-choice-btn.out.selected {
    background: #fef3c7;
    border-color: #d97706;
    color: #78350f;
  }

  .sub-choice-btn.in.selected {
    background: #dbeafe;
    border-color: #2563eb;
    color: #1e3a8a;
  }

  .p-pos {
    font-size: 0.68rem;
    font-weight: 900;
    background: #0f172a;
    color: #ffffff;
    padding: 2px 5px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .p-name {
    font-weight: 800;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p-role {
    font-size: 0.68rem;
    font-weight: 800;
    color: #64748b;
    background: #e2e8f0;
    padding: 1px 5px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .confirm-sub-btn {
    min-height: 48px;
    width: 100%;
    background: #2563eb;
    color: #ffffff;
    border: none;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
  }

  .confirm-sub-btn:disabled {
    background: #cbd5e1;
    color: #64748b;
    cursor: not-allowed;
  }

  /* --- QUICK ACTIONS --- */
  .actions-section {
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
    min-width: 0;
    box-sizing: border-box;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    flex-wrap: wrap;
    gap: 6px;
  }

  .section-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 800;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .target-tag {
    font-size: 0.75rem;
    background-color: #fef3c7;
    color: #92400e;
    border: 1px solid #fde68a;
    padding: 2px 8px;
    border-radius: 6px;
  }

  .match-locked-tag {
    font-size: 0.74rem;
    font-weight: 800;
    background-color: #fef3c7;
    color: #92400e;
    border: 1px solid #f59e0b;
    padding: 3px 9px;
    border-radius: 9999px;
  }

  .target-hint {
    font-size: 0.7rem;
    color: #94a3b8;
    font-style: italic;
  }

  .action-filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }

  .filter-chip {
    min-height: 36px;
    padding: 5px 10px;
    border-radius: 9999px;
    border: 1.5px solid #cbd5e1;
    background: #f8fafc;
    color: #475569;
    font-size: 0.74rem;
    font-weight: 800;
    cursor: pointer;
    touch-action: manipulation;
    box-sizing: border-box;
  }

  .filter-chip.active {
    background: #0f172a;
    border-color: #0f172a;
    color: #ffffff;
  }

  .action-groups-stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .action-group-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .action-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 3px;
    border-bottom: 1px solid #f1f5f9;
  }

  .action-group-title {
    font-size: 0.78rem;
    font-weight: 800;
    color: #334155;
  }

  .action-group-badge {
    font-size: 0.65rem;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 9999px;
  }

  .action-group-badge.us {
    background: #d1fae5;
    color: #065f46;
  }

  .action-group-badge.them {
    background: #fee2e2;
    color: #991b1b;
  }

  .action-group-badge.rally {
    background: #e0f2fe;
    color: #075985;
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  /* Auf Portrait-Tablets (iPad Mini hochkant) und breiten Landscape-Spalten: 3 Spalten */
  @media (min-width: 600px) and (max-width: 899px) and (orientation: portrait),
    (min-width: 1060px) and (max-width: 1259px),
    (min-width: 1520px) {
    .action-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
  }

  .action-btn {
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    border: 2px solid transparent;
    box-sizing: border-box;
    transition: transform 0.1s ease, background-color 0.15s ease, border-color 0.15s ease;
  }

  .action-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .action-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .action-label {
    flex: 1;
    text-align: left;
    line-height: 1.2;
  }

  .action-impact {
    font-size: 0.66rem;
    font-weight: 900;
    padding: 2px 6px;
    border-radius: 9999px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .action-impact.us {
    background: #10b981;
    color: #ffffff;
  }

  .action-impact.them {
    background: #ef4444;
    color: #ffffff;
  }

  .action-impact.neutral {
    background: #cbd5e1;
    color: #334155;
  }

  /* Button Variants */
  .action-btn.positive {
    background-color: #ecfdf5;
    color: #065f46;
    border-color: #a7f3d0;
  }

  .action-btn.positive:hover {
    background-color: #d1fae5;
  }

  .action-btn.negative {
    background-color: #fef2f2;
    color: #991b1b;
    border-color: #fecaca;
  }

  .action-btn.negative:hover {
    background-color: #fee2e2;
  }

  .action-btn.neutral {
    background-color: #f1f5f9;
    color: #334155;
    border-color: #cbd5e1;
  }

  .action-btn.neutral:hover {
    background-color: #e2e8f0;
  }

  .action-btn.rally-good {
    background-color: #f0f9ff;
    color: #075985;
    border-color: #bae6fd;
  }

  .action-btn.rally-good:hover {
    background-color: #e0f2fe;
  }

  .action-btn.rally-warn {
    background-color: #fffbeb;
    color: #92400e;
    border-color: #fde68a;
  }

  .action-btn.rally-warn:hover {
    background-color: #fef3c7;
  }

  /* --- EVENT LOG HISTORY --- */
  .history-section {
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
    min-width: 0;
    box-sizing: border-box;
  }

  @media (min-width: 1260px) {
    .history-section {
      position: sticky;
      top: 66px;
    }
  }

  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .count-pill {
    background-color: #0f172a;
    color: #f8fafc;
    font-size: 0.75rem;
    font-weight: 800;
    padding: 1px 7px;
    border-radius: 9999px;
  }

  .clear-btn {
    background: none;
    border: none;
    color: #ef4444;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .clear-btn:hover {
    background-color: #fee2e2;
  }

  .empty-state {
    text-align: center;
    padding: 24px 12px;
    color: #94a3b8;
  }

  .empty-text {
    font-size: 0.95rem;
    font-weight: 700;
    color: #475569;
    margin: 0 0 4px;
  }

  .empty-hint {
    font-size: 0.75rem;
    margin: 0;
  }

  .event-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 280px;
    overflow-y: auto;
  }

  @media (min-height: 800px) {
    .event-list {
      max-height: 380px;
    }
  }

  @media (min-height: 1000px) {
    .event-list {
      max-height: 480px;
    }
  }

  @media (min-width: 1260px) {
    .event-list {
      max-height: calc(100svh - 170px);
    }
  }

  .event-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-radius: 8px;
    border-left: 4px solid #94a3b8;
    background-color: #f8fafc;
    border-top: 1px solid #f1f5f9;
    border-right: 1px solid #f1f5f9;
    border-bottom: 1px solid #f1f5f9;
  }

  .event-item.quality-good {
    border-left-color: #10b981;
    background-color: #f0fdf4;
  }

  .event-item.quality-bad {
    border-left-color: #ef4444;
    background-color: #fef2f2;
  }

  .event-item.quality-neutral {
    border-left-color: #3b82f6;
    background-color: #eff6ff;
  }

  .event-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .event-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 0.7rem;
    color: #64748b;
  }

  .event-time {
    font-family: monospace;
    font-weight: 600;
  }

  .event-set {
    background-color: #334155;
    color: #ffffff;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.65rem;
  }

  .event-rot {
    background-color: #0f172a;
    color: #ffffff;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.65rem;
  }

  .event-score {
    background-color: #dbeafe;
    color: #1e40af;
    font-weight: 900;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
  }

  .event-sideout {
    background-color: #fef3c7;
    color: #92400e;
    border: 1px solid #fde68a;
    font-weight: 800;
    padding: 0 5px;
    border-radius: 4px;
    font-size: 0.64rem;
  }

  .event-matchend {
    background-color: #f59e0b;
    color: #0f172a;
    font-weight: 900;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.65rem;
  }

  .event-player {
    font-weight: 800;
    color: #1e293b;
    background-color: #e2e8f0;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .event-action {
    font-size: 0.9rem;
    font-weight: 700;
    color: #0f172a;
  }

  .delete-btn {
    min-width: 32px;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .delete-btn:hover {
    color: #ef4444;
    background-color: #fee2e2;
  }

  /* --- GLOBAL APP FOOTER --- */
  .app-footer {
    width: 100%;
    margin-top: auto;
    background: #0f172a;
    border-top: 1px solid #1e293b;
    color: #94a3b8;
    padding: 14px 16px;
    padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    box-sizing: border-box;
    z-index: 40;
  }

  .footer-inner {
    max-width: 1800px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    text-align: center;
    font-size: 0.76rem;
  }

  .footer-brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .footer-title {
    font-weight: 800;
    font-size: 0.88rem;
    color: #f8fafc;
    letter-spacing: -0.01em;
  }

  .footer-tagline {
    color: #94a3b8;
    font-weight: 500;
  }

  .footer-meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
    color: #64748b;
    font-size: 0.72rem;
  }

  .footer-dot {
    color: #334155;
    font-size: 0.8rem;
  }

  .footer-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .footer-hl {
    color: #38bdf8;
    font-weight: 700;
  }

  .footer-copy {
    color: #475569;
  }

  .footer-link {
    background: none;
    border: none;
    padding: 0;
    color: #94a3b8;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: #475569;
    font-family: inherit;
    touch-action: manipulation;
    transition: color 0.15s ease, text-decoration-color 0.15s ease;
  }

  .footer-link:hover {
    color: #38bdf8;
    text-decoration-color: #38bdf8;
  }

  @media (min-width: 768px) {
    .footer-inner {
      flex-direction: row;
      text-align: left;
    }

    .footer-brand {
      justify-content: flex-start;
    }

    .footer-meta {
      justify-content: flex-end;
    }
  }
</style>
