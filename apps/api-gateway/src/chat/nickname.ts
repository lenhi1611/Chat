/**
 * Display name derived from the anonymous client id, stable across reconnects
 * and page reloads (the browser keeps its clientId in localStorage).
 * Four hex digits: collisions are possible and acceptable for phase 1.
 */
export function nicknameFor(clientId: string): string {
  return `guest-${clientId.replace(/-/g, '').slice(0, 4).toLowerCase()}`;
}
