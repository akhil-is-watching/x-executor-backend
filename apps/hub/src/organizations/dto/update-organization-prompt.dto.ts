import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationPromptDto {
  @IsOptional()
  @IsString()
  @MaxLength(32_000)
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  unknownReply?: string;
}
