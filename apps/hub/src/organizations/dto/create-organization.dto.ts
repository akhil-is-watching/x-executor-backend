import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Acme Corp' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 60, example: 'acme-corp' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string;
}
