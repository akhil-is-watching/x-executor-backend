import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { SetAuthTokenDto } from './dto/set-auth-token.dto';
import { SetXchatPinDto } from './dto/set-xchat-pin.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';

@Controller('orgs/:orgId/connections')
@UseGuards(JwtAuthGuard, OrgMemberGuard)
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  list(@Param('orgId') orgId: string) {
    return this.connectionsService.listForOrg(orgId);
  }

  @Patch(':connectionId/xchat-pin')
  @UseGuards(OrgAdminGuard)
  setXchatPin(
    @Param('orgId') orgId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: SetXchatPinDto,
  ) {
    return this.connectionsService.setXchatPin(orgId, connectionId, dto.xchatPin);
  }

  @Patch(':connectionId/auth-token')
  @UseGuards(OrgAdminGuard)
  setAuthToken(
    @Param('orgId') orgId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: SetAuthTokenDto,
  ) {
    return this.connectionsService.setAuthToken(
      orgId,
      connectionId,
      dto.authToken,
    );
  }

  @Delete(':connectionId')
  @UseGuards(OrgAdminGuard)
  revoke(
    @Param('orgId') orgId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.connectionsService.revoke(orgId, connectionId);
  }
}
