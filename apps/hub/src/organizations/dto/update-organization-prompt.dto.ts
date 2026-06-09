import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationPromptDto {
  @ApiPropertyOptional({
    maxLength: 32_000,
    description: 'LLM system prompt for inbound DM replies',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32_000)
  systemPrompt?: string;

  @ApiPropertyOptional({
    maxLength: 1_000,
    description: 'Fallback reply when the LLM cannot answer from the prompt',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  unknownReply?: string;
}
