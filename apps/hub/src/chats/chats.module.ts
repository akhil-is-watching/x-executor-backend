import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DmMessage, DmMessageSchema } from '../schemas/dm-message.schema';
import {
  OrganizationMembership,
  OrganizationMembershipSchema,
} from '../schemas/organization-membership.schema';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DmMessage.name, schema: DmMessageSchema },
      {
        name: OrganizationMembership.name,
        schema: OrganizationMembershipSchema,
      },
    ]),
  ],
  controllers: [ChatsController],
  providers: [ChatsService, OrgMemberGuard],
})
export class ChatsModule {}
