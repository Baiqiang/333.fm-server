import { BullModule } from '@nestjs/bull'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Competitions } from '@/entities/competitions.entity'
import { EndlessKickoffs } from '@/entities/endless-kickoffs.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'

import { CompetitionController } from './competition.controller'
import { CompetitionService } from './competition.service'
import { EndlessController } from './endless/endless.controller'
import { EndlessService } from './endless/endless.service'
import { EndlessProcessor } from './endless/processors/endless.processor'
import { WeeklyController } from './weekly/weekly.controller'
import { WeeklyService } from './weekly/weekly.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Competitions, EndlessKickoffs, Results, Scrambles, Submissions, Users]),
    BullModule.registerQueue({
      name: 'endless',
    }),
  ],
  providers: [CompetitionService, WeeklyService, EndlessService, EndlessProcessor],
  controllers: [CompetitionController, WeeklyController, EndlessController],
})
export class CompetitionModule {}
