import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConnectionsService } from './connections.service';
import { SetAuthTokenDto } from './dto/set-auth-token.dto';
import { SetXchatPinDto } from './dto/set-xchat-pin.dto';
import { ConnectionDto } from './dto/connection-response.dto';
import {
  RevokeConnectionResponseDto,
  SetAuthTokenResponseDto,
  SetXchatPinResponseDto,
} from './dto/connection-update-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';
import { OrgAdminGuard } from '../guards/org-admin.guard';

@ApiTags('Connections')
@ApiBearerAuth()
@Controller('orgs/:orgId/connections')
@UseGuards(JwtAuthGuard, OrgMemberGuard)
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  @ApiOperation({ summary: 'List X connections for the organization' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiResponse({ status: 200, type: [ConnectionDto] })
  list(@Param('orgId') orgId: string) {
    return this.connectionsService.listForOrg(orgId);
  }

  @Patch(':connectionId/xchat-pin')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Set XChat PIN for encrypted DM decrypt (admin only)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiParam({ name: 'connectionId', description: 'Connection ID' })
  @ApiResponse({ status: 200, type: SetXchatPinResponseDto })
  @ApiResponse({ status: 403, description: 'Admin required' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  setXchatPin(
    @Param('orgId') orgId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: SetXchatPinDto,
  ) {
    return this.connectionsService.setXchatPin(orgId, connectionId, dto.xchatPin);
  }

  @Patch(':connectionId/auth-token')
  @UseGuards(OrgAdminGuard)
  @ApiOperation({ summary: 'Set GetXAPI auth token for legacy DM fetch (admin only)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiParam({ name: 'connectionId', description: 'Connection ID' })
  @ApiResponse({ status: 200, type: SetAuthTokenResponseDto })
  @ApiResponse({ status: 403, description: 'Admin required' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
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
  @ApiOperation({ summary: 'Revoke an X connection (admin only)' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiParam({ name: 'connectionId', description: 'Connection ID' })
  @ApiResponse({ status: 200, type: RevokeConnectionResponseDto })
  @ApiResponse({ status: 403, description: 'Admin required' })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  revoke(
    @Param('orgId') orgId: string,
    @Param('connectionId') connectionId: string,
  ) {
    return this.connectionsService.revoke(orgId, connectionId);
  }
}
