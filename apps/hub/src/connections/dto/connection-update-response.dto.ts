import { ApiProperty } from '@nestjs/swagger';

export class SetXchatPinResponseDto {
  @ApiProperty({ example: true })
  updated!: boolean;

  @ApiProperty({ example: true })
  hasXchatPin!: boolean;
}

export class SetAuthTokenResponseDto {
  @ApiProperty({ example: true })
  updated!: boolean;

  @ApiProperty({ example: true })
  hasAuthToken!: boolean;
}

export class RevokeConnectionResponseDto {
  @ApiProperty({ example: true })
  revoked!: boolean;
}
