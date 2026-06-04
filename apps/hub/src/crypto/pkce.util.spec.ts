import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateOpaqueToken,
} from './pkce.util';
import { createHash } from 'crypto';

describe('pkce.util', () => {
  it('generates a valid S256 code challenge from verifier', () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64url');

    expect(challenge).toBe(expected);
    expect(verifier.length).toBeGreaterThan(40);
  });

  it('generates unique opaque tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
  });
});
