import { Type } from 'class-transformer'
import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator'

import { CompetitionFormat } from '@/entities/competitions.entity'

export class ScrambleDto {
  @IsNotEmpty()
  number: number

  @IsString()
  @IsNotEmpty()
  scramble: string

  @IsOptional()
  round?: number
}

export class ReconstructionCompetitionDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsEnum(CompetitionFormat)
  format: CompetitionFormat

  @IsDateString()
  startTime: Date

  @IsOptional()
  @IsDateString()
  endTime?: Date | null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScrambleDto)
  scrambles?: ScrambleDto[]
}

export class AddScramblesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScrambleDto)
  scrambles: ScrambleDto[]
}
