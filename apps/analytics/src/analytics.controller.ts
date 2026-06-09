import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AnalyticsController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
