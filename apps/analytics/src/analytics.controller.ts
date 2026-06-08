import { Controller, Get } from '@nestjs/common';

@Controller()
export class AnalyticsController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
