import { Controller, Get } from '@nestjs/common';

@Controller('scheduler/health')
export class SchedulerController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
