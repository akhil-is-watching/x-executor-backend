import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OAuthService } from './oauth.service';

@Controller('oauth/x')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  @Get('start')
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
  callback(
    @Query() query: Record<string, string | undefined>,
    @Res() res: Response,
  ): Promise<void> {
    return this.oauthService.handleCallback(query, res);
  }
}
