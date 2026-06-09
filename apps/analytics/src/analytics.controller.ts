import { Controller, Get } from '@nestjs/common';

@Controller('analytics/health')
export class AnalyticsController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
