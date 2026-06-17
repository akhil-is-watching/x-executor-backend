import { ApiProperty } from '@nestjs/swagger';

export class ChatTestResponseDto {
  @ApiProperty({ example: 'Yes. Noah can generate standard web applications.' })
  reply!: string;

  @ApiProperty({
    description:
      'False when the model returned the unknown-reply fallback (out of scope).',
  })
  isKnownAnswer!: boolean;
}
