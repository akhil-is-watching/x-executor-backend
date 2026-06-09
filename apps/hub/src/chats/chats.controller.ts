import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';

@Controller('orgs/:orgId/chats')
@UseGuards(JwtAuthGuard, OrgMemberGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  listConversations(
    @Param('orgId') orgId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    return this.chatsService.listConversations(orgId, page, safeLimit);
  }

  @Get(':conversationId')
  getMessages(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return this.chatsService.getMessages(orgId, conversationId, page, safeLimit);
  }
}
