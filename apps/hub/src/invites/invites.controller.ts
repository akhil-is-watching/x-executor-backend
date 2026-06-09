import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import {
  InviteDto,
  InvitePublicDto,
  RevokeInviteResponseDto,
} from './dto/invite-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { JwtUserPayload } from '../decorators/current-user.decorator';

@ApiTags('Invites')
@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('orgs/:orgId/invites')
  @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an X OAuth invite link (admin only)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiResponse({ status: 201, type: InviteDto })
  @ApiResponse({ status: 403, description: 'Admin required' })
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invitesService.create(orgId, user.sub, dto);
  }

  @Get('orgs/:orgId/invites')
  @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List invites for the organization (admin only)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiResponse({ status: 200, type: [InviteDto] })
  @ApiResponse({ status: 403, description: 'Admin required' })
  list(@Param('orgId') orgId: string) {
    return this.invitesService.listForOrg(orgId);
  }

  @Delete('orgs/:orgId/invites/:inviteId')
  @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an invite (admin only)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiParam({ name: 'inviteId', description: 'Invite ID' })
  @ApiResponse({ status: 200, type: RevokeInviteResponseDto })
  @ApiResponse({ status: 403, description: 'Admin required' })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  revoke(
    @Param('orgId') orgId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invitesService.revoke(orgId, inviteId);
  }

  @Get('invites/:token')
  @ApiOperation({ summary: 'Get public invite metadata (no auth required)' })
  @ApiParam({ name: 'token', description: 'Invite token' })
  @ApiResponse({ status: 200, type: InvitePublicDto })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  getPublic(@Param('token') token: string) {
    return this.invitesService.getPublicMetadata(token);
  }
}
