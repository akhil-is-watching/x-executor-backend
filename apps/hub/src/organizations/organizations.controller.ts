import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationPromptDto } from './dto/update-organization-prompt.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { JwtUserPayload } from '../decorators/current-user.decorator';

@Controller('orgs')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtUserPayload) {
    return this.organizationsService.listForUser(user.sub);
  }

  @Get(':orgId')
  @UseGuards(OrgMemberGuard)
  get(@Param('orgId') orgId: string) {
    return this.organizationsService.getById(orgId);
  }

  @Get(':orgId/members')
  @UseGuards(OrgMemberGuard, OrgAdminGuard)
  listMembers(@Param('orgId') orgId: string) {
    return this.organizationsService.listMembers(orgId);
  }

  @Patch(':orgId/prompt')
  @UseGuards(OrgMemberGuard, OrgAdminGuard)
  updatePrompt(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationPromptDto,
  ) {
    return this.organizationsService.updatePrompt(orgId, dto);
  }
}
