export interface XDmReplyReadyEvent {
  eventId: string;
  sourceEventId: string;
  processedAt: string;
  orgId: string;
  connectionId: string;
  xUserId: string;
  xUsername: string;
  conversationId: string;
  recipientId: string;
  inboundMessageId?: string;
  inboundText: string;
  replyText: string;
  isKnownAnswer: boolean;
}
