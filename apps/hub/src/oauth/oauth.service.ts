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
    const redirectUri = this.config.getOrThrow<string>('X_REDIRECT_URI');

    const requestToken = await this.xApi.getRequestToken(redirectUri);

    await this.stateStore.save(requestToken.oauthToken, {
      inviteToken,
      oauthTokenSecret: requestToken.oauthTokenSecret,
      orgId: invite.orgId.toString(),
    });

    res.redirect(requestToken.authUrl);
  }

  async handleCallback(
    query: {
      oauth_token?: string;
      oauth_verifier?: string;
      denied?: string;
      error?: string;
      error_description?: string;
    },
    res: Response,
  ): Promise<void> {
    if (query.denied || query.error) {
      const message =
        query.error_description ?? query.error ?? 'User denied authorization';
      if (
        this.redirectOAuthResult(res, {
          error: query.error ?? 'access_denied',
          error_description: message,
        })
      ) {
        return;
      }
      throw new BadRequestException(message);
    }

    if (!query.oauth_token || !query.oauth_verifier) {
      if (
        this.redirectOAuthResult(res, {
          error: 'invalid_request',
          error_description: 'Missing oauth_token or oauth_verifier',
        })
      ) {
        return;
      }
      throw new BadRequestException('Missing oauth_token or oauth_verifier');
    }

    const statePayload = await this.stateStore.consume(query.oauth_token);
    if (!statePayload) {
      if (
        this.redirectOAuthResult(res, {
          error: 'invalid_state',
          error_description: 'Invalid or expired OAuth state',
        })
      ) {
        return;
      }
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const invite = await this.invitesService.findValidInviteByToken(
      statePayload.inviteToken,
    );

    const tokens = await this.xApi.exchangeVerifierForTokens(
      query.oauth_token,
      statePayload.oauthTokenSecret,
      query.oauth_verifier,
    );

    const connection = await this.connectionModel.findOneAndUpdate(
      { orgId: invite.orgId, xUserId: tokens.userId },
      {
        $set: {
          orgId: invite.orgId,
          xUserId: tokens.userId,
          xUsername: tokens.screenName,
          scopes: [],
          accessTokenEnc: this.tokenCrypto.encrypt(tokens.accessToken),
          accessTokenSecretEnc: this.tokenCrypto.encrypt(tokens.accessTokenSecret),
          connectedAt: new Date(),
        },
        $unset: { revokedAt: 1, refreshTokenEnc: 1, tokenExpiresAt: 1 },
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (!connection) {
      throw new InternalServerErrorException('Failed to save X connection');
    }

    const subscription = await this.webhooksService.subscribeForConnection(
      connection,
      tokens.accessToken,
      tokens.accessTokenSecret,
    );

    await this.invitesService.incrementUseCount(invite._id);

    const result = {
      orgId: invite.orgId.toString(),
      xUserId: tokens.userId,
      xUsername: tokens.screenName,
      webhookUrl: subscription.webhookUrl,
      subscribed: subscription.subscribed,
    };

    const successRedirect = this.config.get<string>('OAUTH_SUCCESS_REDIRECT_URL');
    if (successRedirect) {
      const url = new URL(successRedirect);
      url.searchParams.set('orgId', result.orgId);
      url.searchParams.set('xUserId', result.xUserId);
      url.searchParams.set('xUsername', result.xUsername);
      url.searchParams.set('webhookUrl', result.webhookUrl);
      url.searchParams.set('subscribed', String(result.subscribed));
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
