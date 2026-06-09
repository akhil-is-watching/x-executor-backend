import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatLastMessageDto {
  @ApiProperty({ enum: ['inbound', 'outbound'], example: 'outbound' })
  direction!: string;

  @ApiProperty({ example: 'We ship on Fridays.' })
  text!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  processedAt!: Date;
}

export class ConversationSummaryDto {
  @ApiProperty({ example: '3012852462-1345154135381794816' })
  conversationId!: string;

  @ApiProperty({ example: '1345154135381794816' })
  recipientId!: string;

  @ApiPropertyOptional({ example: 'alice' })
  recipientUsername?: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  connectionId!: string;

  @ApiProperty({ example: 'botuser' })
  xUsername!: string;

  @ApiProperty({ type: ChatLastMessageDto })
  lastMessage!: ChatLastMessageDto;

  @ApiProperty({ example: 4 })
  messageCount!: number;
}

export class PaginatedConversationsDto {
  @ApiProperty({ type: [ConversationSummaryDto] })
  data!: ConversationSummaryDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

export class ChatMessageDto {
  @ApiProperty({ enum: ['inbound', 'outbound'], example: 'inbound' })
  direction!: string;

  @ApiProperty({ example: 'When do you ship?' })
  text!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  processedAt!: Date;

  @ApiProperty({ example: '1345154135381794816' })
  recipientId!: string;

  @ApiPropertyOptional({ example: true, nullable: true })
  isKnownAnswer?: boolean | null;
}

export class PaginatedMessagesDto {
  @ApiProperty({ type: [ChatMessageDto] })
  data!: ChatMessageDto[];

  @ApiProperty({ example: 4 })
  total!: number;

  @ApiProperty({ example: '3012852462-1345154135381794816' })
  conversationId!: string;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  limit!: number;
}
