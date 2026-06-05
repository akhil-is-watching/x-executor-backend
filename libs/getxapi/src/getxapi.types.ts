export interface GetXApiDmMessage {
  id: string;
  conversationId?: string;
  conversation_id?: string;
  createdAt?: string;
  senderId?: string;
  sender_id?: string;
  recipientId?: string;
  recipient_id?: string;
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

export interface GetXApiDmListParams {
  authToken: string;
  tab?: 'all' | 'requests' | 'hidden';
  cursor?: string;
  count?: number;
}

export interface GetXApiDmParticipant {
  id: string;
  screen_name?: string;
  name?: string;
}

export interface GetXApiDmListConversation {
  conversation_id: string;
  type?: string;
  unread?: boolean;
  sort_timestamp?: string;
  participants?: GetXApiDmParticipant[];
  last_message?: GetXApiDmMessage;
}

export interface GetXApiDmListResponse {
  userId?: string;
  tab?: string;
  conversation_count?: number;
  message_count?: number;
  has_more?: boolean;
  next_cursor?: string | null;
  conversations?: GetXApiDmListConversation[];
  messages?: GetXApiDmMessage[];
}

export interface FetchInboundConversationParams {
  authToken: string;
  xUserId: string;
  conversationId: string;
  recipientId?: string;
}

export interface FetchInboundConversationResult {
  conversation: GetXApiDmConversationResponse;
  conversationId: string;
  recipientId?: string;
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
