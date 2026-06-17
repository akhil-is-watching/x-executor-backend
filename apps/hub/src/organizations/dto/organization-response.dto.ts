import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrganizationDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({ example: 'Acme Corp' })
  name!: string;

  @ApiPropertyOptional({ example: 'acme-corp' })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Published system prompt used for live inbound DM replies',
  })
  systemPrompt?: string;

  @ApiPropertyOptional({
    description: 'Draft system prompt (editable; not live until published)',
  })
  draftSystemPrompt?: string;

  @ApiProperty({
    description: 'True when saved draft differs from the published prompt',
  })
  hasUnpublishedDraft!: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  promptPublishedAt?: Date;

  @ApiPropertyOptional({
    example: 'google/gemini-3.5-flash',
    description: 'Published LLM model used for live inbound DM replies',
  })
  llmModel?: string;

  @ApiPropertyOptional({
    example: 'google/gemini-3.5-flash',
    description: 'Draft LLM model (editable; not live until published)',
  })
  draftLlmModel?: string;

  @ApiProperty({ example: false })
  handoffEnabled!: boolean;

  @ApiPropertyOptional({
    description: 'Free-text rules for who to notify and when to hand off',
  })
  handoffConfig?: string;

  @ApiPropertyOptional({
    description: 'Fixed reply shown to users while a conversation is handed off',
  })
  handoffMessage?: string;

  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  createdBy!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  createdAt?: Date;
}

export class OrganizationWithRoleDto extends OrganizationDto {
  @ApiProperty({ enum: ['owner', 'admin', 'member'], example: 'owner' })
  role!: string;
}

export class MemberDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  userId!: string;

  @ApiPropertyOptional({ example: 'admin@example.com' })
  email?: string;

  @ApiProperty({ enum: ['owner', 'admin', 'member'], example: 'admin' })
  role!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  joinedAt?: Date;
}
