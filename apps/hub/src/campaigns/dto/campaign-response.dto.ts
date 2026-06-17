import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CAMPAIGN_STATUS_VALUES = [
  'pending',
  'running',
  'paused',
  'stopped',
  'completed',
  'failed',
] as const;

export class CreateCampaignResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({ example: 'Q1 outreach' })
  name!: string;

  @ApiProperty({
    enum: CAMPAIGN_STATUS_VALUES,
    example: 'pending',
  })
  status!: string;

  @ApiProperty({ example: 100 })
  totalTargets!: number;

  @ApiProperty({ example: 15 })
  dmsPerHour!: number;

  @ApiPropertyOptional({ example: 2 })
  accountsToUse?: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['507f1f77bcf86cd799439011'],
  })
  connectionIds?: string[];

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

  @ApiProperty({ example: 'Q1 outreach' })
  name!: string;

  @ApiProperty({
    enum: CAMPAIGN_STATUS_VALUES,
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

  @ApiPropertyOptional({ example: 2 })
  accountsToUse?: number;

  @ApiPropertyOptional({ type: [String] })
  connectionIds?: string[];

  @ApiProperty({ example: 100 })
  messagesScheduled!: number;

  @ApiProperty({ example: 42 })
  messagesSent!: number;

  @ApiProperty({ example: 5 })
  repliesReceived!: number;

  @ApiProperty({ example: 2 })
  failedCount!: number;

  @ApiProperty({ example: 0 })
  cancelledCount!: number;

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

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  stoppedAt?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class CampaignSummaryDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({ example: 'Q1 outreach' })
  name!: string;

  @ApiProperty({
    enum: CAMPAIGN_STATUS_VALUES,
    example: 'running',
  })
  status!: string;

  @ApiProperty({ example: 100 })
  totalTargets!: number;

  @ApiProperty({ example: 42 })
  messagesSent!: number;

  @ApiProperty({ example: 2 })
  failedCount!: number;

  @ApiProperty({ example: 44 })
  progressPercent!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  completedAt?: Date;
}

export class UpdateCampaignResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({ example: 'Q1 outreach (revised)' })
  name!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class CampaignControlResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({
    enum: CAMPAIGN_STATUS_VALUES,
    example: 'paused',
  })
  status!: string;

  @ApiProperty({ example: 12 })
  cancelledCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  completedAt?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  stoppedAt?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
