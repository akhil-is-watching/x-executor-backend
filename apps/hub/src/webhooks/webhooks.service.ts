import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import {
  ConnectionWebhook,
  ConnectionWebhookDocument,
} from '../schemas/connection-webhook.schema';
import { XConnectionDocument } from '../schemas/x-connection.schema';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { generateOpaqueToken } from '../crypto/pkce.util';

export interface RegisteredWebhook {
  webhookId: string;
  webhookUrl: string;
  webhookSecret: string;
}

@Injectable()
export class WebhooksService {
  constructor(
    @InjectModel(ConnectionWebhook.name)
    private readonly webhookModel: Model<ConnectionWebhookDocument>,
    private readonly config: ConfigService,
    private readonly tokenCrypto: TokenCryptoService,
  ) {}

  async registerForConnection(
    connection: XConnectionDocument,
  ): Promise<RegisteredWebhook> {
    await this.revokeForConnection(connection._id);

    const webhookId = generateOpaqueToken();
    const webhookSecret = randomBytes(32).toString('base64url');
    const webhookUrl = this.buildWebhookUrl(webhookId);

    await this.webhookModel.create({
      connectionId: connection._id,
      orgId: connection.orgId,
      webhookId,
      secretEnc: this.tokenCrypto.encrypt(webhookSecret),
      webhookUrl,
      active: true,
    });

    return { webhookId, webhookUrl, webhookSecret };
  }

  async revokeForConnection(connectionId: Types.ObjectId): Promise<void> {
    await this.webhookModel.updateMany(
      {
        connectionId,
        active: true,
        revokedAt: null,
      },
      {
        $set: { active: false, revokedAt: new Date() },
      },
    );
  }

  async findActiveByWebhookId(
    webhookId: string,
  ): Promise<ConnectionWebhookDocument | null> {
    return this.webhookModel.findOne({
      webhookId,
      active: true,
      revokedAt: null,
    });
  }

  async getWebhookMetadataForConnection(
    connectionId: Types.ObjectId,
  ): Promise<{ webhookId: string; webhookUrl: string } | null> {
    const webhook = await this.webhookModel.findOne({
      connectionId,
      active: true,
      revokedAt: null,
    });
    if (!webhook) {
      return null;
    }
    return {
      webhookId: webhook.webhookId,
      webhookUrl: webhook.webhookUrl,
    };
  }

  async getWebhookMetadataByConnectionIds(
    connectionIds: Types.ObjectId[],
  ): Promise<Map<string, { webhookId: string; webhookUrl: string }>> {
    const webhooks = await this.webhookModel.find({
      connectionId: { $in: connectionIds },
      active: true,
      revokedAt: null,
    });
    return new Map(
      webhooks.map((w) => [
        w.connectionId.toString(),
        { webhookId: w.webhookId, webhookUrl: w.webhookUrl },
      ]),
    );
  }

  buildWebhookUrl(webhookId: string): string {
    const base = this.config
      .getOrThrow<string>('WEBHOOK_PUBLIC_BASE_URL')
      .replace(/\/$/, '');
    return `${base}/api/v1/webhooks/incoming/${encodeURIComponent(webhookId)}`;
  }
}
