import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ChatsService } from './chats.service';
import {
  PaginatedConversationsDto,
  PaginatedMessagesDto,
} from './dto/chat-response.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OrgMemberGuard } from '../guards/org-member.guard';

@ApiTags('Chats')
@ApiBearerAuth()
@Controller('orgs/:orgId/chats')
@UseGuards(JwtAuthGuard, OrgMemberGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  @ApiOperation({ summary: 'List DM conversations for the organization' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Max 50' })
  @ApiResponse({ status: 200, type: PaginatedConversationsDto })
  listConversations(
    @Param('orgId') orgId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    return this.chatsService.listConversations(orgId, page, safeLimit);
  }

  @Get(':conversationId')
  @ApiOperation({ summary: 'Get paginated messages in a conversation' })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50, description: 'Max 100' })
  @ApiResponse({ status: 200, type: PaginatedMessagesDto })
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
