import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebshareModule } from '@app/webshare';
import { RedisModule } from '@app/redis';
import { CryptoModule } from '../crypto/crypto.module';
import { ProxyPoolService } from './proxy-pool.service';
import {
  ProxyAssignment,
  ProxyAssignmentSchema,
} from '../schemas/proxy-assignment.schema';
import {
  XConnection,
  XConnectionSchema,
} from '../schemas/x-connection.schema';

@Module({
  imports: [
    WebshareModule,
    RedisModule,
    CryptoModule,
    MongooseModule.forFeature([
      { name: ProxyAssignment.name, schema: ProxyAssignmentSchema },
      { name: XConnection.name, schema: XConnectionSchema },
    ]),
  ],
  providers: [ProxyPoolService],
  exports: [ProxyPoolService],
})
export class ProxyModule {}
