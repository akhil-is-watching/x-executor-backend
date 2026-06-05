import {
  isXActivityWebhookPayload,
  normalizeXWebhookPayload,
} from './x-activity-webhook.util';

describe('x-activity-webhook.util', () => {
  it('detects XAA envelope payloads', () => {
    expect(
      isXActivityWebhookPayload({
        data: {
          event_type: 'dm.received',
          filter: { user_id: '3012852462' },
          payload: {},
        },
      }),
    ).toBe(true);
    expect(isXActivityWebhookPayload({ for_user_id: '1' })).toBe(false);
  });

  it('normalizes dm.received into AAA direct_message_events', () => {
    const raw = {
      data: {
        event_type: 'dm.received',
        filter: { user_id: '3012852462' },
        payload: {
          type: 'message_create',
          id: '2059239475419779072',
          message_create: {
            sender_id: '1345154135381794816',
            target: { recipient_id: '3012852462' },
            message_data: { text: 'hello' },
          },
        },
      },
    };

    expect(normalizeXWebhookPayload(raw)).toEqual({
      for_user_id: '3012852462',
      direct_message_events: [raw.data.payload],
    });
  });

  it('normalizes chat.received into x_chat_events', () => {
    const chatPayload = {
      encrypted: true,
      conversationId: 'abc',
    };
    const raw = {
      data: {
        event_type: 'chat.received',
        filter: { user_id: '3012852462' },
        payload: chatPayload,
      },
    };

    expect(normalizeXWebhookPayload(raw)).toEqual({
      for_user_id: '3012852462',
      conversation_id: 'abc',
      x_chat_events: [chatPayload],
    });
  });

  it('passes through AAA payloads unchanged', () => {
    const aaa = {
      for_user_id: '3012852462',
      direct_message_events: [{ type: 'message_create' }],
    };
    expect(normalizeXWebhookPayload(aaa)).toBe(aaa);
  });
});
