import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class SchedulerController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
