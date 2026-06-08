import { IsString, Matches } from 'class-validator';

export class SetXchatPinDto {
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'xchatPin must be 4–8 digits' })
  xchatPin!: string;
}
