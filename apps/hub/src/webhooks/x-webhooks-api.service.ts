import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface XWebhookConfig {
  id: string;
  url: string;
  valid?: boolean;
}

interface XWebhooksListResponse {
  data?: XWebhookConfig[];
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
    return `${base}/api/v1/webhooks/incoming`;
  }

  async ensureAppWebhookRegistered(): Promise<string> {
    const preset = this.config.get<string>('X_WEBHOOK_CONFIG_ID');
    if (preset) {
      return preset;
    }

    const webhookUrl = this.getSharedWebhookUrl();
    const appBearer = await this.getAppBearerToken();
    const config = await this.ensureWebhookConfig(webhookUrl, appBearer);
    this.logger.log(`X app webhook config ${config.id} for ${webhookUrl}`);
    return config.id;
  }

  async subscribeUser(
    xWebhookConfigId: string,
    userAccessToken: string,
  ): Promise<void> {
    const response = await fetch(
      `https://api.twitter.com/2/account_activity/webhooks/${encodeURIComponent(xWebhookConfigId)}/subscriptions/all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `X account activity subscription failed (${response.status}): ${body}`,
      );
    }
  }

  async unsubscribeUser(
    xWebhookConfigId: string,
    userAccessToken: string,
    xUserId: string,
  ): Promise<void> {
    const response = await fetch(
      `https://api.twitter.com/2/account_activity/webhooks/${encodeURIComponent(xWebhookConfigId)}/subscriptions/${encodeURIComponent(xUserId)}/all`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(
        `X account activity unsubscribe failed (${response.status}): ${body}`,
      );
    }
  }

  private async getAppBearerToken(): Promise<string> {
    const clientId = this.config.getOrThrow<string>('X_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('X_CLIENT_SECRET');
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`X app bearer token failed (${response.status}): ${body}`);
    }

    const json = (await response.json()) as { access_token: string };
    return json.access_token;
  }

  private async ensureWebhookConfig(
    webhookUrl: string,
    appBearer: string,
  ): Promise<XWebhookConfig> {
    const existing = await this.findWebhookConfigByUrl(webhookUrl, appBearer);
    if (existing) {
      return existing;
    }

    const response = await fetch('https://api.twitter.com/2/webhooks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appBearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: webhookUrl }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`X register webhook failed (${response.status}): ${body}`);
    }

    const json = (await response.json()) as { data?: XWebhookConfig };
    if (!json.data?.id) {
      throw new Error('X register webhook returned no config id');
    }
    return json.data;
  }

  private async findWebhookConfigByUrl(
    webhookUrl: string,
    appBearer: string,
  ): Promise<XWebhookConfig | null> {
    const response = await fetch('https://api.twitter.com/2/webhooks', {
      headers: { Authorization: `Bearer ${appBearer}` },
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.warn(`X list webhooks failed (${response.status}): ${body}`);
      return null;
    }

    const json = (await response.json()) as XWebhooksListResponse;
    return json.data?.find((w) => w.url === webhookUrl) ?? null;
  }
}
