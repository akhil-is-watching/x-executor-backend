import {
  buildConversationId,
  isDirectMessageWebhook,
  isInboundDmWebhook,
  parseInboundDmFromWebhook,
  resolveGetxapiConversationId,
} from './dm-webhook.util';

describe('dm-webhook.util', () => {
  it('buildConversationId uses for_user_id-sender_id order (GetXAPI format)', () => {
    expect(buildConversationId('1390625949587173378', '1969370428272754692')).toBe(
      '1390625949587173378-1969370428272754692',
    );
    expect(buildConversationId('1000', '999')).toBe('1000-999');
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
      conversationToken: undefined,
      xChatConversationId: 'xchat-conv-abc',
      inboundMessageId: 'chat-msg-1',
      inboundTextFromWebhook: undefined,
      encodedEvent: undefined,
      conversationKeyChangeEvent: undefined,
      conversationKeyVersion: undefined,
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
      conversationToken: undefined,
      xChatConversationId: 'xchat-conv-abc',
      inboundMessageId: 'chat-msg-1',
      inboundTextFromWebhook: undefined,
      encodedEvent: 'base64...',
      conversationKeyChangeEvent: undefined,
      conversationKeyVersion: undefined,
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
      conversationToken: undefined,
      xChatConversationId: 'xchat-conv-only',
      inboundMessageId: 'chat-msg-1',
      inboundTextFromWebhook: undefined,
      encodedEvent: 'base64...',
      conversationKeyChangeEvent: undefined,
      conversationKeyVersion: undefined,
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
      conversationToken: undefined,
      xChatConversationId: 'xchat-from-xaa',
      inboundMessageId: 'chat-msg-1',
      inboundTextFromWebhook: undefined,
      encodedEvent: undefined,
      conversationKeyChangeEvent: undefined,
      conversationKeyVersion: undefined,
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

  it('resolves GetXAPI conversation ids from XChat colon conversation_id', () => {
    expect(
      resolveGetxapiConversationId(
        {
          conversationId: '1390625949587173378:1774607208379',
        },
        '1390625949587173378',
      ),
    ).toBe('1390625949587173378-1774607208379');
  });

  it('parses real XAA chat.received snake_case when sender_id is the bot account', () => {
    const raw = {
      data: {
        event_type: 'chat.received',
        filter: { user_id: '1390625949587173378' },
        payload: {
          id: '60d9a817-bbea-43c7-84b2-c9b2345718a2',
          sender_id: '1390625949587173378',
          conversation_id: '1390625949587173378:1390625949587173378',
          conversation_token: 'jwt-token',
          encoded_event: 'CwAB...',
          message_event_signature: {
            public_key_version: '1774607208379',
            signature: 'abc',
            signature_version: '7',
            signing_public_key: 'MFkw...',
          },
        },
      },
    };

    expect(parseInboundDmFromWebhook(raw, '1390625949587173378')).toEqual({
      conversationId: '1390625949587173378:1390625949587173378',
      conversationToken: 'jwt-token',
      xChatConversationId: '1390625949587173378:1390625949587173378',
      inboundMessageId: '60d9a817-bbea-43c7-84b2-c9b2345718a2',
      inboundTextFromWebhook: undefined,
      encodedEvent: 'CwAB...',
      conversationKeyChangeEvent: undefined,
      conversationKeyVersion: undefined,
    });
  });

  it('parses XChat colon conversation_id with distinct peer as GetXAPI legacy id', () => {
    expect(
      parseInboundDmFromWebhook(
        {
          for_user_id: '1390625949587173378',
          conversation_id: '1390625949587173378:1774607208379',
          x_chat_events: [
            {
              id: 'msg-1',
              sender_id: '1390625949587173378',
              conversation_id: '1390625949587173378:1774607208379',
            },
          ],
        },
        '1390625949587173378',
      ),
    ).toEqual({
      conversationId: '1390625949587173378-1774607208379',
      recipientId: '1774607208379',
      conversationToken: undefined,
      xChatConversationId: '1390625949587173378:1774607208379',
      inboundMessageId: 'msg-1',
      inboundTextFromWebhook: undefined,
      encodedEvent: undefined,
      conversationKeyChangeEvent: undefined,
      conversationKeyVersion: undefined,
    });
  });

  it('extracts encoded_event, conversation_key_change_event, and conversation_key_version from XChat payload', () => {
    const payload = {
      for_user_id: '1390625949587173378',
      x_chat_events: [
        {
          id: 'event-1',
          sender_id: '2024635972819034112',
          conversation_id: '1390625949587173378:2024635972819034112',
          conversation_token: 'jwt-token',
          encoded_event: 'AQIDBAU=',
          conversation_key_change_event: 'WRAPPED_KEY_BLOB==',
          conversation_key_version: '1780909207040',
        },
      ],
    };

    const result = parseInboundDmFromWebhook(payload, '1390625949587173378');
    expect(result).toEqual({
      conversationId: '1390625949587173378-2024635972819034112',
      recipientId: '2024635972819034112',
      conversationToken: 'jwt-token',
      xChatConversationId: '1390625949587173378:2024635972819034112',
      inboundMessageId: 'event-1',
      inboundTextFromWebhook: undefined,
      encodedEvent: 'AQIDBAU=',
      conversationKeyChangeEvent: 'WRAPPED_KEY_BLOB==',
      conversationKeyVersion: '1780909207040',
    });
  });

  it('extracts camelCase encrypted XChat fields', () => {
    const payload = {
      x_chat_events: [
        {
          id: 'event-2',
          senderId: '2024635972819034112',
          encodedEvent: 'camelBase64==',
          conversationKeyChangeEvent: 'camelWrapped==',
          conversationKeyVersion: '9999999',
        },
      ],
    };

    const result = parseInboundDmFromWebhook(payload, '1390625949587173378');
    expect(result?.encodedEvent).toBe('camelBase64==');
    expect(result?.conversationKeyChangeEvent).toBe('camelWrapped==');
    expect(result?.conversationKeyVersion).toBe('9999999');
  });
});
