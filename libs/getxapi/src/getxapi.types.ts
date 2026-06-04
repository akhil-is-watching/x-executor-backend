export interface GetXApiDmMessage {
  id: string;
  conversationId?: string;
  createdAt?: string;
  senderId: string;
  recipientId?: string;
  text?: string;
}

export interface GetXApiDmConversationResponse {
  userId?: string;
  conversation_id: string;
  message_count?: number;
  has_more?: boolean;
  next_cursor?: string | null;
  messages: GetXApiDmMessage[];
}

export interface FetchConversationParams {
  authToken: string;
  conversationId: string;
  cursor?: string;
  count?: number;
}

export interface SendDmParams {
  authToken: string;
  recipientId?: string;
  recipientUsername?: string;
  text: string;
}

export interface GetXApiSendDmResponse {
  status: string;
  msg?: string;
  data?: {
    id: string;
    createdAt?: string;
    senderId?: string;
    recipientId?: string;
    text?: string;
    recipient_username?: string;
  };
}
