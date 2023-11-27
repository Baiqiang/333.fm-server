import { BadRequestException, Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOneOptions, Repository } from 'typeorm'

import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { Competitions, CompetitionStatus, CompetitionType } from '@/entities/competitions.entity'
import { DNF, DNS, Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { formatSkeleton, parseWeek } from '@/utils'

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

  getWeekly(week: string) {
    // get date from week in format YYYY-ww
    const date = parseWeek(week)
    if (date === null) {
      return null
    }
    return this.findOne({
      where: {
        type: CompetitionType.WEEKLY,
        startTime: date.toDate(),
      },
      relations: {
        scrambles: true,
      },
    })
  }

  async getWeeklyResults(competition: Competitions) {
    const results = await this.resultsRepository.find({
      where: {
        competition: {
          id: competition.id,
        },
      },
      order: {
        average: 'ASC',
        best: 'ASC',
      },
      relations: {
        user: true,
      },
    })
    return results
  }

  async submitWeekly(competition: Competitions, user: Users, solution: SubmitSolutionDto) {
    if (competition.hasEnded) {
      throw new BadRequestException('Competition has ended')
    }
    const scramble = await this.scramblesRepository.findOne({
      where: {
        id: solution.scrambleId,
      },
    })
    if (scramble === null) {
      throw new BadRequestException('Invalid scramble')
    }
    let submission = await this.submissionsRepository.findOne({
      where: {
        scrambleId: scramble.id,
        userId: user.id,
      },
    })
    if (submission !== null) {
      throw new BadRequestException('Already submitted')
    }
    submission = new Submissions()
    submission.scramble = scramble
    submission.user = user
    submission.solution = solution.solution
    submission.comment = solution.comment
    const { bestCube, formattedSkeleton } = formatSkeleton(scramble.scramble, solution.solution)
    // check if solved
    if (
      bestCube.getCornerCycles() === 0 &&
      bestCube.getEdgeCycles() === 0 &&
      bestCube.getCenterCycles() === 0 &&
      !bestCube.hasParity()
    ) {
      submission.moves = formattedSkeleton.split(' ').length * 100
    } else {
      // DNF
      submission.moves = DNF
    }
    await this.submissionsRepository.save(submission)
    let result = await this.resultsRepository.findOne({
      where: {
        competition: {
          id: competition.id,
        },
        user: {
          id: user.id,
        },
      },
    })
    if (result === null) {
      result = new Results()
      result.competition = competition
      result.user = user
    }
    submission.result = result
    await this.submissionsRepository.save(submission)
    const submissions = await this.submissionsRepository.find({
      where: {
        competitionId: competition.id,
      },
      order: {
        scramble: {
          number: 'ASC',
        },
      },
    })
    result.values = submissions.map(submission => submission.moves)
    result.best = Math.min(...result.values)
    result.average = Math.round(result.values.reduce((a, b) => a + b, 0) / result.values.length)
    if (result.values.some(v => v === DNF || v === DNS)) {
      result.average = DNF
    }
    await this.resultsRepository.save(result)
  }

  async patchWeekly(competition: Competitions, user: Users, id: number, solution: any) {
    const submission = await this.submissionsRepository.findOne({
      where: {
        id,
        user: {
          id: user.id,
        },
        competition: {
          id: competition.id,
        },
      },
    })
    if (submission === null) {
      throw new BadRequestException('Invalid submission')
    }
    submission.comment = solution.comment
    await this.submissionsRepository.save(submission)
  }

  findOne(options: FindOneOptions<Competitions>) {
    return this.competitionsRepository.findOne(options)
  }
}
