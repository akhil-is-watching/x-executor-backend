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

export function parseInboundDmFromWebhook(
  payload: Record<string, unknown>,
  xUserId: string,
): InboundDmWebhookContext | null {
  const events = payload.direct_message_events;
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  for (const rawEvent of events) {
    const event = asRecord(rawEvent);
    if (!event || event.type !== 'message_create') {
      continue;
    }

    const message = readMessageCreate(event);
    if (!message || message.senderId === xUserId) {
      continue;
    }

    const peerId = message.senderId;

    const conversationIdFromPayload = payload.conversation_id;
    const conversationId =
      typeof conversationIdFromPayload === 'string'
        ? conversationIdFromPayload
        : buildConversationId(xUserId, peerId);

    return {
      conversationId,
      recipientId: peerId,
      inboundMessageId: message.messageId,
      inboundTextFromWebhook: message.text,
    };
  }

  return null;
}

export function isDirectMessageWebhook(eventTypes: string[]): boolean {
  return eventTypes.includes('direct_message_events');
}
