import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const LLM_MODEL_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export class UpdateOrganizationPromptDto {
  @ApiPropertyOptional({
    maxLength: 32_000,
    description: 'Draft system prompt (not live until published)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32_000)
  systemPrompt?: string;

  @ApiPropertyOptional({
    example: 'google/gemini-3.5-flash',
    description: 'Draft LLM model slug from OpenRouter (not live until published)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(LLM_MODEL_PATTERN, {
    message: 'llmModel must be a provider/model slug (e.g. google/gemini-3.5-flash)',
  })
  llmModel?: string;
}
