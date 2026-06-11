import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConnectionDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({ example: '3012852462' })
  xUserId!: string;

  @ApiProperty({ example: 'botuser' })
  xUsername!: string;

  @ApiProperty({ type: [String], example: [] })
  scopes!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  connectedAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  tokenExpiresAt?: Date;

  @ApiPropertyOptional({
    example: 'https://webhook.example.com/xbot/v1/api/webhook/incoming',
  })
  webhookUrl?: string;

  @ApiProperty({ example: true })
  subscribed!: boolean;

  @ApiProperty({ example: true })
  hasAuthToken!: boolean;

  @ApiProperty({ example: false })
  hasXchatPin!: boolean;
}
