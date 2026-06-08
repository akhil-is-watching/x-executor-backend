import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsString,
  ArrayMaxSize,
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
}
