import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import {
  CampaignStatusResponseDto,
  CampaignSummaryDto,
  CreateCampaignResponseDto,
  UpdateCampaignResponseDto,
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

  @Get()
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'List campaigns for the organization (admin only)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiResponse({ status: 200, type: [CampaignSummaryDto] })
  @ApiResponse({ status: 403, description: 'Admin required' })
  list(@Param('orgId') orgId: string) {
    return this.campaignsService.listForOrg(orgId);
  }

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

  @Patch(':campaignId')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Update campaign name (admin only)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiParam({ name: 'campaignId', description: 'Campaign ID' })
  @ApiResponse({ status: 200, type: UpdateCampaignResponseDto })
  @ApiResponse({ status: 403, description: 'Admin required' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  updateName(
    @Param('orgId') orgId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.updateName(orgId, campaignId, dto.name);
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
