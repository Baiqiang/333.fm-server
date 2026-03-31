import { IsInt, IsOptional, IsString } from 'class-validator'

export class DRTriggerStartDto {
  @IsOptional()
  @IsInt()
  difficulty?: number
}

export class DRTriggerSubmitDto {
  @IsInt()
  gameId: number

  @IsString()
  solution: string
}
