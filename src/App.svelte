<script lang="ts">
  import SetupForm from './lib/SetupForm.svelte';
  import Court from './lib/Court.svelte';
  import MatchHistory from './lib/MatchHistory.svelte';
  import LegalPage from './lib/LegalPage.svelte';
  import LiveCoachPanel from './lib/LiveCoachPanel.svelte';
  import BetweenSetModal from './lib/BetweenSetModal.svelte';
  import { generateId, formatEventTime } from './lib/id';
  import { computeMatchAnalytics } from './lib/analytics';
  import { buildCoachShareText } from './lib/export';
  import {
    applyRallyPointState,
    checkSetWin,
    checkSubstitutionRule,
    computeSetsStanding,
    determineMatchWinner,
    formatPlayerDisplay,
    getCurrentPosForIndex,
    getSetsToWin,
    getSetTargetPoints,
    MAX_SUBSTITUTIONS_PER_SET,
    MAX_TIMEOUTS_PER_SET
  } from './lib/matchEngine';
  import {
    ACTIVE_MATCH_STORAGE_KEY,
    uploadMatch,
    enqueueOfflineMatch,
    saveMatchToLocalArchive,
    getOfflineOutbox,
    getStoredApiKey,
    setStoredApiKey,
    ApiUnauthorizedError
  } from './lib/api';
  import type {
    PlayerSelection,
    VolleyballEvent,
    EventCategory,
    EventQuality,
    MatchSetup,
    MatchFormat,
    MatchUndoSnapshot,
    SubstitutionPair,
    FormationMode,
    PlayerSetup,
    BenchPlayer,
    RotationPosition,
    CompletedSet,
    VolleyballMatchPayload,
    MatchWinner,
    LegalTab
  } from './lib/types';

  interface ActiveMatchSnapshot {
    step: 'setup' | 'tracker' | 'history' | 'legal';
    returnStepFromHistory: 'setup' | 'tracker';
    returnStepFromLegal: 'setup' | 'tracker' | 'history';
    matchData: MatchSetup;
    matchId: string;
    matchStartedAt: string;
    matchFormat?: MatchFormat;
    myScore: number;
    opponentScore: number;
    servingTeam: 'us' | 'them';
    setInitialServe?: 'us' | 'them';
    completedSets: CompletedSet[];
    currentRotation: RotationPosition;
    opponentRotation?: RotationPosition;
    formationMode: FormationMode;
    courtPlayers: PlayerSetup[];
    startingSixSnapshot?: PlayerSetup[];
    benchPlayers: BenchPlayer[];
    activeLiberoId: string | null;
    liberoAutoSwap: boolean;
    liberoCanServe?: boolean;
    substitutionCount: number;
    subPairs?: SubstitutionPair[];
    timeoutsUs?: number;
    timeoutsThem?: number;
    events: VolleyballEvent[];
    opponentLineup: string[];
    setEndedManually?: boolean;
    matchEndedManually: boolean;
    continuePast25: boolean;
    autoClearAfterPoint?: boolean;
    courtFlipped?: boolean;
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
  let startingSixSnapshot = $state<PlayerSetup[]>(
    initialSavedMatch?.startingSixSnapshot ?? initialSavedMatch?.courtPlayers ?? []
  );
  let benchPlayers = $state<BenchPlayer[]>(initialSavedMatch?.benchPlayers ?? []);
  let activeLiberoId = $state<string | null>(initialSavedMatch?.activeLiberoId ?? null);
  let liberoAutoSwap = $state(initialSavedMatch?.liberoAutoSwap ?? true);
  let liberoCanServe = $state(initialSavedMatch?.liberoCanServe ?? false);
  let substitutionCount = $state(initialSavedMatch?.substitutionCount ?? 0);
  let subPairs = $state<SubstitutionPair[]>(initialSavedMatch?.subPairs ?? []);
  let subWarning = $state<string | null>(null);
  let showSubPanel = $state(false);
  let subOutIndex = $state<number | null>(null);
  let subInBenchId = $state<string | null>(null);

  // Smart Scoreboard, Serve, Timeouts & Ergonomics States
  let myScore = $state(initialSavedMatch?.myScore ?? 0);
  let opponentScore = $state(initialSavedMatch?.opponentScore ?? 0);
  let servingTeam = $state<'us' | 'them'>(initialSavedMatch?.servingTeam ?? 'us');
  let setInitialServe = $state<'us' | 'them'>(
    initialSavedMatch?.setInitialServe ?? initialSavedMatch?.matchData?.initialServe ?? 'us'
  );
  let timeoutsUs = $state(initialSavedMatch?.timeoutsUs ?? 0);
  let timeoutsThem = $state(initialSavedMatch?.timeoutsThem ?? 0);

  // Set/Match End & Format States
  let setEndedManually = $state(initialSavedMatch?.setEndedManually ?? false);
  let matchEndedManually = $state(initialSavedMatch?.matchEndedManually ?? false);
  let continuePastTarget = $state(initialSavedMatch?.continuePast25 ?? false);
  let completedSets = $state<CompletedSet[]>(initialSavedMatch?.completedSets ?? []);
  let showBetweenSetModal = $state(false);
  let copyShareFeedback = $state<string | null>(null);

  // Rotation, Court & Scouting Ergonomics
  let currentRotation = $state<number>(initialSavedMatch?.currentRotation ?? 1);
  let opponentRotation = $state<number>(initialSavedMatch?.opponentRotation ?? 1);
  let formationMode = $state<FormationMode>(initialSavedMatch?.formationMode ?? 'base');
  let courtFlipped = $state(initialSavedMatch?.courtFlipped ?? false);
  let autoClearAfterPoint = $state(initialSavedMatch?.autoClearAfterPoint ?? true);
  let wakeLockEnabled = $state(true);
  let wakeLockActive = $state(false);
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
      matchFormat: matchData.matchFormat ?? 'bo5',
      myScore,
      opponentScore,
      servingTeam,
      setInitialServe,
      completedSets,
      currentRotation: currentRotation as RotationPosition,
      opponentRotation: opponentRotation as RotationPosition,
      formationMode,
      courtPlayers,
      startingSixSnapshot,
      benchPlayers,
      activeLiberoId,
      liberoAutoSwap,
      liberoCanServe,
      substitutionCount,
      subPairs,
      timeoutsUs,
      timeoutsThem,
      events,
      opponentLineup,
      setEndedManually,
      matchEndedManually,
      continuePast25: continuePastTarget,
      autoClearAfterPoint,
      courtFlipped,
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
    const _track = [
      step,
      returnStepFromHistory,
      returnStepFromLegal,
      myScore,
      opponentScore,
      servingTeam,
      setInitialServe,
      currentRotation,
      opponentRotation,
      formationMode,
      substitutionCount,
      subPairs,
      timeoutsUs,
      timeoutsThem,
      activeLiberoId,
      liberoAutoSwap,
      liberoCanServe,
      setEndedManually,
      matchEndedManually,
      continuePastTarget,
      autoClearAfterPoint,
      courtFlipped,
      saveStatus,
      saveMessage,
      completedSets,
      events,
      courtPlayers,
      benchPlayers,
      opponentLineup
    ];
    if (matchData) {
      persistActiveMatch();
    }
  });

  // Screen Wake Lock für die Bank (Display bleibt im Live-Tracker aktiv)
  $effect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (step !== 'tracker' || !wakeLockEnabled) {
      wakeLockActive = false;
      return;
    }

    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return;

    let sentinel: { release: () => Promise<void> } | null = null;
    let disposed = false;

    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible') return;
      try {
        sentinel = await nav.wakeLock!.request('screen');
        wakeLockActive = !disposed;
      } catch {
        wakeLockActive = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      wakeLockActive = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      sentinel?.release().catch(() => {});
    };
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

  // Derived Libero & Bench lists
  const registeredLiberos = $derived(benchPlayers.filter((b) => b.isLibero));
  const regularBenchPlayers = $derived(benchPlayers.filter((b) => !b.isLibero));
  const activeLibero = $derived(
    registeredLiberos.find((l) => l.id === activeLiberoId) ?? registeredLiberos[0] ?? null
  );
  const effectiveLiberoName = $derived(
    liberoAutoSwap && activeLibero
      ? activeLibero.number
        ? `#${activeLibero.number} ${activeLibero.name}`
        : activeLibero.name
      : null
  );
  const canUndoAction = $derived(
    events.length > 0 && Boolean(events[0]?.undoSnapshot || events[0]?.scoreSnapshot)
  );

  // Satz- & Spielende-Erkennung nach offiziellem Regelwerk (25 Pkt / Satz 5 bzw. Bo3-Satz 3 bis 15 Pkt + 2 Vorsprung)
  const matchFormat = $derived<MatchFormat>(matchData?.matchFormat ?? 'bo5');
  const currentSetNumber = $derived(completedSets.length + 1);
  const currentSetTarget = $derived(getSetTargetPoints(currentSetNumber, matchFormat));
  const setsToWinMatch = $derived(getSetsToWin(matchFormat));

  const rulebookSetWinner = $derived(checkSetWin(myScore, opponentScore, currentSetTarget));
  const isRulebookSetOver = $derived(rulebookSetWinner !== null && !continuePastTarget);
  const isSetOver = $derived(isRulebookSetOver || setEndedManually);

  const allMatchSets = $derived.by<CompletedSet[]>(() => {
    if (myScore > 0 || opponentScore > 0 || completedSets.length === 0) {
      return [...completedSets, { setNumber: currentSetNumber, myScore, opponentScore }];
    }
    return [...completedSets];
  });

  const setsStanding = $derived(computeSetsStanding(allMatchSets));

  const isMatchDecidedBySets = $derived(
    setsToWinMatch !== null &&
      isSetOver &&
      (setsStanding.us >= setsToWinMatch || setsStanding.them >= setsToWinMatch)
  );
  const isMatchOver = $derived(matchEndedManually || isMatchDecidedBySets);
  const isPlayLocked = $derived(isSetOver || isMatchOver);

  const matchWinner = $derived.by<MatchWinner | null>(() => {
    if (!isMatchOver && !isSetOver) return null;
    return determineMatchWinner(allMatchSets, myScore, opponentScore);
  });

  // Live-Hinweis bei Satz-/Matchball oder Verlängerung (ab target - 1)
  const crunchTimeHint = $derived.by<string | null>(() => {
    if (isPlayLocked || continuePastTarget) return null;
    const deciderThreshold = currentSetTarget - 1;
    if (myScore >= deciderThreshold && opponentScore >= deciderThreshold && myScore === opponentScore) {
      return `Verlängerung (${myScore}:${opponentScore}) • +2 Vorsprung nötig`;
    }
    if (myScore >= deciderThreshold && myScore - opponentScore >= 1) {
      return `Satzball ${matchData?.teamName ?? 'Wir'}!`;
    }
    if (opponentScore >= deciderThreshold && opponentScore - myScore >= 1) {
      return `Satzball ${matchData?.opponentName ?? 'Gegner'}`;
    }
    return null;
  });

  // Einheitliche Analytics für Spielende-Übersicht
  const matchAnalytics = $derived(
    computeMatchAnalytics(events, {
      setFilter: 'all',
      initialServe: matchData?.initialServe ?? 'us'
    })
  );

  function handleStartMatch(data: MatchSetup) {
    matchData = data;
    matchId = generateId('match');
    matchStartedAt = new Date().toISOString();
    saveStatus = 'idle';
    saveMessage = null;
    copyShareFeedback = null;
    showApiPinPrompt = false;
    outboxCount = getOfflineOutbox().length;
    myScore = 0;
    opponentScore = 0;
    servingTeam = data.initialServe ?? 'us';
    setInitialServe = data.initialServe ?? 'us';
    timeoutsUs = 0;
    timeoutsThem = 0;
    setEndedManually = false;
    matchEndedManually = false;
    continuePastTarget = false;
    completedSets = [];
    currentRotation = data.startingRotation ?? 1;
    opponentRotation = 1;
    opponentLineup = data.opponentLineup ? [...data.opponentLineup] : ['#1', '#2', '#3', '#4', '#5', '#6'];
    events = [];
    selectedPlayer = null;
    substitutionCount = 0;
    subPairs = [];
    subWarning = null;
    subOutIndex = null;
    subInBenchId = null;

    const initialStarters = (data.players ?? []).map((p, idx) => ({
      id: p.id ?? `starter-${idx + 1}`,
      position: (idx + 1) as RotationPosition,
      number: p.number,
      name: p.name,
      role: p.role
    }));
    courtPlayers = initialStarters;
    startingSixSnapshot = initialStarters.map((p) => ({ ...p }));

    benchPlayers = (data.bench ?? []).map((b) => ({ ...b }));
    const firstLibero = benchPlayers.find((b) => b.isLibero);
    activeLiberoId = firstLibero ? firstLibero.id : null;
    liberoAutoSwap = Boolean(firstLibero);
    liberoCanServe = false;
    courtFlipped = false;

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
      matchFormat,
      initialServe: matchData?.initialServe,
      winner: matchWinner ?? 'tie',
      endReason: isRulebookSetOver && !matchEndedManually ? 'rulebook' : 'manual',
      sets: allMatchSets,
      players: startingSixSnapshot.length === 6 ? startingSixSnapshot : courtPlayers,
      bench: benchPlayers,
      opponentLineup,
      timeoutsUs,
      timeoutsThem,
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
      saveMessage = `Spiel (${allMatchSets.length} ${allMatchSets.length === 1 ? 'Satz' : 'Sätze'}, ${res.syncedEvents} Events) in InfluxDB & lokal gespeichert!`;
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        saveMatchToLocalArchive({ ...payload, syncState: 'local' });
        saveStatus = 'error';
        showApiPinPrompt = true;
        saveMessage = 'Lokal gesichert, aber Team-PIN für Server-Upload ungültig/erforderlich.';
      } else {
        enqueueOfflineMatch(payload);
        outboxCount = getOfflineOutbox().length;
        saveStatus = 'queued';
        saveMessage =
          'Offline / ohne Server: Spiel sicher auf diesem Gerät im Archiv gespeichert.';
      }
    }
  }

  async function handleShareQuickSummary() {
    if (!matchData) return;
    const text = buildCoachShareText(buildMatchPayload());
    try {
      await navigator.clipboard.writeText(text);
      copyShareFeedback = 'WhatsApp-Summary kopiert!';
    } catch {
      copyShareFeedback = 'Kopieren nicht möglich — Archiv → Export nutzen.';
    }
    setTimeout(() => (copyShareFeedback = null), 3000);
  }

  function handleReset() {
    if (confirm("Möchtest du das aktuelle Spiel beenden und ein neues Setup starten?")) {
      clearActiveMatchStorage();
      step = 'setup';
      matchData = null;
      courtPlayers = [];
      startingSixSnapshot = [];
      benchPlayers = [];
      activeLiberoId = null;
      events = [];
      completedSets = [];
      myScore = 0;
      opponentScore = 0;
      currentRotation = 1;
      opponentRotation = 1;
      timeoutsUs = 0;
      timeoutsThem = 0;
      substitutionCount = 0;
      subPairs = [];
      subWarning = null;
      setEndedManually = false;
      matchEndedManually = false;
      continuePastTarget = false;
      saveStatus = 'idle';
      saveMessage = null;
      copyShareFeedback = null;
      restoredMatchNotice = false;
    }
  }

  function getCourtPlayerLabelAtPos(pos: RotationPosition, rot: number) {
    const playerIndex = (pos - rot + 6) % 6;
    const item = courtPlayers[playerIndex];
    const roleStr = (item?.role ?? '').toUpperCase();
    let player = item?.name
      ? formatPlayerDisplay(item)
      : `#${playerIndex + 1}`;
    let playerNum = item?.number?.trim() || undefined;

    const isBackRow = pos === 1 || pos === 5 || pos === 6;
    const liberoAllowedOnPos = isBackRow && (pos !== 1 || servingTeam === 'them' || liberoCanServe);
    const isMB = roleStr === 'MB1' || roleStr === 'MB2';
    if (liberoAllowedOnPos && isMB && activeLibero) {
      player = formatPlayerDisplay({
        name: activeLibero.name,
        number: activeLibero.number,
        role: 'L'
      });
      playerNum = activeLibero.number?.trim() || undefined;
    }

    return { player, playerNum, playerIndex };
  }

  function syncSelectionState(rot: number = currentRotation) {
    if (!selectedPlayer) return;
    if (selectedPlayer.team === 'myTeam') {
      const { player, playerNum, playerIndex } = getCourtPlayerLabelAtPos(selectedPlayer.position, rot);
      selectedPlayer = {
        ...selectedPlayer,
        player,
        playerNum,
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

  function createUndoSnapshot(): MatchUndoSnapshot {
    return {
      myScore,
      opponentScore,
      servingTeam,
      rotation: currentRotation as RotationPosition,
      opponentRotation: opponentRotation as RotationPosition,
      courtPlayers: courtPlayers.map((p) => ({ ...p })),
      benchPlayers: benchPlayers.map((b) => ({ ...b })),
      substitutionCount,
      subPairs: subPairs.map((sp) => ({ ...sp })),
      activeLiberoId,
      liberoAutoSwap,
      timeoutsUs,
      timeoutsThem,
      setEndedManually,
      matchEndedManually,
      continuePastTarget
    };
  }

  function restoreUndoSnapshot(snap: MatchUndoSnapshot) {
    myScore = snap.myScore;
    opponentScore = snap.opponentScore;
    servingTeam = snap.servingTeam;
    currentRotation = snap.rotation;
    opponentRotation = snap.opponentRotation;
    courtPlayers = snap.courtPlayers.map((p) => ({ ...p }));
    benchPlayers = snap.benchPlayers.map((b) => ({ ...b }));
    substitutionCount = snap.substitutionCount;
    subPairs = snap.subPairs.map((sp) => ({ ...sp }));
    activeLiberoId = snap.activeLiberoId;
    liberoAutoSwap = snap.liberoAutoSwap;
    timeoutsUs = snap.timeoutsUs;
    timeoutsThem = snap.timeoutsThem;
    setEndedManually = snap.setEndedManually;
    matchEndedManually = snap.matchEndedManually;
    continuePastTarget = snap.continuePastTarget;
    subWarning = null;
    syncSelectionState(snap.rotation);
  }

  // Zentrale Side-out & Punkt-Logik für beide Teams
  function addPoint(winningTeam: 'us' | 'them'): boolean {
    const next = applyRallyPointState(
      {
        myScore,
        opponentScore,
        servingTeam,
        currentRotation: currentRotation as RotationPosition,
        opponentRotation: opponentRotation as RotationPosition
      },
      winningTeam
    );
    myScore = next.myScore;
    opponentScore = next.opponentScore;
    servingTeam = next.servingTeam;
    currentRotation = next.currentRotation;
    opponentRotation = next.opponentRotation;
    syncSelectionState(next.currentRotation);
    return next.didSideout;
  }

  function setServingTeamManual(team: 'us' | 'them') {
    if (isPlayLocked || servingTeam === team) return;
    servingTeam = team;
    syncSelectionState(currentRotation);
  }

  function adjustScoreManual(team: 'us' | 'them', delta: -1) {
    if (team === 'us') {
      myScore = Math.max(0, myScore + delta);
    } else {
      opponentScore = Math.max(0, opponentScore + delta);
    }
    if (checkSetWin(myScore, opponentScore, currentSetTarget) === null) {
      continuePastTarget = false;
    }
  }

  function logManualPoint(winningTeam: 'us' | 'them') {
    if (isPlayLocked) return;
    const id = generateId('pt');
    const timestamp = formatEventTime();
    const undoSnap = createUndoSnapshot();
    const eventRotation = currentRotation as RotationPosition;
    const prevServe = servingTeam;

    const didSideout = addPoint(winningTeam);
    const reachedRulebookEnd = !continuePastTarget && checkSetWin(myScore, opponentScore, currentSetTarget) !== null;
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
      wasServing: prevServe,
      scoreAfter: `${myScore}:${opponentScore}`,
      isSideout: didSideout || undefined,
      isMatchEnd: reachedRulebookEnd || undefined,
      undoSnapshot: undoSnap
    };

    saveStatus = 'idle';
    events = [newEvent, ...events];
    if (autoClearAfterPoint) {
      selectedPlayer = null;
      subOutIndex = null;
    }
  }

  function undoLastEvent() {
    if (!canUndoAction) return;
    const [latest, ...rest] = events;
    if (latest.undoSnapshot) {
      restoreUndoSnapshot(latest.undoSnapshot);
    } else if (latest.scoreSnapshot) {
      if (latest.actionId === 'manual_end') {
        matchEndedManually = false;
      }
      myScore = latest.scoreSnapshot.myScore;
      opponentScore = latest.scoreSnapshot.opponentScore;
      servingTeam = latest.scoreSnapshot.servingTeam;
      currentRotation = latest.scoreSnapshot.rotation;
      syncSelectionState(latest.scoreSnapshot.rotation);
    }
    if (checkSetWin(myScore, opponentScore, currentSetTarget) === null) {
      continuePastTarget = false;
    }
    saveStatus = 'idle';
    saveMessage = null;
    events = rest;
  }

  function callTimeout(team: 'us' | 'them') {
    if (isPlayLocked) return;
    if (team === 'us' && timeoutsUs >= MAX_TIMEOUTS_PER_SET) return;
    if (team === 'them' && timeoutsThem >= MAX_TIMEOUTS_PER_SET) return;

    const undoSnap = createUndoSnapshot();
    if (team === 'us') {
      timeoutsUs += 1;
    } else {
      timeoutsThem += 1;
    }

    const label =
      team === 'us'
        ? `Auszeit ${matchData?.teamName ?? 'Mein Team'} (${timeoutsUs}/${MAX_TIMEOUTS_PER_SET})`
        : `Auszeit ${matchData?.opponentName ?? 'Gegner'} (${timeoutsThem}/${MAX_TIMEOUTS_PER_SET})`;

    events = [
      {
        id: generateId('to'),
        timestamp: formatEventTime(),
        isoTimestamp: new Date().toISOString(),
        setNumber: currentSetNumber,
        category: 'timeout',
        quality: 'neutral',
        action: label,
        rotation: currentRotation as RotationPosition,
        team: team === 'us' ? 'myTeam' : 'opponent',
        wasServing: servingTeam,
        scoreAfter: `${myScore}:${opponentScore}`,
        undoSnapshot: undoSnap
      },
      ...events
    ];
  }

  function addQuickNote(noteText: string) {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    const undoSnap = createUndoSnapshot();
    events = [
      {
        id: generateId('note'),
        timestamp: formatEventTime(),
        isoTimestamp: new Date().toISOString(),
        setNumber: currentSetNumber,
        category: 'note',
        quality: 'neutral',
        action: `Notiz: ${trimmed}`,
        note: trimmed,
        rotation: currentRotation as RotationPosition,
        wasServing: servingTeam,
        undoSnapshot: undoSnap
      },
      ...events
    ];
  }

  function handleManualEndMatch(skipConfirm = false) {
    if (isMatchOver) return;
    if (
      !skipConfirm &&
      !confirm(`Spiel beim Stand von ${myScore}:${opponentScore} komplett beenden und zum Speichern freigeben?`)
    ) {
      return;
    }

    const undoSnap = createUndoSnapshot();
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
      undoSnapshot: undoSnap
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
    setEndedManually = false;
    if (checkSetWin(myScore, opponentScore, currentSetTarget) !== null) {
      continuePastTarget = true;
    }
    saveStatus = 'idle';
    saveMessage = null;
  }

  function restoreStartingSixToCourt() {
    if (startingSixSnapshot.length !== 6) return;
    const starterIds = new Set(startingSixSnapshot.map((s) => s.id).filter(Boolean));
    const currentPool: BenchPlayer[] = [];
    for (const cp of courtPlayers) {
      if (cp.id && !starterIds.has(cp.id)) {
        currentPool.push({
          id: cp.id,
          number: cp.number,
          name: cp.name,
          role: cp.role,
          isLibero: false
        });
      }
    }
    for (const bp of benchPlayers) {
      if (bp.isLibero || !starterIds.has(bp.id)) {
        currentPool.push({ ...bp });
      }
    }
    courtPlayers = startingSixSnapshot.map((s) => ({ ...s }));
    benchPlayers = currentPool;
  }

  function confirmStartNewSet(opts: {
    startingRotation: RotationPosition;
    opponentRotation: RotationPosition;
    servingTeam: 'us' | 'them';
    restoreStartingLineup: boolean;
    flipCourt: boolean;
  }) {
    showBetweenSetModal = false;
    if (myScore > 0 || opponentScore > 0) {
      completedSets = [
        ...completedSets,
        { setNumber: completedSets.length + 1, myScore, opponentScore }
      ];
    }
    myScore = 0;
    opponentScore = 0;
    timeoutsUs = 0;
    timeoutsThem = 0;
    setEndedManually = false;
    matchEndedManually = false;
    continuePastTarget = false;
    saveStatus = 'idle';
    saveMessage = null;
    substitutionCount = 0;
    subPairs = [];
    subWarning = null;
    subOutIndex = null;
    subInBenchId = null;

    if (opts.restoreStartingLineup) {
      restoreStartingSixToCourt();
    }
    if (opts.flipCourt) {
      courtFlipped = !courtFlipped;
    }

    currentRotation = opts.startingRotation;
    opponentRotation = opts.opponentRotation;
    servingTeam = opts.servingTeam;
    setInitialServe = opts.servingTeam;
    syncSelectionState(opts.startingRotation);

    const nextSetNum = completedSets.length + 1;
    events = [
      {
        id: generateId('set'),
        timestamp: formatEventTime(),
        isoTimestamp: new Date().toISOString(),
        setNumber: nextSetNum,
        category: 'note',
        quality: 'neutral',
        action: `Satz ${nextSetNum} gestartet (0:0 • R${opts.startingRotation})`,
        rotation: opts.startingRotation
      },
      ...events
    ];
  }

  function handleNewSet() {
    showBetweenSetModal = true;
  }

  function performSubstitution() {
    if (isPlayLocked || subOutIndex === null || !subInBenchId) return;
    const outgoing = courtPlayers[subOutIndex];
    const incomingBenchIdx = benchPlayers.findIndex(
      (b) => b.id === subInBenchId && !b.isLibero
    );
    if (!outgoing || incomingBenchIdx === -1) return;

    const incoming = benchPlayers[incomingBenchIdx];
    const ruleCheck = checkSubstitutionRule({
      outgoing,
      incoming,
      substitutionCount,
      subPairs,
      courtPlayers,
      benchPlayers
    });
    subWarning = ruleCheck.warning ?? null;

    const undoSnap = createUndoSnapshot();
    const currentPos = getCurrentPosForIndex(subOutIndex, currentRotation);
    const row: 'front' | 'back' =
      currentPos === 2 || currentPos === 3 || currentPos === 4 ? 'front' : 'back';

    courtPlayers[subOutIndex] = {
      id: incoming.id,
      position: outgoing.position,
      number: incoming.number,
      name: incoming.name,
      role: incoming.role
    };

    benchPlayers[incomingBenchIdx] = {
      id: outgoing.id ?? generateId('player'),
      number: outgoing.number,
      name: outgoing.name,
      role: outgoing.role,
      isLibero: false
    };

    substitutionCount += 1;

    // Record FIVB pair if neither id is already paired
    const outId = outgoing.id ?? '';
    const inId = incoming.id;
    const alreadyPaired = subPairs.some(
      (p) =>
        p.starterId === outId ||
        p.subId === outId ||
        p.starterId === inId ||
        p.subId === inId
    );
    if (!alreadyPaired && outId && inId) {
      subPairs = [...subPairs, { starterId: outId, subId: inId }];
    }

    if (selectedPlayer && selectedPlayer.team === 'myTeam' && selectedPlayer.playerIndex === subOutIndex) {
      selectedPlayer = {
        ...selectedPlayer,
        player: formatPlayerDisplay(incoming),
        playerNum: incoming.number?.trim() || undefined
      };
    }

    events = [
      {
        id: generateId('sub'),
        timestamp: formatEventTime(),
        isoTimestamp: new Date().toISOString(),
        setNumber: currentSetNumber,
        category: 'substitution',
        quality: 'neutral',
        action: `Wechsel (${substitutionCount}/${MAX_SUBSTITUTIONS_PER_SET}): ${formatPlayerDisplay(incoming)} rein für ${formatPlayerDisplay(outgoing)}`,
        rotation: currentRotation as RotationPosition,
        player: formatPlayerDisplay(incoming),
        playerNum: incoming.number?.trim() || undefined,
        position: currentPos,
        row,
        team: 'myTeam',
        undoSnapshot: undoSnap
      },
      ...events
    ];

    subInBenchId = null;
  }

  function switchActiveLibero(libero: BenchPlayer) {
    if (activeLibero?.id === libero.id && liberoAutoSwap) return;
    const undoSnap = createUndoSnapshot();
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
        action: `Libero aktiv: ${formatPlayerDisplay({ ...libero, role: 'L' })}`,
        rotation: currentRotation as RotationPosition,
        player: formatPlayerDisplay({ ...libero, role: 'L' }),
        playerNum: libero.number?.trim() || undefined,
        team: 'myTeam',
        undoSnapshot: undoSnap
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
    if (isPlayLocked) return;
    const id = generateId('act');
    const timestamp = formatEventTime();
    const undoSnap = createUndoSnapshot();
    const eventRotation = currentRotation as RotationPosition;
    const prevServe = servingTeam;

    // Cross-team attribution guard: never attribute an "own win" event to an opponent selection
    const selectedIsMismatch =
      selectedPlayer?.team === 'opponent' && actionItem.group === 'us';
    const effectiveSelection = selectedIsMismatch ? null : selectedPlayer;

    const eventPlayer = effectiveSelection ? effectiveSelection.player : undefined;
    const eventPlayerNum = effectiveSelection ? effectiveSelection.playerNum : undefined;
    const eventPosition = effectiveSelection ? effectiveSelection.position : undefined;
    const eventRow = effectiveSelection ? effectiveSelection.row : undefined;
    const eventTeam = effectiveSelection ? effectiveSelection.team : 'myTeam';

    let didSideout = false;
    if (actionItem.pointFor) {
      didSideout = addPoint(actionItem.pointFor);
    }

    const reachedRulebookEnd = Boolean(
      actionItem.pointFor &&
        !continuePastTarget &&
        checkSetWin(myScore, opponentScore, currentSetTarget) !== null
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
      playerNum: eventPlayerNum,
      position: eventPosition,
      row: eventRow,
      team: eventTeam,
      wasServing: prevServe,
      passRating: actionItem.passRating,
      scoreAfter: actionItem.pointFor ? `${myScore}:${opponentScore}` : undefined,
      isSideout: didSideout || undefined,
      isMatchEnd: reachedRulebookEnd || undefined,
      undoSnapshot: undoSnap
    };

    saveStatus = 'idle';
    events = [newEvent, ...events];

    if (autoClearAfterPoint && actionItem.pointFor) {
      selectedPlayer = null;
      subOutIndex = null;
    }
  }

  function deleteEvent(id: string) {
    if (events[0]?.id === id && (events[0].scoreAfter || events[0].category === 'timeout' || events[0].category === 'substitution') && (events[0].undoSnapshot || events[0].scoreSnapshot)) {
      undoLastEvent();
      return;
    }
    events = events.filter((e) => e.id !== id);
  }

  function clearEvents() {
    if (confirm("Möchtest du wirklich alle geloggten Events löschen?")) {
      events = [];
    }
  }

  // Tastatur-Shortcuts für Co-Trainer mit Laptop auf der Bank
  $effect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (step !== 'tracker' || showBetweenSetModal) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'z' && canUndoAction) {
        e.preventDefault();
        undoLastEvent();
      } else if (key === 'b') {
        e.preventDefault();
        formationMode = 'base';
      } else if (key === 'r') {
        e.preventDefault();
        formationMode = 'receive';
      } else if (key === 'escape') {
        selectedPlayer = null;
        subOutIndex = null;
      } else if (!isPlayLocked && key === 'q') {
        e.preventDefault();
        logManualPoint('us');
      } else if (!isPlayLocked && key === 'w') {
        e.preventDefault();
        logManualPoint('them');
      } else if (['1', '2', '3', '4', '5', '6'].includes(key)) {
        const pos = Number(key) as RotationPosition;
        const { player, playerNum, playerIndex } = getCourtPlayerLabelAtPos(pos, currentRotation);
        const row: 'front' | 'back' = pos === 2 || pos === 3 || pos === 4 ? 'front' : 'back';
        handleSelectPlayer({
          team: 'myTeam',
          position: pos,
          player,
          playerNum,
          playerIndex,
          rotation: currentRotation,
          row,
          isServer: pos === 1 && servingTeam === 'us'
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
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
          <button
            type="button"
            class="wakelock-btn"
            class:active={wakeLockActive}
            onclick={() => (wakeLockEnabled = !wakeLockEnabled)}
            title="Bildschirm während des Spiels wach halten (Wake Lock)"
          >
            {wakeLockEnabled ? (wakeLockActive ? 'Display: Wach' : 'Display: Standby') : 'Display: Auto'}
          </button>
          {#if !isMatchOver}
            <button
              type="button"
              onclick={() => handleManualEndMatch()}
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
      <!-- AUTOMATISCHE & MANUELLE SPIELENDE- / SATZENDE-ANZEIGE -->
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
                  {#if isRulebookSetOver && !matchEndedManually}
                    Automatisch entschieden ({matchFormat === 'bo5' ? 'Best of 5' : matchFormat === 'bo3' ? 'Best of 3' : 'Frei'} • Satz bis {currentSetTarget} / +2)
                  {:else}
                    Manuell beendet
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
              <span class="mo-stat-val">
                {matchAnalytics.sideoutPct !== null ? `${matchAnalytics.sideoutPct}%` : '–'}
              </span>
              <span class="mo-stat-lbl">Side-out ({matchAnalytics.sideoutWon}/{matchAnalytics.sideoutTotal})</span>
            </div>
            <div class="mo-stat">
              <span class="mo-stat-val">{matchAnalytics.kills}</span>
              <span class="mo-stat-lbl">Kills · {matchAnalytics.aces} Asse</span>
            </div>
            <div class="mo-stat">
              <span class="mo-stat-val">{matchAnalytics.blocks}</span>
              <span class="mo-stat-lbl">Kill Blocks</span>
            </div>
            <div class="mo-stat">
              <span class="mo-stat-val">{matchAnalytics.passAvgFormatted}</span>
              <span class="mo-stat-lbl">Ø Annahme ({matchAnalytics.passCount})</span>
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

          {#if saveMessage || copyShareFeedback}
            <div
              class="mo-save-feedback"
              class:ok={saveStatus === 'saved' || Boolean(copyShareFeedback)}
              class:queued={saveStatus === 'queued'}
              class:err={saveStatus === 'error'}
            >
              {copyShareFeedback ?? saveMessage}
            </div>
          {/if}

          <div class="mo-actions">
            <button
              type="button"
              class="mo-btn save"
              onclick={handleSaveMatch}
              disabled={saveStatus === 'saving'}
              title="Komplettes Spiel im lokalen Geräte-Archiv und (wenn aktiv) in InfluxDB speichern"
            >
              {#if saveStatus === 'saving'}
                Speichere…
              {:else if saveStatus === 'saved'}
                Gespeichert (Erneut sichern)
              {:else if saveStatus === 'queued'}
                Lokal gesichert (Sync testen)
              {:else}
                Spiel speichern
              {/if}
            </button>
            <button
              type="button"
              class="mo-btn primary"
              onclick={handleShareQuickSummary}
              title="Kompakte Team-Statistik für WhatsApp/Signal kopieren"
            >
              WhatsApp Summary
            </button>
            <button
              type="button"
              class="mo-btn secondary"
              onclick={handleNewSet}
              title="Diesen Satz abschließen und noch einen weiteren Satz starten"
            >
              + Weiterer Satz
            </button>
            <button
              type="button"
              class="mo-btn secondary"
              onclick={undoLastEvent}
              disabled={!canUndoAction}
              title="Letzten Punkt bzw. Spielende rückgängig machen"
            >
              Undo
            </button>
            <button
              type="button"
              class="mo-btn secondary"
              onclick={handleResumeMatch}
              title="Aktuellen Satz ohne Punktesperre weiterspielen"
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
      {:else if isSetOver}
        <section
          class="match-over-banner set-over-banner"
          class:won-us={rulebookSetWinner === 'us'}
          class:won-them={rulebookSetWinner === 'them'}
          aria-live="polite"
        >
          <div class="mo-top">
            <div class="mo-headline">
              <div>
                <h2 class="mo-title">
                  Satz {currentSetNumber} beendet —
                  {myScore > opponentScore
                    ? `${matchData.teamName} gewinnt (${myScore}:${opponentScore})`
                    : `${matchData.opponentName} gewinnt (${myScore}:${opponentScore})`}
                </h2>
                <span class="mo-reason">
                  Satzstand: {setsStanding.us}:{setsStanding.them}
                  {setsToWinMatch ? ` • Ziel: ${setsToWinMatch} Gewinnsätze` : ' • Freies Spiel'}
                </span>
              </div>
            </div>
            <div class="mo-final-score">
              <span class="mo-score-nums">Sätze {setsStanding.us} : {setsStanding.them}</span>
            </div>
          </div>

          <div class="mo-actions">
            <button
              type="button"
              class="mo-btn save"
              onclick={handleNewSet}
              title="Satz {currentSetNumber} abschließen und Satz {currentSetNumber + 1} starten"
            >
              Satz {currentSetNumber + 1} starten →
            </button>
            <button
              type="button"
              class="mo-btn secondary"
              onclick={undoLastEvent}
              disabled={!canUndoAction}
            >
              Undo letzter Punkt
            </button>
            <button
              type="button"
              class="mo-btn secondary"
              onclick={handleResumeMatch}
            >
              Satz weiterspielen
            </button>
            <button
              type="button"
              class="mo-btn dark"
              onclick={() => handleManualEndMatch(true)}
            >
              Spiel jetzt beenden & speichern
            </button>
          </div>
        </section>
      {/if}

      <div class="col-court">
      <!-- SMART SCOREBOARD & IMPLIZITES SIDE-OUT TRACKING -->
      <section
        class="scoreboard-section"
        class:match-over={isPlayLocked}
        aria-label="Smart Scoreboard"
      >
        <div class="sb-toolbar">
          {#if isMatchOver}
            <span class="sb-phase-pill match-ended">Spiel beendet ({setsStanding.us}:{setsStanding.them})</span>
          {:else if isSetOver}
            <span class="sb-phase-pill match-ended">Satz {currentSetNumber} beendet ({myScore}:{opponentScore})</span>
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
              disabled={!canUndoAction}
              title="Letzte Aktion (Punkt/Auszeit/Wechsel) rückgängig machen"
            >
              Undo
            </button>
            <button
              type="button"
              class="sb-util-btn"
              onclick={handleNewSet}
              title="Nächsten Satz vorbereiten / starten"
            >
              Satz +{currentSetNumber + 1}
            </button>
            <button
              type="button"
              class="sb-util-btn end-btn"
              onclick={() => handleManualEndMatch()}
              disabled={isMatchOver}
              title="Spiel manuell komplett beenden"
            >
              Ende
            </button>
          </div>
        </div>

        <div class="sb-meta-row">
          <div class="sb-sets-strip">
            {#each completedSets as s (s.setNumber)}
              <span class="sb-set-pill">S{s.setNumber} {s.myScore}:{s.opponentScore}</span>
            {/each}
            <span class="sb-set-pill active">
              Satz {currentSetNumber} (Ziel {currentSetTarget})
            </span>
          </div>
          {#if crunchTimeHint}
            <span class="sb-crunch-pill">{crunchTimeHint}</span>
          {/if}
        </div>

        <div class="sb-board">
          <!-- UNSER TEAM -->
          <div class="sb-team us" class:is-serving={servingTeam === 'us' && !isPlayLocked}>
            <div class="sb-team-top-row">
              <button
                type="button"
                class="sb-serve-pill"
                class:active={servingTeam === 'us'}
                disabled={isPlayLocked}
                onclick={() => setServingTeamManual('us')}
                title="Aufschlagrecht manuell auf eigenes Team setzen"
              >
                {servingTeam === 'us' ? 'AUFSCHLAG' : 'Aufschlag'}
              </button>
              <button
                type="button"
                class="sb-to-btn"
                disabled={isPlayLocked || timeoutsUs >= MAX_TIMEOUTS_PER_SET}
                onclick={() => callTimeout('us')}
                title="Auszeit für eigenes Team protokollieren"
              >
                AZ {timeoutsUs}/{MAX_TIMEOUTS_PER_SET}
              </button>
            </div>
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
                disabled={isPlayLocked}
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
          <div class="sb-team them" class:is-serving={servingTeam === 'them' && !isPlayLocked}>
            <div class="sb-team-top-row">
              <button
                type="button"
                class="sb-serve-pill them"
                class:active={servingTeam === 'them'}
                disabled={isPlayLocked}
                onclick={() => setServingTeamManual('them')}
                title="Aufschlagrecht manuell auf Gegner setzen"
              >
                {servingTeam === 'them' ? 'AUFSCHLAG' : 'Aufschlag'}
              </button>
              <button
                type="button"
                class="sb-to-btn"
                disabled={isPlayLocked || timeoutsThem >= MAX_TIMEOUTS_PER_SET}
                onclick={() => callTimeout('them')}
                title="Auszeit für Gegner protokollieren"
              >
                AZ {timeoutsThem}/{MAX_TIMEOUTS_PER_SET}
              </button>
            </div>
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
                disabled={isPlayLocked}
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
          bind:opponentRotation
          bind:selectedPlayer
          bind:formationMode
          bind:courtFlipped
          servingTeam={servingTeam}
          myTeamName={matchData.teamName}
          opponentName={matchData.opponentName}
          system={matchData.system}
          myTeamLineup={courtPlayers}
          bind:opponentLineup
          activeLiberoName={effectiveLiberoName}
          liberoCanServe={liberoCanServe}
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
            <span class="sub-count-badge">Wechsel: {substitutionCount}/{MAX_SUBSTITUTIONS_PER_SET}</span>
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
                  <div class="libero-toggles">
                    <label class="auto-swap-toggle">
                      <input type="checkbox" bind:checked={liberoAutoSwap} />
                      <span>Auto-Wechsel für MB</span>
                    </label>
                    <label class="auto-swap-toggle">
                      <input type="checkbox" bind:checked={liberoCanServe} />
                      <span>Libero darf aufschlagen</span>
                    </label>
                  </div>
                </div>

                <div class="libero-pills">
                  {#each registeredLiberos as lib (lib.id)}
                    <button
                      type="button"
                      class="libero-choice-btn"
                      class:active={activeLibero?.id === lib.id && liberoAutoSwap}
                      onclick={() => switchActiveLibero(lib)}
                    >
                      {formatPlayerDisplay({ ...lib, role: 'L' })}
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
                    onclick={() => {
                      substitutionCount = 0;
                      subPairs = [];
                      subWarning = null;
                    }}
                    title="Wechselzähler für neuen Satz zurücksetzen"
                  >
                    Zähler zurücksetzen (0/{MAX_SUBSTITUTIONS_PER_SET})
                  </button>
                {/if}
              </div>

              {#if subWarning}
                <div class="sub-warning-box" role="alert">
                  {subWarning}
                </div>
              {/if}

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
                        <span class="p-name">{cp.number ? `#${cp.number} ` : ''}{cp.name}</span>
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
                        <span class="p-name">{bp.number ? `#${bp.number} ` : ''}{bp.name}</span>
                        <span class="p-role">{bp.role}</span>
                      </button>
                    {/each}
                  </div>
                </div>

                <button
                  type="button"
                  class="confirm-sub-btn"
                  disabled={isPlayLocked || subOutIndex === null || !subInBenchId}
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
      <LiveCoachPanel
        events={events}
        currentSetNumber={currentSetNumber}
        currentRotation={currentRotation as RotationPosition}
        initialServe={setInitialServe}
        isMatchOver={isPlayLocked}
        onAddNote={addQuickNote}
      />

      <!-- Scouting Quick Actions -->
      <section class="actions-section" aria-label="Aktions-Erfassung">
        <div class="section-header">
          <div class="sh-left">
            <h2 class="section-title">Quick Actions & Scouting</h2>
            <label class="auto-clear-toggle" title="Spielerauswahl nach jedem Punkt automatisch aufheben">
              <input type="checkbox" bind:checked={autoClearAfterPoint} />
              <span>Nach Punkt abwählen</span>
            </label>
          </div>
          {#if isPlayLocked}
            <span class="match-locked-tag">Satz/Spiel beendet — gesperrt</span>
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
                    disabled={isPlayLocked}
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
        <p class="shortcut-hint">
          Tastatur: Q = +1 Wir · W = +1 Gegner · Z = Undo · 1–6 = Pos wählen · B/R = Formation
        </p>
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

    <BetweenSetModal
      open={showBetweenSetModal}
      nextSetNumber={myScore > 0 || opponentScore > 0 ? completedSets.length + 2 : completedSets.length + 1}
      targetPoints={getSetTargetPoints(myScore > 0 || opponentScore > 0 ? completedSets.length + 2 : completedSets.length + 1, matchFormat)}
      teamName={matchData.teamName}
      opponentName={matchData.opponentName}
      defaultServe={setInitialServe === 'us' ? 'them' : 'us'}
      defaultRotation={(matchData.startingRotation ?? 1) as RotationPosition}
      hasSubstitutions={substitutionCount > 0}
      onCancel={() => (showBetweenSetModal = false)}
      onConfirm={confirmStartNewSet}
    />
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

  .wakelock-btn {
    border: 1px solid #334155;
    background: #1e293b;
    color: #94a3b8;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.72rem;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.12s;
    touch-action: manipulation;
  }

  .wakelock-btn.active {
    background: #064e3b;
    border-color: #10b981;
    color: #a7f3d0;
  }

  .set-over-banner {
    border-width: 2px;
  }

  .sb-team-top-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .sb-to-btn {
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    color: #334155;
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 0.68rem;
    font-weight: 800;
    cursor: pointer;
    transition: background 0.12s;
    touch-action: manipulation;
  }

  .sb-to-btn:hover:not(:disabled) {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
  }

  .sb-to-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .libero-toggles {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .sub-warning-box {
    margin: 6px 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: #fffbeb;
    border: 1px solid #fcd34d;
    color: #92400e;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .sh-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .auto-clear-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 700;
    color: #475569;
    cursor: pointer;
  }

  .shortcut-hint {
    display: none;
    margin: 8px 0 0;
    font-size: 0.7rem;
    color: #94a3b8;
    font-weight: 600;
  }

  @media (min-width: 900px) {
    .shortcut-hint {
      display: block;
    }
  }
</style>
