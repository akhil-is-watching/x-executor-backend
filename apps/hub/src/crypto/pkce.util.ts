import { createHash, randomBytes } from 'crypto';

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateStateId(): string {
  return randomBytes(16).toString('hex');
}
