import type { SavedMatchSummary, VolleyballMatchPayload } from './types';

const OUTBOX_STORAGE_KEY = 'volleyball_outbox_v1';
const API_KEY_STORAGE_KEY = 'volleyball_api_key_v1';

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
 * Strips frontend-only undo snapshots before uploading to keep payload compact.
 */
function sanitizePayloadForUpload(payload: VolleyballMatchPayload): VolleyballMatchPayload {
  return {
    ...payload,
    events: payload.events.map(({ scoreSnapshot: _snap, ...rest }) => rest)
  };
}

export async function uploadMatch(
  payload: VolleyballMatchPayload,
  apiKey?: string
): Promise<{ matchId: string; syncedEvents: number }> {
  const cleanPayload = sanitizePayloadForUpload(payload);
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
  // Remove from offline outbox if it was previously queued
  removeOfflineMatch(payload.matchId);
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

// --- OFFLINE OUTBOX (localStorage) ---

export function getOfflineOutbox(): VolleyballMatchPayload[] {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineMatch(payload: VolleyballMatchPayload): void {
  try {
    const clean = sanitizePayloadForUpload(payload);
    const current = getOfflineOutbox().filter((m) => m.matchId !== clean.matchId);
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify([clean, ...current]));
  } catch {
    // Ignore storage quota errors
  }
}

export function removeOfflineMatch(matchId: string): void {
  try {
    const remaining = getOfflineOutbox().filter((m) => m.matchId !== matchId);
    if (remaining.length === 0) {
      localStorage.removeItem(OUTBOX_STORAGE_KEY);
    } else {
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(remaining));
    }
  } catch {
    // Ignore
  }
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
