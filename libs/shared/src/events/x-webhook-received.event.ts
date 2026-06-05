export interface XWebhookReceivedEvent {
  eventId: string;
  receivedAt: string;
  orgId: string;
  connectionId: string;
  webhookId: string;
  xUserId: string;
  xUsername: string;
  eventTypes: string[];
  payload: Record<string, unknown>;
}

export const X_WEBHOOK_METADATA_KEYS = new Set([
  'for_user_id',
  'user_has_blocked',
  'timestamp_ms',
  'sender_id',
  'source',
  'recipient_id',
  'conversation_id',
  'apps',
  'users',
]);

export function extractXWebhookEventTypes(
  payload: Record<string, unknown>,
): string[] {
  return Object.keys(payload).filter((key) => !X_WEBHOOK_METADATA_KEYS.has(key));
}
