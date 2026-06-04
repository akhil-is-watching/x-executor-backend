import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { IncomingService } from './incoming/incoming.service';
import { createCrcResponse, verifyWebhookSignature } from './x-webhook.crypto';

@Controller()
export class WebhookController {
  constructor(
    private readonly incomingService: IncomingService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  health() {
    return { status: 'ok' };
  }

  @Get('webhooks/incoming')
  handleCrc(@Query('crc_token') crcToken: string | undefined) {
    if (!crcToken) {
      throw new BadRequestException('Missing crc_token query parameter');
    }

    const consumerSecret = this.config.getOrThrow<string>('X_CLIENT_SECRET');
    return createCrcResponse(crcToken, consumerSecret);
  }

  @Post('webhooks/incoming')
  @HttpCode(200)
  async receive(
    @Headers('x-twitter-webhooks-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new BadRequestException('Missing raw request body');
    }

    const consumerSecret = this.config.getOrThrow<string>('X_CLIENT_SECRET');
    verifyWebhookSignature(rawBody, signature, consumerSecret);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid JSON body');
    }

    const result = await this.incomingService.processIncomingPayload(parsed);

    return {
      received: true,
      eventIds: result.eventIds,
      count: result.eventIds.length,
    };
  }
}
