import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ChatTestDto {
  @ApiProperty({
    maxLength: 2000,
    example: 'Can Noah build a normal website?',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  userMessage!: string;

  @ApiPropertyOptional({
    maxLength: 32_000,
    description:
      'Draft system prompt to test. If omitted, uses the saved org systemPrompt.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32_000)
  systemPrompt?: string;

  @ApiPropertyOptional({
    maxLength: 1000,
    description:
      'Fallback when the LLM cannot answer. If omitted, uses org unknownReply or default.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  unknownReply?: string;
}
