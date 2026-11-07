import { Injectable } from '@nestjs/common';
import { argon2id, hash as argon2Hash, verify as argon2Verify } from 'argon2';

/**
 * argon2id password hashing (library defaults: 64 MiB, 3 passes, 4 lanes).
 * The encoded hash stores its own salt and parameters.
 */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2Hash(password, { type: argon2id });
  }

  verify(encoded: string, password: string): Promise<boolean> {
    return argon2Verify(encoded, password);
  }

  /**
   * Burns the same time as a real verification, for logins with an unknown
   * email: the response time must not reveal which emails have an account.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy password, never matches');
    await argon2Verify(await this.dummyHash, password);
    return false;
  }
}
