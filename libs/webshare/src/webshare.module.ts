import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebshareService } from './webshare.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [WebshareService],
  exports: [WebshareService],
})
export class WebshareModule {}
