import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUses?: number;
}
