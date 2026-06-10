import { Controller, Get } from '@nestjs/common';
import { SCHEDULER_HEALTH_PATH } from '@app/shared';

@Controller(SCHEDULER_HEALTH_PATH)
export class SchedulerController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
