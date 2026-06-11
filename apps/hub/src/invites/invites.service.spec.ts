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
        getOrThrow: (key: string) => {
          const value = config[key];
          if (!value) {
            throw new Error(key);
          }
          return value;
        },
      } as ConfigService;
      return instance;
    }

    it('builds Hub OAuth start URL', () => {
      const service = serviceWithConfig({
        HUB_PUBLIC_BASE_URL: 'https://hub.example.com/',
      });
      expect(
        (service as unknown as { buildInviteUrl: (t: string) => string }).buildInviteUrl(
          'tok-1',
        ),
      ).toBe(
        'https://hub.example.com/xbot/v1/api/hub/oauth/x/start?invite=tok-1',
      );
    });
  });
});
