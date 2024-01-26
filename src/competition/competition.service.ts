import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, FindOneOptions, Repository } from 'typeorm'

import { Competitions, CompetitionStatus, CompetitionType } from '@/entities/competitions.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'

import { EndlessService } from './endless/endless.service'
import { WeeklyService } from './weekly/weekly.service'

@Injectable()
export class CompetitionService {
  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    private readonly weeklyService: WeeklyService,
    private readonly endlessService: EndlessService,
  ) {}

  @Cron('* * * * *')
  async updateCompetitions() {
    const onGoings = await this.competitionsRepository.find({
      where: {
        status: CompetitionStatus.ON_GOING,
      },
    })
    const now = new Date()
    onGoings.forEach(async competition => {
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
    })
    await this.competitionsRepository.save(onGoings)
    const notStarteds = await this.competitionsRepository.find({
      where: {
        status: CompetitionStatus.NOT_STARTED,
      },
    })
    notStarteds.forEach(async competition => {
      if (competition.startTime <= now) {
        competition.status = CompetitionStatus.ON_GOING
        switch (competition.type) {
          case CompetitionType.ENDLESS:
            await this.endlessService.start(competition)
            break

          default:
            break
        }
      }
    })
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
