import {
  parseActivitySubscriptionId,
  type XActivitySubscriptionCreateResponse,
} from './x-activity.types';

describe('parseActivitySubscriptionId', () => {
  it('reads subscription_id from create response', () => {
    const response: XActivitySubscriptionCreateResponse = {
      data: {
        subscription: {
          subscription_id: 'sub-123',
          event_type: 'dm.received',
          filter: { user_id: '3012852462', direction: 'inbound' },
        },
      },
    };

    expect(parseActivitySubscriptionId(response)).toBe('sub-123');
  });

  it('returns null when subscription is missing', () => {
    expect(parseActivitySubscriptionId({})).toBeNull();
  });
});
