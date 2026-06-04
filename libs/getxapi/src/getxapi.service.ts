import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetxapiRateLimiterService } from './getxapi-rate-limiter.service';
import type {
  FetchConversationParams,
  GetXApiDmConversationResponse,
  GetXApiDmMessage,
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
