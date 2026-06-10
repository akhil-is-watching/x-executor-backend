import { Controller, Get } from '@nestjs/common';
import { SENDER_HEALTH_PATH } from '@app/shared';

@Controller(SENDER_HEALTH_PATH)
export class SenderController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
