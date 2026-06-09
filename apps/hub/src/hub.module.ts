import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '@app/redis';
import { validateEnv } from './config/validate-env';
import { HubController } from './hub.controller';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { InvitesModule } from './invites/invites.module';
import { OAuthModule } from './oauth/oauth.module';
import { NatsJsModule } from '@app/nats-js';
import { ConnectionsModule } from './connections/connections.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { CryptoModule } from './crypto/crypto.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ChatsModule } from './chats/chats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    RedisModule,
    NatsJsModule,
    CryptoModule,
    AuthModule,
    OrganizationsModule,
    InvitesModule,
    OAuthModule,
    ConnectionsModule,
    WebhooksModule,
    CampaignsModule,
    ChatsModule,
  ],
  controllers: [HubController],
})
export class HubModule {}
