import { IsInt } from 'class-validator'

export class SubmitSolutionDto {
  @IsInt()
  scrambleId: number

  solution: string

  comment: string
}
