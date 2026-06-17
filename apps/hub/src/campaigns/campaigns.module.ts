import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NatsJsModule } from '@app/nats-js';
import { Campaign, CampaignSchema } from '../schemas/campaign.schema';
import {
  CampaignJob,
  CampaignJobSchema,
} from '../schemas/campaign-job.schema';
import {
  XConnection,
  XConnectionSchema,
} from '../schemas/x-connection.schema';
import {
  OrganizationMembership,
  OrganizationMembershipSchema,
} from '../schemas/organization-membership.schema';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [
    NatsJsModule,
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: CampaignJob.name, schema: CampaignJobSchema },
      { name: XConnection.name, schema: XConnectionSchema },
      {
        name: OrganizationMembership.name,
        schema: OrganizationMembershipSchema,
      },
    ]),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, OrgMemberGuard, OrgAdminGuard],
})
export class CampaignsModule {}
