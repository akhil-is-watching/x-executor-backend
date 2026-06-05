import {
  parseActivitySubscriptionId,
  type XActivitySubscriptionCreateResponse,
} from './x-activity.types';

describe('parseActivitySubscriptionId', () => {
  it('reads subscription_id from nested create response', () => {
    const response: XActivitySubscriptionCreateResponse = {
      data: {
        subscription: {
          subscription_id: 'sub-123',
          event_type: 'dm.received',
          filter: { user_id: '3012852462' },
        },
      },
    };

    expect(parseActivitySubscriptionId(response)).toBe('sub-123');
  });

  it('reads subscription_id from twitter-api-v2 unwrapped flat response', () => {
    expect(
      parseActivitySubscriptionId({
        subscription_id: 'sub-flat',
        event_type: 'dm.received',
        filter: { user_id: '3012852462' },
      }),
    ).toBe('sub-flat');
  });

  it('reads subscription_id from data array response', () => {
    expect(
      parseActivitySubscriptionId({
        data: [
          {
            subscription_id: 'sub-array',
            event_type: 'chat.received',
            filter: { user_id: '3012852462' },
          },
        ],
      }),
    ).toBe('sub-array');
  });

  it('returns null when subscription is missing', () => {
    expect(parseActivitySubscriptionId({})).toBeNull();
  });
});
