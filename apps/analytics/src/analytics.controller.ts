import { Controller, Get } from '@nestjs/common';
import { ANALYTICS_HEALTH_PATH } from '@app/shared';

@Controller(ANALYTICS_HEALTH_PATH)
export class AnalyticsController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
