import { Controller, Get } from '@nestjs/common';

@Controller()
export class SchedulerController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
