import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import {
  Organization,
  OrganizationSchema,
} from '../schemas/organization.schema';
import {
  OrganizationMembership,
  OrganizationMembershipSchema,
} from '../schemas/organization-membership.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrganizationMembership.name, schema: OrganizationMembershipSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrgMemberGuard, OrgAdminGuard],
  exports: [OrganizationsService, MongooseModule],
})
export class OrganizationsModule {}
