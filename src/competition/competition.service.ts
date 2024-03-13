import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, FindOneOptions, Repository } from 'typeorm'

import { Competitions, CompetitionStatus, CompetitionType } from '@/entities/competitions.entity'

import { ChainService } from './chain/chain.service'
import { EndlessService } from './endless/endless.service'
import { WeeklyService } from './weekly/weekly.service'

@Injectable()
export class CompetitionService {
  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    private readonly weeklyService: WeeklyService,
    private readonly endlessService: EndlessService,
    @Inject(forwardRef(() => ChainService))
    private readonly chainService: ChainService,
  ) {}

  @Cron('* * * * *')
  async updateCompetitions() {
    const onGoings = await this.competitionsRepository.find({
      where: {
        status: CompetitionStatus.ON_GOING,
      },
    })
    const now = new Date()
    for (const competition of onGoings) {
      if (competition.endTime !== null && competition.endTime <= now) {
        competition.status = CompetitionStatus.ENDED
        switch (competition.type) {
          case CompetitionType.WEEKLY:
            await this.weeklyService.calculateResults(competition)
            break

          default:
            break
        }
      }
    }
    await this.competitionsRepository.save(onGoings)
    const notStarteds = await this.competitionsRepository.find({
      where: {
        status: CompetitionStatus.NOT_STARTED,
      },
    })
    for (const competition of notStarteds) {
      if (competition.startTime <= now) {
        competition.status = CompetitionStatus.ON_GOING
        switch (competition.type) {
          case CompetitionType.ENDLESS:
            await this.endlessService.start(competition)
            break
          case CompetitionType.FMC_CHAIN:
            await this.chainService.start(competition)
            break

          default:
            break
        }
      }
    }
    await this.competitionsRepository.save(notStarteds)
  }

  getLatest() {
    return this.competitionsRepository.find({
      take: 10,
      order: {
        id: 'DESC',
      },
    })
  }

  findOne(options: FindOneOptions<Competitions>) {
    return this.competitionsRepository.findOne(options)
  }

  findMany(options: FindManyOptions<Competitions>) {
    return this.competitionsRepository.find(options)
  }
}
