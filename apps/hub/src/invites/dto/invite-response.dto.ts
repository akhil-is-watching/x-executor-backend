import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InviteDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty()
  inviteToken!: string;

  @ApiProperty({
    example:
      'https://hub.example.com/xbot/v1/api/hub/oauth/x/start?invite=abc123',
  })
  inviteUrl!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;

  @ApiPropertyOptional({ example: 5 })
  maxUses?: number;

  @ApiPropertyOptional({ example: 0 })
  useCount?: number;

  @ApiPropertyOptional({ example: false })
  expired?: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  createdAt?: Date;
}

export class InvitePublicDto {
  @ApiProperty({ example: 'Acme Corp' })
  orgName!: string;

  @ApiProperty({ example: false })
  expired!: boolean;

  @ApiProperty({ example: false })
  revoked!: boolean;

  @ApiProperty({ example: false })
  maxUsesReached!: boolean;

  @ApiPropertyOptional({ example: 0 })
  useCount?: number;

  @ApiPropertyOptional({ example: 5, nullable: true })
  maxUses?: number | null;
}

export class RevokeInviteResponseDto {
  @ApiProperty({ example: true })
  revoked!: boolean;
}
