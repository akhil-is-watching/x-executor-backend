import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCampaignResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({
    enum: ['pending', 'running', 'completed', 'failed'],
    example: 'pending',
  })
  status!: string;

  @ApiProperty({ example: 100 })
  totalTargets!: number;

  @ApiProperty({ example: 15 })
  dmsPerHour!: number;

  @ApiProperty({ example: 'Hello from our team!' })
  messageText!: string;

  @ApiProperty({ type: [String], example: ['alice', 'bob'] })
  targetUsernames!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class CampaignStatusResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  orgId!: string;

  @ApiProperty({
    enum: ['pending', 'running', 'completed', 'failed'],
    example: 'running',
  })
  status!: string;

  @ApiProperty()
  messageText!: string;

  @ApiProperty({ type: [String] })
  targetUsernames!: string[];

  @ApiProperty({ example: 100 })
  totalTargets!: number;

  @ApiProperty({ example: 15 })
  dmsPerHour!: number;

  @ApiProperty({ example: 100 })
  messagesScheduled!: number;

  @ApiProperty({ example: 42 })
  messagesSent!: number;

  @ApiProperty({ example: 5 })
  repliesReceived!: number;

  @ApiProperty({ example: 2 })
  failedCount!: number;

  @ApiProperty({ example: 56 })
  remaining!: number;

  @ApiProperty({ example: 44 })
  progressPercent!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  startedAt?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  expectedEndAt?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  completedAt?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
