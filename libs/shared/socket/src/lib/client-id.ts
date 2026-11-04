export const CLIENT_ID_STORAGE_KEY = 'realtime-chat.clientId';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns the anonymous client id, creating and persisting it on first use.
 *
 * Stored in localStorage so the identity (and therefore the nickname and
 * "my messages") survives reloads and reconnects. Every storage access is
 * guarded: when storage is unavailable or throws (private mode, quota, blocked
 * cookies) a fresh id is used for the lifetime of the page.
 */
export function loadOrCreateClientId(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  createId: () => string = () => crypto.randomUUID(),
): string {
  try {
    const stored = storage?.getItem(CLIENT_ID_STORAGE_KEY);
    if (stored && UUID_PATTERN.test(stored)) return stored;
  } catch {
    // fall through to a new id
  }

  const clientId = createId();
  try {
    storage?.setItem(CLIENT_ID_STORAGE_KEY, clientId);
  } catch {
    // keep the in-memory id
  }
  return clientId;
}
