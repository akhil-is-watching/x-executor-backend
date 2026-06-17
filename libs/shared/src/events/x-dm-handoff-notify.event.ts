export interface XDmHandoffNotifyEvent {
  orgId: string;
  connectionId: string;
  notifyHandle: string;
  category: string | null;
  userHandle: string;
  userMessage: string;
  conversationId: string;
  triggeredAt: string;
}
