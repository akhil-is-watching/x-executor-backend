import { ConfigService } from '@nestjs/config';
import { TokenCryptoService } from './token-crypto.service';
import { randomBytes } from 'crypto';

describe('TokenCryptoService', () => {
  const key = randomBytes(32).toString('base64');

  const service = new TokenCryptoService({
    getOrThrow: (name: string) => {
      if (name === 'TOKEN_ENCRYPTION_KEY') {
        return key;
      }
      throw new Error(`unexpected config key ${name}`);
    },
  } as ConfigService);

  it('encrypts and decrypts tokens', () => {
    const plaintext = 'access-token-value';
    const encrypted = service.encrypt(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(service.decrypt(encrypted)).toBe(plaintext);
  });
});
