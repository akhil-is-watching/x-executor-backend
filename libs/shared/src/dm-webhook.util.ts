export interface InboundDmWebhookContext {
  conversationId: string;
  recipientId: string;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

function readInboundChatEvent(
  event: Record<string, unknown>,
  xUserId: string,
  payloadConversationId?: string,
): InboundDmWebhookContext | null {
  const senderRaw = event.sender_id ?? event.senderId;
  if (senderRaw === undefined || senderRaw === null) {
    return null;
  }
  const senderId = String(senderRaw);
  if (senderId === xUserId) {
    return null;
  }

  const conversationIdFromEvent =
    typeof event.conversation_id === 'string'
      ? event.conversation_id
      : typeof event.dm_conversation_id === 'string'
        ? event.dm_conversation_id
        : undefined;
  const conversationId =
    conversationIdFromEvent ??
    payloadConversationId ??
    buildConversationId(xUserId, senderId);

  return {
    conversationId,
    recipientId: senderId,
    inboundMessageId:
      event.id !== undefined ? String(event.id) : undefined,
    inboundTextFromWebhook: undefined,
  };
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
  payload: Record<string, unknown>,
  xUserId: string,
): InboundDmWebhookContext | null {
  const payloadConversationId =
    typeof payload.conversation_id === 'string'
      ? payload.conversation_id
      : undefined;

  const legacyEvents = payload.direct_message_events;
  if (Array.isArray(legacyEvents) && legacyEvents.length > 0) {
    return parseLegacyDmEvents(legacyEvents, xUserId, payloadConversationId);
  }

  const chatEvents = payload.x_chat_events;
  if (Array.isArray(chatEvents) && chatEvents.length > 0) {
    return parseChatEvents(chatEvents, xUserId, payloadConversationId);
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
