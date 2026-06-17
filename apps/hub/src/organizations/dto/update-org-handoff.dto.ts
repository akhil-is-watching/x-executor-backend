import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrgHandoffDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  handoffEnabled!: boolean;

  @ApiPropertyOptional({
    maxLength: 2000,
    example:
      'Notify @john for investments and partnerships. Notify @jane for support, refunds, and billing.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  handoffConfig?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    example: 'A member of our team has been notified and will reply to you shortly.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  handoffMessage?: string;
}
