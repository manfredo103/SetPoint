import type { SavedMatchSummary, TeamPreset, VolleyballMatchPayload } from './types';

export const OUTBOX_STORAGE_KEY = 'volleyball_outbox_v1';
export const LOCAL_ARCHIVE_STORAGE_KEY = 'volleyball_local_archive_v1';
export const API_KEY_STORAGE_KEY = 'volleyball_api_key_v1';
export const TEAM_PRESETS_STORAGE_KEY = 'volleyball_team_presets_v1';
export const CUSTOM_FORMATIONS_STORAGE_KEY = 'volleyball_custom_formations_v1';
export const ACTIVE_MATCH_STORAGE_KEY = 'setpoint_active_match';

// Optional VITE_API_BASE_URL for separate domain hosting; defaults to '' (relative /api/... via Vite proxy or Go static server)
const API_BASE = ((import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export class ApiUnauthorizedError extends Error {
  constructor(message = 'API-PIN erforderlich oder ungültig') {
    super(message);
    this.name = 'ApiUnauthorizedError';
  }
}

export class ApiNetworkError extends Error {
  constructor(message = 'Server nicht erreichbar') {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

export function getStoredApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setStoredApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in private browsing
  }
}

function buildHeaders(apiKey?: string, includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  const effectiveKey = (apiKey ?? getStoredApiKey()).trim();
  if (effectiveKey) {
    headers['X-API-Key'] = effectiveKey;
  }
  return headers;
}

/**
 * Strips frontend-only undo snapshots before uploading or archiving to keep payload compact.
 */
export function sanitizePayloadForStorage(payload: VolleyballMatchPayload): VolleyballMatchPayload {
  return {
    ...payload,
    events: payload.events.map(({ scoreSnapshot: _snap, undoSnapshot: _undo, ...rest }) => rest)
  };
}

export async function uploadMatch(
  payload: VolleyballMatchPayload,
  apiKey?: string
): Promise<{ matchId: string; syncedEvents: number }> {
  const cleanPayload = sanitizePayloadForStorage(payload);
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/api/volleyball/matches`, {
      method: 'POST',
      headers: buildHeaders(apiKey, true),
      body: JSON.stringify(cleanPayload)
    });
  } catch {
    throw new ApiNetworkError('Keine Verbindung zum Go-Server.');
  }

  if (resp.status === 401) {
    throw new ApiUnauthorizedError('Team-PIN / API-Key erforderlich oder ungültig.');
  }

  if (!resp.ok) {
    let errText = `Server-Fehler (${resp.status})`;
    try {
      const data = await resp.json();
      if (data?.error) errText = data.error;
    } catch {
      // Fallback to status text
    }
    throw new Error(errText);
  }

  const result = await resp.json();
  // Remove from offline outbox if it was previously queued and mark local archive copy synced
  removeOfflineMatch(payload.matchId);
  saveMatchToLocalArchive({ ...cleanPayload, syncState: 'synced' });
  return {
    matchId: result.matchId ?? payload.matchId,
    syncedEvents: result.syncedEvents ?? payload.events.length
  };
}

export async function fetchSavedMatches(apiKey?: string): Promise<SavedMatchSummary[]> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/api/volleyball/matches`, {
      method: 'GET',
      headers: buildHeaders(apiKey, false)
    });
  } catch {
    throw new ApiNetworkError('Keine Verbindung zum Go-Server.');
  }

  if (!resp.ok) {
    let errText = `Fehler beim Laden (${resp.status})`;
    try {
      const data = await resp.json();
      if (data?.error) errText = data.error;
    } catch {
      // ignore
    }
    throw new Error(errText);
  }

  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchSavedMatchById(
  matchId: string,
  apiKey?: string
): Promise<VolleyballMatchPayload> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/api/volleyball/matches/${encodeURIComponent(matchId)}`, {
      method: 'GET',
      headers: buildHeaders(apiKey, false)
    });
  } catch {
    throw new ApiNetworkError('Keine Verbindung zum Go-Server.');
  }

  if (!resp.ok) {
    let errText = `Spiel konnte nicht geladen werden (${resp.status})`;
    try {
      const data = await resp.json();
      if (data?.error) errText = data.error;
    } catch {
      // ignore
    }
    throw new Error(errText);
  }

  return (await resp.json()) as VolleyballMatchPayload;
}

// --- OFFLINE OUTBOX & LOCAL ARCHIVE (localStorage) ---

function readPayloadList(storageKey: string): VolleyballMatchPayload[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePayloadList(storageKey: string, items: VolleyballMatchPayload[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(items));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getOfflineOutbox(): VolleyballMatchPayload[] {
  return readPayloadList(OUTBOX_STORAGE_KEY);
}

export function enqueueOfflineMatch(payload: VolleyballMatchPayload): void {
  const clean = sanitizePayloadForStorage({
    ...payload,
    savedLocallyAt: payload.savedLocallyAt ?? new Date().toISOString(),
    syncState: 'local'
  });
  const current = getOfflineOutbox().filter((m) => m.matchId !== clean.matchId);
  writePayloadList(OUTBOX_STORAGE_KEY, [clean, ...current]);
  saveMatchToLocalArchive(clean);
}

export function removeOfflineMatch(matchId: string): void {
  const remaining = getOfflineOutbox().filter((m) => m.matchId !== matchId);
  writePayloadList(OUTBOX_STORAGE_KEY, remaining);
}

export function getLocalArchive(): VolleyballMatchPayload[] {
  return readPayloadList(LOCAL_ARCHIVE_STORAGE_KEY);
}

export function saveMatchToLocalArchive(payload: VolleyballMatchPayload): void {
  const clean = sanitizePayloadForStorage({
    ...payload,
    savedLocallyAt: payload.savedLocallyAt ?? new Date().toISOString(),
    syncState: payload.syncState ?? 'local'
  });
  const current = getLocalArchive().filter((m) => m.matchId !== clean.matchId);
  writePayloadList(LOCAL_ARCHIVE_STORAGE_KEY, [clean, ...current]);
}

export function removeLocalArchiveMatch(matchId: string): void {
  const remaining = getLocalArchive().filter((m) => m.matchId !== matchId);
  writePayloadList(LOCAL_ARCHIVE_STORAGE_KEY, remaining);
}

export async function syncOfflineOutbox(apiKey?: string): Promise<{ synced: number; failed: number }> {
  const queue = getOfflineOutbox();
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await uploadMatch(item, apiKey);
      synced += 1;
    } catch (err) {
      if (err instanceof ApiUnauthorizedError) {
        throw err;
      }
      failed += 1;
    }
  }

  return { synced, failed };
}

// --- TEAM PRESETS (localStorage) ---

export function getTeamPresets(): TeamPreset[] {
  try {
    const raw = localStorage.getItem(TEAM_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTeamPreset(preset: TeamPreset): TeamPreset[] {
  const current = getTeamPresets().filter((p) => p.id !== preset.id);
  const next = [preset, ...current];
  try {
    localStorage.setItem(TEAM_PRESETS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors
  }
  return next;
}

export function deleteTeamPreset(presetId: string): TeamPreset[] {
  const next = getTeamPresets().filter((p) => p.id !== presetId);
  try {
    if (next.length === 0) {
      localStorage.removeItem(TEAM_PRESETS_STORAGE_KEY);
    } else {
      localStorage.setItem(TEAM_PRESETS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore
  }
  return next;
}

// --- STORAGE DIAGNOSTICS & CLEANUP ---

export function getLocalStorageStats(): {
  matchesCount: number;
  outboxCount: number;
  presetsCount: number;
  hasApiKey: boolean;
} {
  return {
    matchesCount: getLocalArchive().length,
    outboxCount: getOfflineOutbox().length,
    presetsCount: getTeamPresets().length,
    hasApiKey: Boolean(getStoredApiKey().trim())
  };
}

export function clearAllAppStorage(): void {
  localStorage.removeItem(OUTBOX_STORAGE_KEY);
  localStorage.removeItem(LOCAL_ARCHIVE_STORAGE_KEY);
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(TEAM_PRESETS_STORAGE_KEY);
  localStorage.removeItem(CUSTOM_FORMATIONS_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
  // Clean up legacy keys if present
  localStorage.removeItem('volleyball_offline_matches');
  localStorage.removeItem('VOLLEYBALL_API_KEY');
  localStorage.removeItem('volleyball_custom_formations');
  localStorage.removeItem('activeMatch');
}
