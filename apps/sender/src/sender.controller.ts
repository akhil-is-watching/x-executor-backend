import { Controller, Get } from '@nestjs/common';

@Controller()
export class SenderController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
