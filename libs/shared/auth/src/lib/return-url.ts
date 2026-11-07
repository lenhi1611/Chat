const ORIGIN = 'http://return-url.invalid';

/**
 * A returnUrl is only followed when it is a path of this app: it must start
 * with a single "/" and resolve to this origin. Anything else (absolute URLs,
 * `//evil.com`, `/\evil.com`, `javascript:`…) falls back, so a crafted login
 * link cannot send the user to another site (open redirect).
 */
export function safeReturnUrl(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !value.startsWith('/') || /^\/[/\\]/.test(value)) {
    return fallback;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, ORIGIN);
    if (url.origin !== ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
