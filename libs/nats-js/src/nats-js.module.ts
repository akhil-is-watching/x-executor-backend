import { Module } from '@nestjs/common';
import { NatsJsService } from './nats-js.service';

@Module({
  providers: [NatsJsService],
  exports: [NatsJsService],
})
export class NatsJsModule {}
