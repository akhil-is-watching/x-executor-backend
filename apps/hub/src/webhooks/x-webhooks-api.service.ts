import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_GLOBAL_PREFIX } from '@app/shared';
import { TwitterApi } from 'twitter-api-v2';
import {
  parseActivitySubscriptionId,
  type XActivityDmInboundEventType,
  type XActivitySubscription,
  type XActivitySubscriptionCreateRequest,
  type XActivitySubscriptionCreateResponse,
  type XActivitySubscriptionIds,
  type XActivitySubscriptionListResponse,
} from './x-activity.types';

export type { XActivitySubscriptionIds } from './x-activity.types';

interface XWebhookConfig {
  id: string;
  url: string;
  valid?: boolean;
}

interface XWebhookCrcResult {
  data?: { attempted?: boolean };
}

@Injectable()
export class XWebhooksApiService {
  private readonly logger = new Logger(XWebhooksApiService.name);

  constructor(private readonly config: ConfigService) {}

  /** Enabled by default; set X_REGISTER_WEBHOOKS_WITH_X=false to disable. */
  isEnabled(): boolean {
    return this.config.get<string>('X_REGISTER_WEBHOOKS_WITH_X') !== 'false';
  }

  getSharedWebhookUrl(): string {
    const base = this.config
      .getOrThrow<string>('WEBHOOK_PUBLIC_BASE_URL')
      .replace(/\/$/, '');
    return `${base}/${API_GLOBAL_PREFIX}/webhook/incoming`;
  }

  async ensureAppWebhookRegistered(): Promise<string> {
    const preset = this.config.get<string>('X_WEBHOOK_CONFIG_ID');
    if (preset) {
      return preset;
    }

    const webhookUrl = this.getSharedWebhookUrl();
    const appClient = await this.getAppOnlyClient();
    const config = await this.ensureWebhookConfig(webhookUrl, appClient);
    this.logger.log(
      `X app webhook config ${config.id} for ${webhookUrl} (valid=${String(config.valid ?? 'unknown')})`,
    );
    if (config.valid === false) {
      this.logger.warn(
        `Webhook ${config.id} is invalid on X — triggering CRC re-validation`,
      );
      await this.triggerWebhookCrc(config.id, appClient);
    }
    return config.id;
  }

  /** PUT /2/webhooks/:id — X sends CRC GET; webhook must pass to receive events. */
  async triggerWebhookCrc(
    xWebhookConfigId: string,
    appClient?: TwitterApi,
  ): Promise<void> {
    const client = appClient ?? (await this.getAppOnlyClient());
    try {
      const res = await client.v2.put<XWebhookCrcResult>(
        `webhooks/${xWebhookConfigId}`,
      );
      this.logger.log(
        `X CRC re-validation for webhook ${xWebhookConfigId}: ${JSON.stringify(res.data ?? res)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`X CRC re-validation failed: ${message}`);
      throw err;
    }
  }

  /**
   * Subscribe a user to X Activity API DM events (dm.received + chat.received).
   * Requires OAuth 1.0a user tokens for private event types.
   */
  async subscribeUser(
    xWebhookConfigId: string,
    xUserId: string,
    accessToken: string,
    accessTokenSecret: string,
  ): Promise<XActivitySubscriptionIds> {
    const appKey = this.config.getOrThrow<string>('X_API_KEY');
    const appSecret = this.config.getOrThrow<string>('X_API_KEY_SECRET');
    const userClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret: accessTokenSecret,
    });

    try {
      const dmSubscriptionId = await this.createActivitySubscription(
        userClient,
        xWebhookConfigId,
        xUserId,
        'dm.received',
      );
      const chatSubscriptionId = await this.createActivitySubscription(
        userClient,
        xWebhookConfigId,
        xUserId,
        'chat.received',
      );

      this.logger.log(
        `X Activity subscriptions for user ${xUserId} on webhook ${xWebhookConfigId}: ` +
          `dm=${dmSubscriptionId}, chat=${chatSubscriptionId}`,
      );

      return { dmSubscriptionId, chatSubscriptionId };
    } catch (err: unknown) {
      const xData = (err as Record<string, unknown>)['data'];
      const detail = err instanceof Error ? err.message : String(err);
      const status = (err as { code?: number })?.code;
      if (status === 403) {
        throw new Error(
          `X Activity API subscription failed (403 Forbidden). ` +
            `Check that your X app has X Activity API access in the Developer Portal ` +
            `(https://docs.x.com/x-api/activity/introduction). data: ${JSON.stringify(xData ?? '')}`,
        );
      }
      throw new Error(
        `X Activity API subscription failed: ${detail} | data: ${JSON.stringify(xData ?? '')}`,
      );
    }
  }

  /** Lists active X Activity API subscriptions (app bearer). */
  async listSubscriptions(): Promise<XActivitySubscription[]> {
    const appClient = await this.getAppOnlyClient();
    try {
      const res = await appClient.v2.get<
        XActivitySubscription[] | XActivitySubscriptionListResponse
      >('activity/subscriptions');
      if (Array.isArray(res)) {
        return res;
      }
      return res.data ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`X Activity list subscriptions failed: ${message}`);
      return [];
    }
  }

  /** Remove X Activity API subscriptions by subscription ID (app bearer). */
  async unsubscribeUser(
    dmSubscriptionId: string | undefined,
    chatSubscriptionId: string | undefined,
  ): Promise<void> {
    const appClient = await this.getAppOnlyClient();
    const ids = [dmSubscriptionId, chatSubscriptionId].filter(
      (id): id is string => Boolean(id),
    );

    for (const subscriptionId of ids) {
      try {
        await appClient.v2.delete(`activity/subscriptions/${subscriptionId}`);
        this.logger.log(`X Activity subscription deleted: ${subscriptionId}`);
      } catch (err: unknown) {
        const status = (err as { code?: number })?.code;
        if (status === 404) {
          continue;
        }
        const xData = (err as Record<string, unknown>)['data'];
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          `X Activity API unsubscribe failed for ${subscriptionId}: ${detail} | data: ${JSON.stringify(xData ?? '')}`,
        );
      }
    }
  }

  private async createActivitySubscription(
    userClient: TwitterApi,
    xWebhookConfigId: string,
    xUserId: string,
    eventType: XActivityDmInboundEventType,
  ): Promise<string> {
    const body: XActivitySubscriptionCreateRequest = {
      event_type: eventType,
      filter: {
        user_id: xUserId,
      },
      webhook_id: xWebhookConfigId,
    };

    const res = await userClient.v2.post<XActivitySubscriptionCreateResponse>(
      'activity/subscriptions',
      body,
    );

    const subscriptionId = parseActivitySubscriptionId(res);
    if (!subscriptionId) {
      throw new Error(
        `X Activity API create subscription (${eventType}) returned no subscription_id`,
      );
    }

    return subscriptionId;
  }

  private async getAppOnlyClient(): Promise<TwitterApi> {
    const appKey = this.config.getOrThrow<string>('X_API_KEY');
    const appSecret = this.config.getOrThrow<string>('X_API_KEY_SECRET');
    const userClient = new TwitterApi({ appKey, appSecret });
    return userClient.appLogin();
  }

  private async ensureWebhookConfig(
    webhookUrl: string,
    appClient: TwitterApi,
  ): Promise<XWebhookConfig> {
    const existing = await this.findWebhookConfigByUrl(webhookUrl, appClient);
    if (existing) {
      return existing;
    }

    const res = await appClient.v2.post<{ data?: XWebhookConfig }>(
      'webhooks',
      { url: webhookUrl },
    );

    if (!res.data?.id) {
      throw new Error('X register webhook returned no config id');
    }
    return res.data;
  }

  private async findWebhookConfigByUrl(
    webhookUrl: string,
    appClient: TwitterApi,
  ): Promise<XWebhookConfig | null> {
    try {
      const res = await appClient.v2.get<{
        data?: XWebhookConfig[];
      }>('webhooks');
      return res.data?.find((w) => w.url === webhookUrl) ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`X list webhooks failed: ${message}`);
      return null;
    }
  }
}
