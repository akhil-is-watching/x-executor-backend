import { ApiProperty } from '@nestjs/swagger';

export class OAuthCallbackResultDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  orgId!: string;

  @ApiProperty({ example: '3012852462' })
  xUserId!: string;

  @ApiProperty({ example: 'botuser' })
  xUsername!: string;

  @ApiProperty({
    example: 'https://webhook.example.com/api/v1/webhooks/incoming',
  })
  webhookUrl!: string;

  @ApiProperty({ example: true })
  subscribed!: boolean;
}
