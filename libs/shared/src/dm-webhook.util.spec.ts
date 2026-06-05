import {
  buildConversationId,
  isDirectMessageWebhook,
  isInboundDmWebhook,
  parseInboundDmFromWebhook,
  resolveGetxapiConversationId,
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

  it('detects inbound XChat webhooks', () => {
    expect(isInboundDmWebhook(['x_chat_events'])).toBe(true);
    expect(isInboundDmWebhook(['direct_message_events'])).toBe(true);
    expect(isInboundDmWebhook(['tweet_create_events'])).toBe(false);
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

  it('parses inbound XChat events using conversation_id and sender_id', () => {
    const payload = {
      conversation_id: 'xchat-conv-abc',
      x_chat_events: [
        {
          id: 'chat-msg-1',
          sender_id: '1345154135381794816',
        },
      ],
    };

    expect(parseInboundDmFromWebhook(payload, '3012852462')).toEqual({
      conversationId: '3012852462-1345154135381794816',
      recipientId: '1345154135381794816',
      inboundMessageId: 'chat-msg-1',
      inboundTextFromWebhook: undefined,
    });
  });

  it('parses XChat ChatMessageEvent camelCase fields', () => {
    const payload = {
      conversation_id: 'xchat-conv-abc',
      x_chat_events: [
        {
          id: 'chat-msg-1',
          conversationId: 'xchat-conv-abc',
          senderId: '1345154135381794816',
          encodedEvent: 'base64...',
        },
      ],
    };

    expect(parseInboundDmFromWebhook(payload, '3012852462')).toEqual({
      conversationId: '3012852462-1345154135381794816',
      recipientId: '1345154135381794816',
      inboundMessageId: 'chat-msg-1',
      inboundTextFromWebhook: undefined,
    });
  });

  it('parses XChat when only conversationId is present on the event', () => {
    const payload = {
      x_chat_events: [
        {
          id: 'chat-msg-1',
          conversationId: 'xchat-conv-only',
          encodedEvent: 'base64...',
        },
      ],
    };

    expect(parseInboundDmFromWebhook(payload, '3012852462')).toEqual({
      conversationId: 'xchat-conv-only',
      inboundMessageId: 'chat-msg-1',
      inboundTextFromWebhook: undefined,
    });
  });

  it('normalizes raw XAA chat.received envelopes before parsing', () => {
    const raw = {
      data: {
        event_type: 'chat.received',
        filter: { user_id: '3012852462' },
        payload: {
          conversationId: 'xchat-from-xaa',
          senderId: '1345154135381794816',
          id: 'chat-msg-1',
        },
      },
    };

    expect(parseInboundDmFromWebhook(raw, '3012852462')).toEqual({
      conversationId: '3012852462-1345154135381794816',
      recipientId: '1345154135381794816',
      inboundMessageId: 'chat-msg-1',
      inboundTextFromWebhook: undefined,
    });
  });

  it('resolves GetXAPI conversation ids from recipientId', () => {
    expect(
      resolveGetxapiConversationId(
        {
          conversationId: 'opaque-xchat-id',
          recipientId: '1345154135381794816',
        },
        '3012852462',
      ),
    ).toBe('3012852462-1345154135381794816');
  });
});
