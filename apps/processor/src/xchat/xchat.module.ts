import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@app/redis';
import { XChatDecryptService } from './xchat-decrypt.service';

@Module({
  imports: [RedisModule, ConfigModule],
  providers: [XChatDecryptService],
  exports: [XChatDecryptService],
})
export class XChatModule {}
