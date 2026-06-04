import { Injectable } from '@nestjs/common';

@Injectable()
export class SenderService {
  getHello(): string {
    return 'Hello World!';
  }
}
