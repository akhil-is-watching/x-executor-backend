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
      xChatConversationId: 'xchat-conv-abc',
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
      xChatConversationId: 'xchat-conv-abc',
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
      xChatConversationId: 'xchat-conv-only',
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
      xChatConversationId: 'xchat-from-xaa',
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

  it('resolves GetXAPI conversation ids from XChat colon conversation_id', () => {
    expect(
      resolveGetxapiConversationId(
        {
          conversationId: '1390625949587173378:1774607208379',
        },
        '1390625949587173378',
      ),
    ).toBe('1774607208379-1390625949587173378');
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
      conversationId: '1774607208379-1390625949587173378',
      recipientId: '1774607208379',
      xChatConversationId: '1390625949587173378:1774607208379',
      inboundMessageId: 'msg-1',
      inboundTextFromWebhook: undefined,
    });
  });
});
