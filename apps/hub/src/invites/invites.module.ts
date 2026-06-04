import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { Invite, InviteSchema } from '../schemas/invite.schema';
import {
  Organization,
  OrganizationSchema,
} from '../schemas/organization.schema';
import {
  OrganizationMembership,
  OrganizationMembershipSchema,
} from '../schemas/organization-membership.schema';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invite.name, schema: InviteSchema },
      { name: Organization.name, schema: OrganizationSchema },
      {
        name: OrganizationMembership.name,
        schema: OrganizationMembershipSchema,
      },
    ]),
  ],
  controllers: [InvitesController],
  providers: [InvitesService, OrgMemberGuard, OrgAdminGuard],
  exports: [InvitesService],
})
export class InvitesModule {}
