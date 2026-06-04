import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@app/redis';
import { GetxapiRateLimiterService } from './getxapi-rate-limiter.service';
import { GetxapiService } from './getxapi.service';

@Global()
@Module({
  imports: [ConfigModule, RedisModule],
  providers: [GetxapiRateLimiterService, GetxapiService],
  exports: [GetxapiService],
})
export class GetxapiModule {}
