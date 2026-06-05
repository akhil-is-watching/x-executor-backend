function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const XAA_DM_EVENT_TO_AAA_KEY: Record<string, string> = {
  'dm.received': 'direct_message_events',
  'dm.sent': 'direct_message_events',
  'dm.read': 'direct_message_mark_read_events',
  'dm.indicate_typing': 'direct_message_indicate_typing_events',
  'chat.received': 'x_chat_events',
  'chat.sent': 'x_chat_events',
  'chat.conversation_join': 'x_chat_events',
};

function coerceEventArray(inner: unknown): unknown[] {
  if (Array.isArray(inner)) {
    return inner;
  }

  const record = asRecord(inner);
  if (!record) {
    return inner === undefined ? [] : [inner];
  }

  for (const key of Object.values(XAA_DM_EVENT_TO_AAA_KEY)) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return nested;
    }
  }

  return [record];
}

/** XAA stream/webhook envelope: `{ data: { event_type, filter, payload } }`. */
export function isXActivityWebhookPayload(
  raw: Record<string, unknown>,
): boolean {
  const data = asRecord(raw.data);
  return (
    data !== null &&
    typeof data.event_type === 'string' &&
    asRecord(data.filter)?.user_id !== undefined
  );
}

/**
 * Convert X Activity API webhook/stream payloads to AAA-shaped bodies so existing
 * routing and DM parsing keep working (`for_user_id`, `direct_message_events`, …).
 */
export function normalizeXWebhookPayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  if (raw.for_user_id !== undefined && raw.for_user_id !== null) {
    return raw;
  }

  const data = asRecord(raw.data);
  if (!data) {
    return raw;
  }

  const eventType = data.event_type;
  const filter = asRecord(data.filter);
  const userId = filter?.user_id;
  if (typeof eventType !== 'string' || userId === undefined || userId === null) {
    return raw;
  }

  const inner = data.payload;
  const innerRecord = asRecord(inner);

  if (innerRecord?.for_user_id !== undefined) {
    return innerRecord;
  }

  const normalized: Record<string, unknown> = {
    for_user_id: String(userId),
  };

  const aaaKey = XAA_DM_EVENT_TO_AAA_KEY[eventType];
  if (aaaKey) {
    normalized[aaaKey] = coerceEventArray(inner);
  } else if (inner !== undefined) {
    normalized[eventType.replace(/\./g, '_')] = inner;
  }

  if (innerRecord) {
    if (innerRecord.apps !== undefined) {
      normalized.apps = innerRecord.apps;
    }
    if (innerRecord.users !== undefined) {
      normalized.users = innerRecord.users;
    }
    if (typeof innerRecord.conversation_id === 'string') {
      normalized.conversation_id = innerRecord.conversation_id;
    }
  }

  return normalized;
}
