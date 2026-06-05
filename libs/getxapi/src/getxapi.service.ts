import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
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

@Injectable()
export class GetxapiService {
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
  ): Promise<{ conversationId: string; recipientId?: string }> {
    const list = await this.listConversations({ authToken, tab: 'all' });
    const match = this.pickInboundConversation(list.conversations ?? [], xUserId, recipientId);
    if (match) {
      return match;
    }

    throw new Error(
      'GetXAPI could not resolve an inbound DM conversation from dm/list',
    );
  }

  private pickInboundConversation(
    conversations: GetXApiDmListConversation[],
    xUserId: string,
    recipientId?: string,
  ): { conversationId: string; recipientId?: string } | null {
    const candidates = conversations
      .filter((conversation) => conversation.type !== 'GROUP_DM')
      .map((conversation) => {
        const peerId = conversation.participants?.find(
          (participant) => participant.id !== xUserId,
        )?.id;
        const lastMessage = conversation.last_message;
        const inbound =
          conversation.unread === true ||
          (lastMessage !== undefined && lastMessage.senderId !== xUserId);
        return { conversation, peerId, inbound };
      })
      .filter(({ peerId, inbound }) => {
        if (recipientId && peerId !== recipientId) {
          return false;
        }
        return inbound;
      });

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => {
      const leftTs = left.conversation.sort_timestamp ?? '';
      const rightTs = right.conversation.sort_timestamp ?? '';
      return rightTs.localeCompare(leftTs);
    });

    const best = candidates[0];
    return {
      conversationId: best.conversation.conversation_id,
      recipientId: best.peerId,
    };
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
      if (message.senderId === xUserId) {
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
      if (message.senderId !== xUserId) {
        return message.senderId;
      }
    }
    return null;
  }
}
