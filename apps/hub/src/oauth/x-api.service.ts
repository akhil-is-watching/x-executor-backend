import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
  private readonly logger = new Logger(XApiService.name);

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

  /** v2 user id matches Account Activity for_user_id (OAuth 1.0a login userId may differ). */
  async fetchUserProfileOAuth1(
    accessToken: string,
    accessTokenSecret: string,
  ): Promise<{ id: string; username: string }> {
    const appKey = this.config.getOrThrow<string>('X_API_KEY');
    const appSecret = this.config.getOrThrow<string>('X_API_KEY_SECRET');
    const userClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret: accessTokenSecret,
    });

    try {
      const me = await userClient.v2.me({
        'user.fields': ['id', 'username'],
      });
      if (!me.data?.id || !me.data.username) {
        throw new InternalServerErrorException('X users/me returned no profile');
      }
      return { id: me.data.id, username: me.data.username };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`X users/me (OAuth 1.0a) failed: ${message}`);
    }
  }

  /** Revokes the user's OAuth 1.0a access token on X (POST oauth/invalidate_token). */
  async invalidateOAuth1AccessToken(
    accessToken: string,
    accessTokenSecret: string,
  ): Promise<void> {
    const appKey = this.config.getOrThrow<string>('X_API_KEY');
    const appSecret = this.config.getOrThrow<string>('X_API_KEY_SECRET');
    const userClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret: accessTokenSecret,
    });

    try {
      await userClient.post('https://api.x.com/1.1/oauth/invalidate_token');
      this.logger.log('X OAuth 1.0a access token invalidated');
    } catch (err: unknown) {
      const status = (err as { code?: number })?.code;
      const apiCode = (
        err as { data?: { errors?: Array<{ code?: number }> } }
      )?.data?.errors?.[0]?.code;
      if (status === 401 || apiCode === 89) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`X OAuth invalidate_token failed: ${message}`);
    }
  }
}
