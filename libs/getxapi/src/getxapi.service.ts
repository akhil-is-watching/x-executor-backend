import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildConversationId,
  isGetxapiConversationId,
  resolveGetxapiConversationId,
} from '@app/shared';
import { GetxapiRateLimiterService } from './getxapi-rate-limiter.service';
import type {
  FetchConversationParams,
  FetchInboundConversationParams,
  FetchInboundConversationResult,
  GetXApiDmConversationResponse,
  GetXApiDmListConversation,
  GetXApiDmListParams,
  GetXApiDmListResponse,
  GetXApiDmMessage,
  GetXApiSendDmResponse,
  SendDmParams,
} from './getxapi.types';

type DmListMatch = { conversationId: string; recipientId?: string };

function normalizeUserId(
  value: string | number | undefined | null,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function isSameUser(
  left: string | number | undefined | null,
  right: string | number | undefined | null,
): boolean {
  const normalizedLeft = normalizeUserId(left);
  const normalizedRight = normalizeUserId(right);
  return (
    normalizedLeft !== undefined &&
    normalizedRight !== undefined &&
    normalizedLeft === normalizedRight
  );
}

function readMessageField(
  message: GetXApiDmMessage | Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
): string | undefined {
  const record = message as Record<string, unknown>;
  return normalizeUserId(record[camelKey] ?? record[snakeKey]);
}

@Injectable()
export class GetxapiService {
  private readonly logger = new Logger(GetxapiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly rateLimiter: GetxapiRateLimiterService,
  ) {}

  async fetchConversation(
    params: FetchConversationParams,
  ): Promise<GetXApiDmConversationResponse> {
    await this.rateLimiter.acquire();
    const baseUrl =
      this.config.get<string>('GETXAPI_BASE_URL') ?? 'https://api.getxapi.com';
    const apiKey = this.config.getOrThrow<string>('GETXAPI_API_KEY');

    const response = await fetch(`${baseUrl}/twitter/dm/conversation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_token: params.authToken,
        conversation_id: params.conversationId,
        cursor: params.cursor,
        count: params.count ?? 50,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GetXAPI conversation failed (${response.status}): ${body}`,
      );
    }

    return (await response.json()) as GetXApiDmConversationResponse;
  }

  async listConversations(
    params: GetXApiDmListParams,
  ): Promise<GetXApiDmListResponse> {
    await this.rateLimiter.acquire();
    const baseUrl =
      this.config.get<string>('GETXAPI_BASE_URL') ?? 'https://api.getxapi.com';
    const apiKey = this.config.getOrThrow<string>('GETXAPI_API_KEY');

    const response = await fetch(`${baseUrl}/twitter/dm/list`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_token: params.authToken,
        tab: params.tab ?? 'all',
        cursor: params.cursor,
        count: params.count ?? 50,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GetXAPI dm list failed (${response.status}): ${body}`);
    }

    return (await response.json()) as GetXApiDmListResponse;
  }

  async fetchInboundConversation(
    params: FetchInboundConversationParams,
  ): Promise<FetchInboundConversationResult> {
    const resolvedConversationId = resolveGetxapiConversationId(
      {
        conversationId: params.conversationId,
        recipientId: params.recipientId,
      },
      params.xUserId,
    );

    if (resolvedConversationId) {
      try {
        const conversation = await this.fetchConversation({
          authToken: params.authToken,
          conversationId: resolvedConversationId,
        });
        return {
          conversation,
          conversationId: resolvedConversationId,
          recipientId:
            params.recipientId ??
            this.extractLatestIncomingPeerId(
              conversation.messages,
              params.xUserId,
            ) ??
            undefined,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('(404)')) {
          throw err;
        }
      }
    }

    const fromList = await this.resolveConversationFromList(
      params.authToken,
      params.xUserId,
      params.recipientId,
    );
    const conversation = await this.fetchConversation({
      authToken: params.authToken,
      conversationId: fromList.conversationId,
    });

    return {
      conversation,
      conversationId: fromList.conversationId,
      recipientId: fromList.recipientId,
    };
  }

  private async resolveConversationFromList(
    authToken: string,
    xUserId: string,
    recipientId?: string,
  ): Promise<DmListMatch> {
    const diagnostics: string[] = [];

    for (const tab of ['all', 'requests'] as const) {
      const list = await this.listConversations({ authToken, tab });
      const conversations = list.conversations ?? [];
      const messages = list.messages ?? [];
      diagnostics.push(
        `tab=${tab} conversations=${conversations.length} messages=${messages.length}`,
      );

      const fromInbound = this.pickInboundConversation(
        conversations,
        xUserId,
        recipientId,
      );
      if (fromInbound) {
        this.logger.log(
          `Resolved dm/list via inbound conversation tab=${tab} id=${fromInbound.conversationId}`,
        );
        return fromInbound;
      }

      const fromMessages = this.pickInboundFromFlatMessages(
        messages,
        xUserId,
        recipientId,
      );
      if (fromMessages) {
        this.logger.log(
          `Resolved dm/list via flat messages tab=${tab} id=${fromMessages.conversationId}`,
        );
        return fromMessages;
      }

      const relaxed = this.pickMostRecentOneToOne(
        conversations,
        xUserId,
        recipientId,
      );
      if (relaxed) {
        this.logger.warn(
          `Resolved dm/list via most-recent 1:1 fallback tab=${tab} id=${relaxed.conversationId}`,
        );
        return relaxed;
      }
    }

    throw new Error(
      `GetXAPI could not resolve an inbound DM conversation from dm/list (${diagnostics.join('; ')})`,
    );
  }

  private pickInboundConversation(
    conversations: GetXApiDmListConversation[],
    xUserId: string,
    recipientId?: string,
  ): DmListMatch | null {
    const candidates = conversations
      .filter((conversation) => conversation.type !== 'GROUP_DM')
      .map((conversation) => {
        const peerId = this.extractPeerId(conversation, xUserId);
        const lastMessage = conversation.last_message;
        const senderId = lastMessage
          ? readMessageField(lastMessage, 'senderId', 'sender_id')
          : undefined;
        const inbound =
          conversation.unread === true ||
          (senderId !== undefined && !isSameUser(senderId, xUserId));
        return { conversation, peerId, inbound };
      })
      .filter(({ peerId, inbound }) => {
        if (!peerId) {
          return false;
        }
        if (recipientId && !isSameUser(peerId, recipientId)) {
          return false;
        }
        return inbound;
      });

    return this.pickBestConversationCandidate(candidates);
  }

  private pickInboundFromFlatMessages(
    messages: GetXApiDmMessage[],
    xUserId: string,
    recipientId?: string,
  ): DmListMatch | null {
    for (const message of messages) {
      const senderId = readMessageField(message, 'senderId', 'sender_id');
      if (!senderId || isSameUser(senderId, xUserId)) {
        continue;
      }
      if (recipientId && !isSameUser(senderId, recipientId)) {
        continue;
      }

      const conversationId = this.resolveListMessageConversationId(
        message,
        xUserId,
      );
      if (!conversationId) {
        continue;
      }

      return { conversationId, recipientId: senderId };
    }

    return null;
  }

  private pickMostRecentOneToOne(
    conversations: GetXApiDmListConversation[],
    xUserId: string,
    recipientId?: string,
  ): DmListMatch | null {
    const candidates = conversations
      .filter((conversation) => conversation.type !== 'GROUP_DM')
      .map((conversation) => ({
        conversation,
        peerId: this.extractPeerId(conversation, xUserId),
      }))
      .filter(({ conversation, peerId }) => {
        if (!peerId) {
          return false;
        }
        if (recipientId && !isSameUser(peerId, recipientId)) {
          return false;
        }
        return isGetxapiConversationId(conversation.conversation_id);
      });

    return this.pickBestConversationCandidate(candidates);
  }

  private pickBestConversationCandidate(
    candidates: Array<{
      conversation: GetXApiDmListConversation;
      peerId?: string;
    }>,
  ): DmListMatch | null {
    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => {
      const leftTs = left.conversation.sort_timestamp ?? '';
      const rightTs = right.conversation.sort_timestamp ?? '';
      return rightTs.localeCompare(leftTs);
    });

    const best = candidates[0];
    if (!best.peerId) {
      return null;
    }

    return {
      conversationId: best.conversation.conversation_id,
      recipientId: best.peerId,
    };
  }

  private extractPeerId(
    conversation: GetXApiDmListConversation,
    xUserId: string,
  ): string | undefined {
    const participants = conversation.participants ?? [];
    const peerFromParticipants = participants.find(
      (participant) => !isSameUser(participant.id, xUserId),
    )?.id;
    if (peerFromParticipants) {
      return normalizeUserId(peerFromParticipants);
    }

    const lastMessage = conversation.last_message;
    if (lastMessage) {
      const senderId = readMessageField(lastMessage, 'senderId', 'sender_id');
      const recipientIdOnMessage = readMessageField(
        lastMessage,
        'recipientId',
        'recipient_id',
      );
      if (senderId && !isSameUser(senderId, xUserId)) {
        return senderId;
      }
      if (recipientIdOnMessage && !isSameUser(recipientIdOnMessage, xUserId)) {
        return recipientIdOnMessage;
      }
    }

    if (participants.length === 1) {
      return normalizeUserId(participants[0].id);
    }

    return undefined;
  }

  private resolveListMessageConversationId(
    message: GetXApiDmMessage,
    xUserId: string,
  ): string | null {
    const rawConversationId = readMessageField(
      message,
      'conversationId',
      'conversation_id',
    );
    if (rawConversationId && isGetxapiConversationId(rawConversationId)) {
      return rawConversationId;
    }

    const senderId = readMessageField(message, 'senderId', 'sender_id');
    const recipientId = readMessageField(message, 'recipientId', 'recipient_id');
    const peerId =
      senderId && !isSameUser(senderId, xUserId)
        ? senderId
        : recipientId && !isSameUser(recipientId, xUserId)
          ? recipientId
          : undefined;

    if (!peerId) {
      return null;
    }

    return buildConversationId(xUserId, peerId);
  }

  async sendDm(params: SendDmParams): Promise<GetXApiSendDmResponse> {
    if (!params.recipientId && !params.recipientUsername) {
      throw new Error('sendDm requires recipientId or recipientUsername');
    }

    await this.rateLimiter.acquire();
    const baseUrl =
      this.config.get<string>('GETXAPI_BASE_URL') ?? 'https://api.getxapi.com';
    const apiKey = this.config.getOrThrow<string>('GETXAPI_API_KEY');

    const body: Record<string, string> = {
      auth_token: params.authToken,
      text: params.text,
    };
    if (params.recipientId) {
      body.recipient_id = params.recipientId;
    }
    if (params.recipientUsername) {
      body.recipient_username = params.recipientUsername;
    }

    const response = await fetch(`${baseUrl}/twitter/dm/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`GetXAPI send DM failed (${response.status}): ${responseBody}`);
    }

    return (await response.json()) as GetXApiSendDmResponse;
  }

  extractLatestIncomingPlainText(
    messages: GetXApiDmMessage[],
    xUserId: string,
  ): string | null {
    for (const message of messages) {
      const senderId = readMessageField(message, 'senderId', 'sender_id');
      if (!senderId || isSameUser(senderId, xUserId)) {
        continue;
      }
      const text = message.text?.trim();
      if (text) {
        return text;
      }
    }
    return null;
  }

  extractLatestIncomingPeerId(
    messages: GetXApiDmMessage[],
    xUserId: string,
  ): string | null {
    for (const message of messages) {
      const senderId = readMessageField(message, 'senderId', 'sender_id');
      if (senderId && !isSameUser(senderId, xUserId)) {
        return senderId;
      }
    }
    return null;
  }
}
