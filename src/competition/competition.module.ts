import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Competitions } from '@/entities/competitions.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'

import { CompetitionController } from './competition.controller'
import { CompetitionService } from './competition.service'
import { WeeklyController } from './weekly/weekly.controller'
import { WeeklyService } from './weekly/weekly.service'

@Module({
  imports: [TypeOrmModule.forFeature([Competitions, Results, Scrambles, Submissions, Users])],
  providers: [CompetitionService, WeeklyService],
  controllers: [CompetitionController, WeeklyController],
})
export class CompetitionModule {}
