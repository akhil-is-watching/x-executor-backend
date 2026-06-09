import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ArrayMaxSize,
  Max,
  Min,
} from 'class-validator';

export class CreateCampaignDto {
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
}
