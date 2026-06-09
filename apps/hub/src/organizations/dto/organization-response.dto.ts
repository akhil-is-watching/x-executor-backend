import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrganizationDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  id!: string;

  @ApiProperty({ example: 'Acme Corp' })
  name!: string;

  @ApiPropertyOptional({ example: 'acme-corp' })
  slug?: string;

  @ApiPropertyOptional()
  systemPrompt?: string;

  @ApiPropertyOptional()
  unknownReply?: string;

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
