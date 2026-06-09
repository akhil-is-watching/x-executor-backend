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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationPromptDto } from './dto/update-organization-prompt.dto';
import {
  MemberDto,
  OrganizationDto,
  OrganizationWithRoleDto,
} from './dto/organization-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { JwtUserPayload } from '../decorators/current-user.decorator';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('orgs')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an organization' })
  @ApiResponse({ status: 201, type: OrganizationDto })
  create(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations for the current user' })
  @ApiResponse({ status: 200, type: [OrganizationWithRoleDto] })
  list(@CurrentUser() user: JwtUserPayload) {
    return this.organizationsService.listForUser(user.sub);
  }

  @Get(':orgId')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Get organization by ID' })
  @ApiResponse({ status: 200, type: OrganizationDto })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  get(@Param('orgId') orgId: string) {
    return this.organizationsService.getById(orgId);
  }

  @Get(':orgId/members')
  @UseGuards(OrgMemberGuard, OrgAdminGuard)
  @ApiOperation({ summary: 'List organization members (admin only)' })
  @ApiResponse({ status: 200, type: [MemberDto] })
  @ApiResponse({ status: 403, description: 'Admin required' })
  listMembers(@Param('orgId') orgId: string) {
    return this.organizationsService.listMembers(orgId);
  }

  @Patch(':orgId/prompt')
  @UseGuards(OrgMemberGuard, OrgAdminGuard)
  @ApiOperation({ summary: 'Update LLM system prompt (admin only)' })
  @ApiResponse({ status: 200, type: OrganizationDto })
  @ApiResponse({ status: 403, description: 'Admin required' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  updatePrompt(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationPromptDto,
  ) {
    return this.organizationsService.updatePrompt(orgId, dto);
  }
}
