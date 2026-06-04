import {
  buildConversationId,
  isDirectMessageWebhook,
  parseInboundDmFromWebhook,
} from './dm-webhook.util';

describe('dm-webhook.util', () => {
  it('buildConversationId sorts ids numerically', () => {
    expect(buildConversationId('999', '1000')).toBe('999-1000');
    expect(buildConversationId('1000', '999')).toBe('999-1000');
  });

  it('detects direct message webhooks', () => {
    expect(isDirectMessageWebhook(['direct_message_events'])).toBe(true);
    expect(isDirectMessageWebhook(['tweet_create_events'])).toBe(false);
  });

  it('parses inbound message_create events', () => {
    const payload = {
      direct_message_events: [
        {
          type: 'message_create',
          id: '2059239475419779072',
          message_create: {
            sender_id: '1345154135381794816',
            target: { recipient_id: '3012852462' },
            message_data: { text: 'hello there' },
          },
        },
      ],
    };

    const result = parseInboundDmFromWebhook(payload, '3012852462');
    expect(result).toEqual({
      conversationId: '3012852462-1345154135381794816',
      recipientId: '1345154135381794816',
      inboundMessageId: '2059239475419779072',
      inboundTextFromWebhook: 'hello there',
    });
  });

  it('skips outbound messages from the connected account', () => {
    const payload = {
      direct_message_events: [
        {
          type: 'message_create',
          id: '1',
          message_create: {
            sender_id: '3012852462',
            target: { recipient_id: '1345154135381794816' },
            message_data: { text: 'outbound' },
          },
        },
      ],
    };

    expect(parseInboundDmFromWebhook(payload, '3012852462')).toBeNull();
  });
});
