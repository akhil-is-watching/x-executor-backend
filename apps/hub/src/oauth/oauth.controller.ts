import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { OAuthService } from './oauth.service';
import { OAuthCallbackResultDto } from './dto/oauth-response.dto';

@ApiTags('OAuth')
@Controller('oauth/x')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('start')
  @ApiOperation({
    summary: 'Start X OAuth flow for an invite token',
    description: 'Redirects the browser to X authorization.',
  })
  @ApiQuery({ name: 'invite', required: true, description: 'Invite token' })
  @ApiResponse({ status: 302, description: 'Redirect to X authorization URL' })
  @ApiResponse({ status: 400, description: 'Missing or invalid invite token' })
  @ApiResponse({ status: 410, description: 'Invite expired, revoked, or max uses reached' })
  start(
    @Query('invite') invite: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!invite) {
      throw new BadRequestException('invite query parameter is required');
    }
    return this.oauthService.startOAuth(invite, res);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'X OAuth callback',
    description:
      'Exchanges oauth_verifier for tokens. Returns JSON or redirects to OAUTH_SUCCESS_REDIRECT_URL when configured.',
  })
  @ApiQuery({ name: 'oauth_token', required: false })
  @ApiQuery({ name: 'oauth_verifier', required: false })
  @ApiQuery({ name: 'denied', required: false })
  @ApiQuery({ name: 'error', required: false })
  @ApiResponse({ status: 200, type: OAuthCallbackResultDto })
  @ApiResponse({ status: 302, description: 'Redirect to frontend success URL' })
  @ApiResponse({ status: 400, description: 'Invalid OAuth callback' })
  callback(
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    return this.oauthService.handleCallback(query, res);
  }
}
