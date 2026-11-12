let fallbackCounter = 0;

/**
 * Generates a unique ID in both Secure Contexts (HTTPS / localhost)
 * and non-secure LAN HTTP contexts (e.g. http://192.168.x.x on iOS Safari & Android Chrome),
 * where `crypto.randomUUID()` is undefined and would otherwise throw a TypeError.
 */
export function generateId(prefix = 'evt'): string {
  try {
    if (typeof globalThis.crypto !== 'undefined') {
      if (typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
      }
      if (typeof globalThis.crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
    }
  } catch {
    // Fall through to deterministic + random fallback
  }

  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Formats the current local time as HH:MM:SS safely across all mobile browsers.
 */
export function formatEventTime(date: Date = new Date()): string {
  try {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
}
