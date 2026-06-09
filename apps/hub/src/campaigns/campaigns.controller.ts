import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import {
  CampaignStatusResponseDto,
  CreateCampaignResponseDto,
} from './dto/campaign-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';

@ApiTags('Campaigns')
@ApiBearerAuth()
@Controller('orgs/:orgId/campaigns')
@UseGuards(JwtAuthGuard, OrgMemberGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Create a DM campaign (admin only)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiResponse({ status: 201, type: CreateCampaignResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Admin required' })
  create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(orgId, dto);
  }

  @Get(':campaignId/status')
  @ApiOperation({ summary: 'Get campaign delivery status' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiParam({ name: 'campaignId', description: 'Campaign ID' })
  @ApiResponse({ status: 200, type: CampaignStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  getStatus(
    @Param('orgId') orgId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.campaignsService.getStatus(orgId, campaignId);
  }
}
