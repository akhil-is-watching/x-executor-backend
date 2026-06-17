import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '@app/redis';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { XConnection, XConnectionSchema } from '../schemas/x-connection.schema';
import {
  OrganizationMembership,
  OrganizationMembershipSchema,
} from '../schemas/organization-membership.schema';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { CryptoModule } from '../crypto/crypto.module';
import { OAuthModule } from '../oauth/oauth.module';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [
    CryptoModule,
    RedisModule,
    OAuthModule,
    WebhooksModule,
    ProxyModule,
    MongooseModule.forFeature([
      { name: XConnection.name, schema: XConnectionSchema },
      {
        name: OrganizationMembership.name,
        schema: OrganizationMembershipSchema,
      },
    ]),
  ],
  controllers: [ConnectionsController],
  providers: [ConnectionsService, OrgMemberGuard, OrgAdminGuard],
})
export class ConnectionsModule {}
