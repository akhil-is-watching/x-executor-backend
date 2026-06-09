import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class SenderController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
