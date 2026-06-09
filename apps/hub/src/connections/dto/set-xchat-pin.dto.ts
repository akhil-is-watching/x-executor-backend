import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class SetXchatPinDto {
  @ApiProperty({
    example: '1234',
    description: '4–8 digit XChat PIN for encrypted DM decrypt',
  })
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'xchatPin must be 4–8 digits' })
  xchatPin!: string;
}
