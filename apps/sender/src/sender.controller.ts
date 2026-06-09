import { Controller, Get } from '@nestjs/common';

@Controller('sender/health')
export class SenderController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
