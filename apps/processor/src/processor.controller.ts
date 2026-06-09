import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class ProcessorController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
