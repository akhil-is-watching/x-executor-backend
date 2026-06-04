import { IsNotEmpty, IsString } from 'class-validator';

export class SetAuthTokenDto {
  @IsString()
  @IsNotEmpty()
  authToken!: string;
}
