import { Controller, Get } from '@nestjs/common';
import { PROCESSOR_HEALTH_PATH } from '@app/shared';

@Controller(PROCESSOR_HEALTH_PATH)
export class ProcessorController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
