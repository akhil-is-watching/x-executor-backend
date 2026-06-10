import { ConfigService } from '@nestjs/config';
import { InvitesService } from './invites.service';
import { InviteDocument } from '../schemas/invite.schema';

describe('InvitesService', () => {
  describe('validation helpers', () => {
    const service = Object.create(InvitesService.prototype) as InvitesService;

  const baseInvite = {
    expiresAt: new Date(Date.now() + 60_000),
    maxUses: 2,
    useCount: 0,
    revokedAt: undefined,
  } as InviteDocument;

  it('detects expired invites', () => {
    const expired = {
      ...baseInvite,
      expiresAt: new Date(Date.now() - 1),
    } as InviteDocument;
    expect(service.isExpired(expired)).toBe(true);
    expect(service.isExpired(baseInvite)).toBe(false);
  });

  it('detects max uses reached', () => {
    const atLimit = { ...baseInvite, useCount: 2 } as InviteDocument;
    expect(service.isMaxUsesReached(atLimit)).toBe(true);
    expect(service.isMaxUsesReached(baseInvite)).toBe(false);
  });
  });

  describe('buildInviteUrl', () => {
    function serviceWithConfig(config: Record<string, string | undefined>) {
      const instance = Object.create(InvitesService.prototype) as InvitesService;
      (instance as unknown as { config: ConfigService }).config = {
        get: (key: string) => config[key],
      } as ConfigService;
      return instance;
    }

    it('uses frontend origin from OAUTH_SUCCESS_REDIRECT_URL', () => {
      const service = serviceWithConfig({
        OAUTH_SUCCESS_REDIRECT_URL: 'https://app.example.com/oauth/success',
      });
      expect(
        (service as unknown as { buildInviteUrl: (t: string) => string }).buildInviteUrl(
          'tok-1',
        ),
      ).toBe('https://app.example.com/connect/tok-1');
    });

    it('falls back to FRONTEND_PUBLIC_BASE_URL', () => {
      const service = serviceWithConfig({
        FRONTEND_PUBLIC_BASE_URL: 'https://staging.example.com/',
      });
      expect(
        (service as unknown as { buildInviteUrl: (t: string) => string }).buildInviteUrl(
          'tok-2',
        ),
      ).toBe('https://staging.example.com/connect/tok-2');
    });
  });
});
