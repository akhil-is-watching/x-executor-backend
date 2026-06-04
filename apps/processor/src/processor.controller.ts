import { Controller, Get } from '@nestjs/common';

@Controller()
export class ProcessorController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
