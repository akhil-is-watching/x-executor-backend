import { normalizeXWebhookPayload } from './x-activity-webhook.util';

export interface InboundDmWebhookContext {
  conversationId: string;
  /** Omitted when XChat webhooks only include conversationId + encoded payload. */
  recipientId?: string;
  /** XChat session token for GetXAPI /twitter/dm/conversation decryption. */
  conversationToken?: string;
  inboundMessageId?: string;
  inboundTextFromWebhook?: string;
}

function sortUserIds(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

export function buildConversationId(userIdA: string, userIdB: string): string {
  const [low, high] = sortUserIds(userIdA, userIdB);
  return `${low}-${high}`;
}

/** GetXAPI /twitter/dm/conversation expects `3012852462-1345154135381794816` style ids. */
export function isGetxapiConversationId(conversationId: string): boolean {
  return /^\d+-\d+$/.test(conversationId);
}

/** XChat webhooks use colon ids or other non-legacy conversation ids. */
export function isXChatConversationId(conversationId: string): boolean {
  return (
    conversationId.includes(':') || !isGetxapiConversationId(conversationId)
  );
}

/** XChat uses `userId:peerId` (colon). Returns the participant that is not the bot. */
export function parsePeerFromXChatConversationId(
  conversationId: string,
  xUserId: string,
): string | null {
  if (!conversationId.includes(':')) {
    return null;
  }

  const peer = conversationId
    .split(':')
    .map((part) => part.trim())
    .find((part) => part.length > 0 && part !== xUserId);

  return peer ?? null;
}

export function resolveGetxapiConversationId(
  context: Pick<InboundDmWebhookContext, 'conversationId' | 'recipientId'>,
  xUserId: string,
): string | null {
  if (context.recipientId) {
    return buildConversationId(xUserId, context.recipientId);
  }
  if (isGetxapiConversationId(context.conversationId)) {
    return context.conversationId;
  }
  const colonPeer = parsePeerFromXChatConversationId(
    context.conversationId,
    xUserId,
  );
  if (colonPeer) {
    return buildConversationId(xUserId, colonPeer);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readConversationId(
  ...sources: Array<Record<string, unknown> | null | undefined>
): string | undefined {
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const key of [
      'conversation_id',
      'conversationId',
      'dm_conversation_id',
    ] as const) {
      const value = source[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }
  return undefined;
}

function readMessageCreate(event: Record<string, unknown>) {
  const messageCreate = asRecord(event.message_create);
  if (!messageCreate) {
    return null;
  }

  const senderId = messageCreate.sender_id;
  if (senderId === undefined || senderId === null) {
    return null;
  }

  const target = asRecord(messageCreate.target);
  const recipientId = target?.recipient_id;
  const messageData = asRecord(messageCreate.message_data);
  const text =
    typeof messageData?.text === 'string' ? messageData.text : undefined;

  return {
    senderId: String(senderId),
    recipientId:
      recipientId !== undefined && recipientId !== null
        ? String(recipientId)
        : undefined,
    text,
    messageId: event.id !== undefined ? String(event.id) : undefined,
  };
}

function readSenderFromSigningKeys(
  event: Record<string, unknown>,
  xUserId: string,
): string | undefined {
  const signature =
    asRecord(event.messageEventSignature) ??
    asRecord(event.message_event_signature);
  const keys =
    signature?.messageSigningKeyInfoList ??
    signature?.message_signing_key_info_list;
  if (!Array.isArray(keys)) {
    return undefined;
  }

  for (const rawKey of keys) {
    const key = asRecord(rawKey);
    const memberId = key?.memberId ?? key?.member_id;
    if (memberId !== undefined && memberId !== null && String(memberId) !== xUserId) {
      return String(memberId);
    }
  }

  return undefined;
}

function readConversationToken(
  event: Record<string, unknown>,
): string | undefined {
  const token = event.conversation_token ?? event.conversationToken;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

function resolveXChatPeerAndConversation(
  event: Record<string, unknown>,
  xUserId: string,
  payloadConversationId?: string,
): Pick<InboundDmWebhookContext, 'conversationId' | 'recipientId'> | null {
  const conversationId = readConversationId(
    event,
    payloadConversationId ? { conversation_id: payloadConversationId } : null,
  );
  if (!conversationId) {
    return null;
  }

  const colonPeer = parsePeerFromXChatConversationId(conversationId, xUserId);
  if (colonPeer) {
    return {
      conversationId: buildConversationId(xUserId, colonPeer),
      recipientId: colonPeer,
    };
  }

  if (isGetxapiConversationId(conversationId)) {
    return { conversationId };
  }

  return { conversationId };
}

function readInboundChatEvent(
  event: Record<string, unknown>,
  xUserId: string,
  payloadConversationId?: string,
): InboundDmWebhookContext | null {
  const conversationToken = readConversationToken(event);
  const senderRaw =
    event.sender_id ??
    event.senderId ??
    event.message_sender_id ??
    event.messageSenderId ??
    readSenderFromSigningKeys(event, xUserId);
  const messageIdRaw = event.id ?? event.messageId ?? event.message_id;

  if (senderRaw !== undefined && senderRaw !== null) {
    const senderId = String(senderRaw);
    if (senderId !== xUserId) {
      return {
        conversationId: buildConversationId(xUserId, senderId),
        recipientId: senderId,
        conversationToken,
        inboundMessageId:
          messageIdRaw !== undefined ? String(messageIdRaw) : undefined,
        inboundTextFromWebhook: undefined,
      };
    }
  }

  const fromConversation = resolveXChatPeerAndConversation(
    event,
    xUserId,
    payloadConversationId,
  );
  if (fromConversation) {
    return {
      ...fromConversation,
      conversationToken,
      inboundMessageId:
        messageIdRaw !== undefined ? String(messageIdRaw) : undefined,
      inboundTextFromWebhook: undefined,
    };
  }

  return null;
}

function parseLegacyDmEvents(
  events: unknown[],
  xUserId: string,
  payloadConversationId?: string,
): InboundDmWebhookContext | null {
  for (const rawEvent of events) {
    const event = asRecord(rawEvent);
    if (!event || event.type !== 'message_create') {
      continue;
    }

    const message = readMessageCreate(event);
    if (!message || message.senderId === xUserId) {
      continue;
    }

    const conversationId =
      payloadConversationId ??
      buildConversationId(xUserId, message.senderId);

    return {
      conversationId,
      recipientId: message.senderId,
      inboundMessageId: message.messageId,
      inboundTextFromWebhook: message.text,
    };
  }

  return null;
}

function parseChatEvents(
  events: unknown[],
  xUserId: string,
  payloadConversationId?: string,
): InboundDmWebhookContext | null {
  for (const rawEvent of events) {
    const event = asRecord(rawEvent);
    if (!event) {
      continue;
    }

    const parsed = readInboundChatEvent(event, xUserId, payloadConversationId);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function parseInboundDmFromWebhook(
  rawPayload: Record<string, unknown>,
  xUserId: string,
): InboundDmWebhookContext | null {
  const payload = normalizeXWebhookPayload(rawPayload);
  const payloadConversationId = readConversationId(payload);

  const legacyEvents = payload.direct_message_events;
  if (Array.isArray(legacyEvents) && legacyEvents.length > 0) {
    return parseLegacyDmEvents(legacyEvents, xUserId, payloadConversationId);
  }

  const chatEvents = payload.x_chat_events;
  if (Array.isArray(chatEvents) && chatEvents.length > 0) {
    return parseChatEvents(chatEvents, xUserId, payloadConversationId);
  }

  if (payloadConversationId && payload.x_chat_events !== undefined) {
    return { conversationId: payloadConversationId };
  }

  return null;
}

export function isDirectMessageWebhook(eventTypes: string[]): boolean {
  return eventTypes.includes('direct_message_events');
}

/** Legacy AAA DMs or XAA XChat (`x_chat_events`). */
export function isInboundDmWebhook(eventTypes: string[]): boolean {
  return (
    isDirectMessageWebhook(eventTypes) || eventTypes.includes('x_chat_events')
  );
}
