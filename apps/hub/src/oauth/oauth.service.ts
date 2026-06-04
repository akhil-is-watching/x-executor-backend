import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Response } from 'express';
import { InvitesService } from '../invites/invites.service';
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateStateId,
} from '../crypto/pkce.util';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { XApiService } from './x-api.service';
import { OAuthStateStore } from './oauth-state.store';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class OAuthService {
  constructor(
    private readonly invitesService: InvitesService,
    private readonly xApi: XApiService,
    private readonly stateStore: OAuthStateStore,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly config: ConfigService,
    private readonly webhooksService: WebhooksService,
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
  ) {}

  async startOAuth(inviteToken: string, res: Response): Promise<void> {
    const invite = await this.invitesService.findValidInviteByToken(inviteToken);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const stateId = generateStateId();

    await this.stateStore.save(stateId, {
      inviteToken,
      codeVerifier,
      orgId: invite.orgId.toString(),
    });

    const url = this.xApi.buildBrowserAuthorizeUrl({
      state: stateId,
      codeChallenge,
    });
    res.redirect(url);
  }

  async handleCallback(
    query: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    },
    res: Response,
  ): Promise<void> {
    if (query.error) {
      const message = query.error_description ?? query.error;
      if (this.redirectOAuthResult(res, { error: query.error, error_description: message })) {
        return;
      }
      throw new BadRequestException(message);
    }

    if (!query.code || !query.state) {
      if (this.redirectOAuthResult(res, { error: 'invalid_request', error_description: 'Missing code or state' })) {
        return;
      }
      throw new BadRequestException('Missing code or state');
    }

    const statePayload = await this.stateStore.consume(query.state);
    if (!statePayload) {
      if (this.redirectOAuthResult(res, { error: 'invalid_state', error_description: 'Invalid or expired OAuth state' })) {
        return;
      }
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const invite = await this.invitesService.findValidInviteByToken(
      statePayload.inviteToken,
    );

    const tokens = await this.xApi.exchangeCodeForTokens(
      query.code,
      statePayload.codeVerifier,
    );
    const xUser = await this.xApi.fetchCurrentUser(tokens.access_token);

    const tokenExpiresAt =
      tokens.expires_in !== undefined
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined;

    const scopes = tokens.scope?.split(' ').filter(Boolean) ?? [];

    const connection = await this.connectionModel.findOneAndUpdate(
      { orgId: invite.orgId, xUserId: xUser.id },
      {
        $set: {
          orgId: invite.orgId,
          xUserId: xUser.id,
          xUsername: xUser.username,
          scopes,
          accessTokenEnc: this.tokenCrypto.encrypt(tokens.access_token),
          refreshTokenEnc: tokens.refresh_token
            ? this.tokenCrypto.encrypt(tokens.refresh_token)
            : undefined,
          tokenExpiresAt,
          connectedAt: new Date(),
        },
        $unset: { revokedAt: 1 },
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (!connection) {
      throw new InternalServerErrorException('Failed to save X connection');
    }

    const webhook = await this.webhooksService.registerForConnection(connection);

    await this.invitesService.incrementUseCount(invite._id);

    const result = {
      orgId: invite.orgId.toString(),
      xUserId: xUser.id,
      xUsername: xUser.username,
      webhookId: webhook.webhookId,
      webhookUrl: webhook.webhookUrl,
    };

    const successRedirect = this.config.get<string>('OAUTH_SUCCESS_REDIRECT_URL');
    if (successRedirect) {
      const url = new URL(successRedirect);
      url.searchParams.set('orgId', result.orgId);
      url.searchParams.set('xUserId', result.xUserId);
      url.searchParams.set('xUsername', result.xUsername);
      url.searchParams.set('webhookId', result.webhookId);
      url.searchParams.set('webhookUrl', result.webhookUrl);
      url.searchParams.set('invite', statePayload.inviteToken);
      res.redirect(url.toString());
      return;
    }

    res.json(result);
  }

  /** Sends the browser to the frontend success page when OAUTH_SUCCESS_REDIRECT_URL is set. */
  private redirectOAuthResult(
    res: Response,
    params: Record<string, string | undefined>,
  ): boolean {
    const successRedirect = this.config.get<string>('OAUTH_SUCCESS_REDIRECT_URL');
    if (!successRedirect) {
      return false;
    }
    const url = new URL(successRedirect);
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
    res.redirect(url.toString());
    return true;
  }
}
