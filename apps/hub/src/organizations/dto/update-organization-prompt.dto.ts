import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrganizationPromptDto {
  @ApiPropertyOptional({
    maxLength: 32_000,
    description: 'Draft system prompt (not live until published)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32_000)
  systemPrompt?: string;
}
