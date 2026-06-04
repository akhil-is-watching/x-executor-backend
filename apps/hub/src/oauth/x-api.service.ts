import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwitterApi } from 'twitter-api-v2';

export interface XOAuth1RequestToken {
  oauthToken: string;
  oauthTokenSecret: string;
  authUrl: string;
}

export interface XOAuth1AccessToken {
  accessToken: string;
  accessTokenSecret: string;
  userId: string;
  screenName: string;
}

@Injectable()
export class XApiService {
  constructor(private readonly config: ConfigService) {}

  private getAppClient(): TwitterApi {
    const appKey = this.config.getOrThrow<string>('X_API_KEY');
    const appSecret = this.config.getOrThrow<string>('X_API_KEY_SECRET');
    return new TwitterApi({ appKey, appSecret });
  }

  async getRequestToken(callbackUrl: string): Promise<XOAuth1RequestToken> {
    const client = this.getAppClient();
    const link = await client.generateAuthLink(callbackUrl);
    return {
      oauthToken: link.oauth_token,
      oauthTokenSecret: link.oauth_token_secret,
      authUrl: link.url,
    };
  }

  async exchangeVerifierForTokens(
    oauthToken: string,
    oauthTokenSecret: string,
    oauthVerifier: string,
  ): Promise<XOAuth1AccessToken> {
    const appKey = this.config.getOrThrow<string>('X_API_KEY');
    const appSecret = this.config.getOrThrow<string>('X_API_KEY_SECRET');

    const requestClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken: oauthToken,
      accessSecret: oauthTokenSecret,
    });

    try {
      const result = await requestClient.login(oauthVerifier);
      return {
        accessToken: result.accessToken,
        accessTokenSecret: result.accessSecret,
        userId: result.userId,
        screenName: result.screenName,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`X OAuth 1.0a token exchange failed: ${message}`);
    }
  }

  async fetchCurrentUser(accessToken: string): Promise<{ id: string; username: string }> {
    const response = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new InternalServerErrorException(`X users/me failed: ${text}`);
    }

    const json = (await response.json()) as { data: { id: string; username: string } };
    return { id: json.data.id, username: json.data.username };
  }
}
