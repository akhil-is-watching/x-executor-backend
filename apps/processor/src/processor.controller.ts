import { Controller, Get } from '@nestjs/common';

@Controller('processor/health')
export class ProcessorController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
