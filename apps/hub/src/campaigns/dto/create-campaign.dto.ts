import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ArrayMaxSize,
  ArrayMinSize,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Q1 outreach', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    type: [String],
    example: ['alice', 'bob'],
    maxItems: 10_000,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  targetUsernames!: string[];

  @ApiProperty({ example: 'Hello from our team!' })
  @IsString()
  @IsNotEmpty()
  messageText!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 30,
    default: 15,
    example: 15,
    description: 'DMs per hour per connected account',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  dmsPerHour?: number;

  @ApiPropertyOptional({
    minimum: 1,
    example: 2,
    description: 'Number of connected accounts to use for sending',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  accountsToUse?: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    description: 'Specific connected account IDs to send from',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  connectionIds?: string[];
}
