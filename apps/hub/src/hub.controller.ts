import { Controller, Get } from '@nestjs/common';

@Controller()
export class HubController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
