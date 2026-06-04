import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { XApiService } from './x-api.service';
import { OAuthStateStore } from './oauth-state.store';
import { InvitesModule } from '../invites/invites.module';
import { CryptoModule } from '../crypto/crypto.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { XConnection, XConnectionSchema } from '../schemas/x-connection.schema';

@Module({
  imports: [
    InvitesModule,
    CryptoModule,
    WebhooksModule,
    MongooseModule.forFeature([
      { name: XConnection.name, schema: XConnectionSchema },
    ]),
  ],
  controllers: [OAuthController],
  providers: [OAuthService, XApiService, OAuthStateStore],
  exports: [OAuthService, XApiService],
})
export class OAuthModule {}
