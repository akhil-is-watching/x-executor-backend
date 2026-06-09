import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateInviteDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 720,
    default: 168,
    example: 168,
    description: 'Hours until invite expires',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 1000,
    example: 5,
    description: 'Maximum number of X account connections via this invite',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUses?: number;
}
