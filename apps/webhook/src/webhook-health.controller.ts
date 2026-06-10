import { Controller, Get } from '@nestjs/common';
import { WEBHOOK_HEALTH_PATH } from '@app/shared';

@Controller(WEBHOOK_HEALTH_PATH)
export class WebhookHealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
