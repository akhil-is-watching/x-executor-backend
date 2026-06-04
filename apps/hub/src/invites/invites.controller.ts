import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { JwtUserPayload } from '../decorators/current-user.decorator';

@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('orgs/:orgId/invites')
  @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  create(
    @Param('orgId') orgId: string,
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: CreateInviteDto,
  ) {
    return this.invitesService.create(orgId, user.sub, dto);
  }

  @Get('orgs/:orgId/invites')
  @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  list(@Param('orgId') orgId: string) {
    return this.invitesService.listForOrg(orgId);
  }

  @Delete('orgs/:orgId/invites/:inviteId')
  @UseGuards(JwtAuthGuard, OrgMemberGuard, OrgAdminGuard)
  revoke(
    @Param('orgId') orgId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invitesService.revoke(orgId, inviteId);
  }

  @Get('invites/:token')
  getPublic(@Param('token') token: string) {
    return this.invitesService.getPublicMetadata(token);
  }
}
