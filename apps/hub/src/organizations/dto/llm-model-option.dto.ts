import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LlmModelOptionDto {
  @ApiProperty({ example: 'google/gemini-3.5-flash' })
  id!: string;

  @ApiProperty({ example: 'Google: Gemini 3.5 Flash' })
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ example: 1_048_576 })
  contextLength?: number;
}
