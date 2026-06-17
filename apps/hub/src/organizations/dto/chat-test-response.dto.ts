import { ApiProperty } from '@nestjs/swagger';

export class ChatTestResponseDto {
  @ApiProperty({ example: 'Yes. Noah can generate standard web applications.' })
  reply!: string;

  @ApiProperty({
    description:
      'False when the model determined the system prompt does not cover the question.',
  })
  isKnownAnswer!: boolean;
}
