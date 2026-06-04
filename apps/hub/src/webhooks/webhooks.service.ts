import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConnectionWebhook,
  ConnectionWebhookDocument,
} from '../schemas/connection-webhook.schema';
import { XConnectionDocument } from '../schemas/x-connection.schema';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { XWebhooksApiService } from './x-webhooks-api.service';

export interface ConnectionSubscriptionResult {
  webhookUrl: string;
  subscribed: boolean;
  xWebhookConfigId?: string;
}

@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(ConnectionWebhook.name)
    private readonly webhookModel: Model<ConnectionWebhookDocument>,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly xWebhooksApi: XWebhooksApiService,
  ) {}

  /** Drop legacy webhookId_1 unique index left over from the old per-URL schema. */
  async onModuleInit(): Promise<void> {
    try {
      const indexes = await this.webhookModel.collection.indexes();
      const hasLegacy = indexes.some((idx) => idx.name === 'webhookId_1');
      if (hasLegacy) {
        await this.webhookModel.collection.dropIndex('webhookId_1');
        this.logger.log('Dropped legacy webhookId_1 index from connection_webhooks');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not drop legacy webhookId_1 index: ${message}`);
    }
  }

  getSharedWebhookUrl(): string {
    return this.xWebhooksApi.getSharedWebhookUrl();
  }

  /**
   * Marks the connection subscribed to the app-wide X webhook (Account Activity).
   */
  async subscribeForConnection(
    connection: XConnectionDocument,
    accessToken: string,
    accessTokenSecret: string,
  ): Promise<ConnectionSubscriptionResult> {
    const webhookUrl = this.getSharedWebhookUrl();
    await this.revokeForConnection(connection);

    let xWebhookConfigId: string | undefined;
    let subscribed = false;

    if (this.xWebhooksApi.isEnabled()) {
      try {
        xWebhookConfigId = await this.xWebhooksApi.ensureAppWebhookRegistered();
        await this.xWebhooksApi.subscribeUser(
          xWebhookConfigId,
          accessToken,
          accessTokenSecret,
        );
        subscribed = true;
        const userIds = await this.xWebhooksApi.listSubscriptions(xWebhookConfigId);
        this.logger.log(
          `@${connection.xUsername} subscribed to webhook ${xWebhookConfigId}; ` +
            `X reports ${userIds.length} subscription(s): [${userIds.join(', ')}]`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `X subscription failed for @${connection.xUsername} (connection saved): ${message}`,
        );
      }
    }

    if (subscribed && xWebhookConfigId) {
      await this.webhookModel.create({
        connectionId: connection._id,
        orgId: connection.orgId,
        xWebhookConfigId,
        subscribedAt: new Date(),
        active: true,
      });
    }

    return {
      webhookUrl,
      subscribed,
      xWebhookConfigId,
    };
  }

  async revokeForConnection(connection: XConnectionDocument): Promise<void> {
    const active = await this.webhookModel.findOne({
      connectionId: connection._id,
      active: true,
      revokedAt: null,
    });

    if (active?.xWebhookConfigId && this.xWebhooksApi.isEnabled()) {
      try {
        await this.xWebhooksApi.unsubscribeUser(
          active.xWebhookConfigId,
          connection.xUserId,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `X unsubscribe failed for @${connection.xUsername}: ${message}`,
        );
      }
    }

    await this.webhookModel.updateMany(
      {
        connectionId: connection._id,
        active: true,
        revokedAt: null,
      },
      {
        $set: { active: false, revokedAt: new Date() },
      },
    );
  }

  async getWebhookMetadataForConnection(
    connectionId: Types.ObjectId,
  ): Promise<{ webhookUrl: string; subscribed: boolean } | null> {
    const webhook = await this.webhookModel.findOne({
      connectionId,
      active: true,
      revokedAt: null,
    });
    if (!webhook) {
      return null;
    }
    return {
      webhookUrl: this.getSharedWebhookUrl(),
      subscribed: true,
    };
  }

  async getWebhookMetadataByConnectionIds(
    connectionIds: Types.ObjectId[],
  ): Promise<Map<string, { webhookUrl: string; subscribed: boolean }>> {
    const webhooks = await this.webhookModel.find({
      connectionId: { $in: connectionIds },
      active: true,
      revokedAt: null,
    });
    const sharedUrl = this.getSharedWebhookUrl();
    return new Map(
      webhooks.map((w) => [
        w.connectionId.toString(),
        { webhookUrl: sharedUrl, subscribed: true },
      ]),
    );
  }
}
