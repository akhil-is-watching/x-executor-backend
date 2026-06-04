import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwitterApi } from 'twitter-api-v2';

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
    return `${base}/api/v1/webhooks/incoming`;
  }

  async ensureAppWebhookRegistered(): Promise<string> {
    const preset = this.config.get<string>('X_WEBHOOK_CONFIG_ID');
    if (preset) {
      return preset;
    }

    const webhookUrl = this.getSharedWebhookUrl();
    const appClient = await this.getAppOnlyClient();
    const config = await this.ensureWebhookConfig(webhookUrl, appClient);
    this.logger.log(`X app webhook config ${config.id} for ${webhookUrl}`);
    return config.id;
  }

  async subscribeUser(
    xWebhookConfigId: string,
    userAccessToken: string,
  ): Promise<void> {
    const userClient = new TwitterApi(userAccessToken);
    await userClient.v2.post(
      `account_activity/webhooks/${xWebhookConfigId}/subscriptions/all`,
      {},
    );
  }

  async unsubscribeUser(
    xWebhookConfigId: string,
    userAccessToken: string,
    xUserId: string,
  ): Promise<void> {
    const userClient = new TwitterApi(userAccessToken);
    try {
      await userClient.v2.delete(
        `account_activity/webhooks/${xWebhookConfigId}/subscriptions/${xUserId}/all`,
      );
    } catch (err: unknown) {
      const status = (err as { code?: number })?.code;
      if (status !== 404) {
        throw err;
      }
    }
  }

  private async getAppOnlyClient(): Promise<TwitterApi> {
    const appKey = this.config.getOrThrow<string>('X_CLIENT_ID');
    const appSecret = this.config.getOrThrow<string>('X_CLIENT_SECRET');
    const userClient = new TwitterApi({ appKey, appSecret });
    return userClient.appLogin();
  }

  private async ensureWebhookConfig(
    webhookUrl: string,
    appClient: TwitterApi,
  ): Promise<{ id: string; url: string }> {
    const existing = await this.findWebhookConfigByUrl(webhookUrl, appClient);
    if (existing) {
      return existing;
    }

    const res = await appClient.v2.post<{ data?: { id: string; url: string } }>(
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
  ): Promise<{ id: string; url: string } | null> {
    try {
      const res = await appClient.v2.get<{
        data?: { id: string; url: string }[];
      }>('webhooks');
      return res.data?.find((w) => w.url === webhookUrl) ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`X list webhooks failed: ${message}`);
      return null;
    }
  }
}
