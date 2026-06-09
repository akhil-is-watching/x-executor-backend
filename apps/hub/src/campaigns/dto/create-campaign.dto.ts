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
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  targetUsernames!: string[];

  @IsString()
  @IsNotEmpty()
  messageText!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  dmsPerHour?: number;
}
