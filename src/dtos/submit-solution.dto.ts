import { IsEnum, IsInt } from 'class-validator'

import { CompetitionMode } from '@/entities/competitions.entity'

export class SubmitSolutionDto {
  @IsInt()
  scrambleId: number

  @IsEnum(CompetitionMode)
  mode: CompetitionMode

  solution: string

  comment: string
}
