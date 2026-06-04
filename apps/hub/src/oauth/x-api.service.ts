import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface XTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type: string;
}

export interface XUserResponse {
  id: string;
  username: string;
}

@Injectable()
export class XApiService {
  constructor(private readonly config: ConfigService) {}

  buildAuthorizeUrl(params: {
    state: string;
    codeChallenge: string;
  }): string {
    const clientId = this.config.getOrThrow<string>('X_CLIENT_ID');
    const redirectUri = this.config.getOrThrow<string>('X_REDIRECT_URI');
    const scopes =
      this.config.get<string>('X_OAUTH_SCOPES') ??
      'tweet.read tweet.write users.read offline.access';

    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://twitter.com/i/oauth2/authorize?${query.toString()}`;
  }

  /** X often returns JSON ("Redirect is requested") unless the browser hits the login flow first. */
  buildBrowserAuthorizeUrl(params: {
    state: string;
    codeChallenge: string;
  }): string {
    const authorizeUrl = this.buildAuthorizeUrl(params);
    return `https://twitter.com/i/flow/login?hide_message=true&redirect_after_login=${encodeURIComponent(authorizeUrl)}`;
  }

  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
  ): Promise<XTokenResponse> {
    const clientId = this.config.getOrThrow<string>('X_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('X_CLIENT_SECRET');
    const redirectUri = this.config.getOrThrow<string>('X_REDIRECT_URI');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId,
    });

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new BadRequestException(`X token exchange failed: ${text}`);
    }

    return (await response.json()) as XTokenResponse;
  }

  async fetchCurrentUser(accessToken: string): Promise<XUserResponse> {
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
