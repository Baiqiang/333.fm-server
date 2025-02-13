import { BullModule } from '@nestjs/bull'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AttachmentModule } from '@/attachment/attachment.module'
import { Competitions } from '@/entities/competitions.entity'
import { EndlessKickoffs } from '@/entities/endless-kickoffs.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { UserActivities } from '@/entities/user-activities.entity'
import { Users } from '@/entities/users.entity'
import { UserModule } from '@/user/user.module'

import { ChainController } from './chain/chain.controller'
import { ChainService } from './chain/chain.service'
import { ChainProcessor } from './chain/processors/chain.processor'
import { CompetitionController } from './competition.controller'
import { CompetitionService } from './competition.service'
import { DailyController } from './daily/daily.controller'
import { DailyService } from './daily/daily.service'
import { EndlessController } from './endless/endless.controller'
import { EndlessService } from './endless/endless.service'
import { EndlessProcessor } from './endless/processors/endless.processor'
import { PracticeController } from './practice/practice.controller'
import { PracticeService } from './practice/practice.service'
import { PracticeProcessor } from './practice/processors/practice.processor'
import { WeeklyController } from './weekly/weekly.controller'
import { WeeklyService } from './weekly/weekly.service'

@Module({
  imports: [
    AttachmentModule,
    TypeOrmModule.forFeature([Competitions, EndlessKickoffs, Results, Scrambles, Submissions, Users, UserActivities]),
    BullModule.registerQueue(
      {
        name: 'endless',
      },
      {
        name: 'chain',
      },
      {
        name: 'practice',
      },
    ),
    UserModule,
  ],
  exports: [WeeklyService],
  providers: [
    CompetitionService,
    WeeklyService,
    DailyService,
    EndlessService,
    EndlessProcessor,
    ChainService,
    ChainProcessor,
    PracticeService,
    PracticeProcessor,
  ],
  controllers: [
    CompetitionController,
    WeeklyController,
    DailyController,
    EndlessController,
    ChainController,
    PracticeController,
  ],
})
export class CompetitionModule {}
