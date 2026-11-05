import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes with argon2id and a random salt, never storing the password', async () => {
    const [a, b] = await Promise.all([
      passwords.hash('correct horse battery'),
      passwords.hash('correct horse battery'),
    ]);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('correct horse battery');
  });

  it('verifies the right password only', async () => {
    const hash = await passwords.hash('s3cret-pass');
    await expect(passwords.verify(hash, 's3cret-pass')).resolves.toBe(true);
    await expect(passwords.verify(hash, 's3cret-Pass')).resolves.toBe(false);
  });

  it('runs a real verification for unknown accounts, and always fails', async () => {
    await expect(passwords.verifyAgainstDummy('anything')).resolves.toBe(false);
    await expect(
      passwords.verifyAgainstDummy('dummy password, never matches'),
    ).resolves.toBe(false);
  });
});
