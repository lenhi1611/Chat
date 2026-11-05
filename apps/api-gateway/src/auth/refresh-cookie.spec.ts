import { REFRESH_COOKIE } from '@realtime-chat/contracts';
import { refreshCookieOptions } from './refresh-cookie';

describe('refreshCookieOptions', () => {
  it('is httpOnly, SameSite=Strict and scoped to /api/auth', () => {
    expect(refreshCookieOptions(false)).toEqual({
      httpOnly: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE.path,
      secure: false,
    });
  });

  it('adds Secure when COOKIE_SECURE=true', () => {
    expect(refreshCookieOptions(true).secure).toBe(true);
  });
});
