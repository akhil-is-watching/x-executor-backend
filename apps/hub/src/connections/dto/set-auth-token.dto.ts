import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SetAuthTokenDto {
  @ApiProperty({ description: 'GetXAPI auth token for legacy DM fetch' })
  @IsString()
  @IsNotEmpty()
  authToken!: string;
}
