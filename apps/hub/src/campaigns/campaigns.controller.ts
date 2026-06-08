import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';

@Controller('orgs/:orgId/campaigns')
@UseGuards(JwtAuthGuard, OrgMemberGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @UseGuards(OrgAdminGuard)
  create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(orgId, dto);
  }

  @Get(':campaignId/status')
  getStatus(
    @Param('orgId') orgId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.campaignsService.getStatus(orgId, campaignId);
  }
}
