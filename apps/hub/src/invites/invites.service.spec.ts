import { InvitesService } from './invites.service';
import { InviteDocument } from '../schemas/invite.schema';

describe('InvitesService validation helpers', () => {
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
