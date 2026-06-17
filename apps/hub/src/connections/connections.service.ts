import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RedisService } from '@app/redis';
import { XConnection, XConnectionDocument } from '../schemas/x-connection.schema';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { XApiService } from '../oauth/x-api.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { ProxyPoolService } from '../proxy/proxy-pool.service';

export const XCHAT_SECRET_REDIS_PREFIX = 'xchat:secret:';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly webhooksService: WebhooksService,
    private readonly xApi: XApiService,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly redis: RedisService,
    private readonly proxyPool: ProxyPoolService,
  ) {}

  async listForOrg(orgId: string) {
    const connections = await this.connectionModel
      .find({
        orgId: new Types.ObjectId(orgId),
        revokedAt: null,
      })
      .sort({ connectedAt: -1 });

    const webhookByConnection =
      await this.webhooksService.getWebhookMetadataByConnectionIds(
        connections.map((c) => c._id),
      );

    return connections.map((c) => {
      const webhook = webhookByConnection.get(c._id.toString());
      return {
        id: c._id.toString(),
        xUserId: c.xUserId,
        xUsername: c.xUsername,
        scopes: c.scopes,
        connectedAt: c.connectedAt,
        tokenExpiresAt: c.tokenExpiresAt,
        webhookUrl: webhook?.webhookUrl ?? this.webhooksService.getSharedWebhookUrl(),
        subscribed: webhook?.subscribed ?? false,
        hasAuthToken: Boolean(c.authTokenEnc),
        hasXchatPin: Boolean(c.xchatPinEnc),
      };
    });
  }

  async setXchatPin(orgId: string, connectionId: string, pin: string) {
    const connection = await this.connectionModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(connectionId),
        orgId: new Types.ObjectId(orgId),
        revokedAt: null,
      },
      {
        $set: { xchatPinEnc: this.tokenCrypto.encrypt(pin) },
      },
      { returnDocument: 'after' },
    );
    if (!connection) {
      throw new NotFoundException('Connection not found');
    }
    // Invalidate L3 cache so processor re-unlocks immediately with new PIN
    await this.redis.del(`${XCHAT_SECRET_REDIS_PREFIX}${connection.xUserId}`);
    return { updated: true, hasXchatPin: true };
  }

  async setAuthToken(orgId: string, connectionId: string, authToken: string) {
    const connection = await this.connectionModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(connectionId),
        orgId: new Types.ObjectId(orgId),
        revokedAt: null,
      },
      {
        $set: {
          authTokenEnc: this.tokenCrypto.encrypt(authToken),
        },
      },
      { returnDocument: 'after' },
    );
    if (!connection) {
      throw new NotFoundException('Connection not found');
    }
    return { updated: true, hasAuthToken: true };
  }

  async revoke(orgId: string, connectionId: string) {
    const connection = await this.connectionModel.findOne({
      _id: new Types.ObjectId(connectionId),
      orgId: new Types.ObjectId(orgId),
      revokedAt: null,
    });
    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    await this.webhooksService.revokeForConnection(connection);
    await this.logoutOAuthConnection(connection);
    await this.redis.del(`${XCHAT_SECRET_REDIS_PREFIX}${connection.xUserId}`);
    await this.proxyPool.releaseForConnection(connection.xUserId);

    await this.connectionModel.updateOne(
      { _id: connection._id },
      {
        $set: { revokedAt: new Date() },
        $unset: {
          accessTokenEnc: 1,
          accessTokenSecretEnc: 1,
          authTokenEnc: 1,
          xchatPinEnc: 1,
          proxyUrlEnc: 1,
          refreshTokenEnc: 1,
          tokenExpiresAt: 1,
        },
      },
    );

    return { revoked: true };
  }

  private async logoutOAuthConnection(
    connection: XConnectionDocument,
  ): Promise<void> {
    if (!connection.accessTokenEnc || !connection.accessTokenSecretEnc) {
      return;
    }

    try {
      const accessToken = this.tokenCrypto.decrypt(connection.accessTokenEnc);
      const accessTokenSecret = this.tokenCrypto.decrypt(
        connection.accessTokenSecretEnc,
      );
      await this.xApi.invalidateOAuth1AccessToken(accessToken, accessTokenSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `X OAuth logout failed for @${connection.xUsername}: ${message}`,
      );
    }
  }
}
