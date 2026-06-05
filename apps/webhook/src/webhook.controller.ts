import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  getXConsumerSecret,
  getXConsumerSecretSource,
} from './config/consumer-secret.util';
import { IncomingService } from './incoming/incoming.service';
import { createCrcResponse, verifyWebhookSignature } from './x-webhook.crypto';
import { isXActivityWebhookPayload } from '@app/shared';

@Controller()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly incomingService: IncomingService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  health() {
    return { status: 'ok' };
  }

  @Get(['webhooks/incoming', 'webhooks/incoming/'])
  handleCrc(@Query('crc_token') crcToken: string | undefined) {
    if (!crcToken) {
      throw new BadRequestException('Missing crc_token query parameter');
    }

    const consumerSecret = getXConsumerSecret(this.config);
    return createCrcResponse(crcToken, consumerSecret);
  }

  @Post('webhooks/incoming')
  @HttpCode(200)
  async receive(
    @Headers('x-twitter-webhooks-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody;
    this.logger.log(
      `X webhook POST received (${rawBody && Buffer.isBuffer(rawBody) ? rawBody.length : 0} bytes, signature=${signature ? 'present' : 'missing'})`,
    );

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new BadRequestException('Missing raw request body');
    }

    const consumerSecret = getXConsumerSecret(this.config);
    try {
      verifyWebhookSignature(rawBody, signature, consumerSecret);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        this.logger.error(
          `X webhook signature verification failed (using ${getXConsumerSecretSource(this.config)}, ` +
            `${rawBody.length} byte body). On Webhook service set X_API_KEY_SECRET to the same ` +
            `OAuth 1.0 API Key Secret as Hub; remove X_CLIENT_SECRET.`,
        );
      }
      throw err;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }

    const eventKeys = Object.keys(parsed).filter((k) => k !== 'for_user_id');
    const xaaEventType =
      isXActivityWebhookPayload(parsed) &&
      parsed.data &&
      typeof parsed.data === 'object' &&
      !Array.isArray(parsed.data)
        ? String((parsed.data as Record<string, unknown>).event_type ?? 'unknown')
        : 'n/a';
    this.logger.log(
      `X webhook payload for_user_id=${String(parsed.for_user_id ?? 'missing')} ` +
        `xaa_event_type=${xaaEventType} keys=[${eventKeys.join(', ')}]`,
    );

    const result = await this.incomingService.processIncomingPayload(parsed);

    this.logger.log(
      `X webhook processed → ${result.eventIds.length} NATS event(s)`,
    );

    return {
      received: true,
      eventIds: result.eventIds,
      count: result.eventIds.length,
    };
  }
}
