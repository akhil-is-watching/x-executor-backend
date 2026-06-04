import { Controller, Get } from '@nestjs/common';
import { SenderService } from './sender.service';

@Controller()
export class SenderController {
  constructor(private readonly senderService: SenderService) {}

  @Get()
  getHello(): string {
    return this.senderService.getHello();
  }
}
