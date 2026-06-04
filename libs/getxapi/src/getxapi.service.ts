import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetxapiRateLimiterService } from './getxapi-rate-limiter.service';
import type {
  FetchConversationParams,
  GetXApiDmConversationResponse,
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
}
