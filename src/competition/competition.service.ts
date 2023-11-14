import { BadRequestException, Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOneOptions, Repository } from 'typeorm'

import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { CompetitionMode, Competitions, CompetitionStatus, CompetitionType } from '@/entities/competitions.entity'
import { DNF, DNS, Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { formatSkeleton, parseWeek, setRanks } from '@/utils'

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
      if (competition.endTime <= now) {
        competition.status = CompetitionStatus.ENDED
        const regularResults = await this.resultsRepository.find({
          where: {
            mode: CompetitionMode.REGULAR,
            competitionId: competition.id,
          },
        })
        const unlimitedResults = await this.resultsRepository.find({
          where: {
            mode: CompetitionMode.UNLIMITED,
            competitionId: competition.id,
          },
        })
        const regularResultsMap = new Map<number, Results>()
        const unlimitedResultsMap = new Map<number, Results>()
        for (const result of unlimitedResults) {
          unlimitedResultsMap.set(result.userId, result)
        }
        for (const result of regularResults) {
          regularResultsMap.set(result.userId, result)
          const unlimitedResult = unlimitedResultsMap.get(result.userId)
          if (result.values.includes(0)) {
            // if user has unlimited result, DNF the regular result
            result.values = result.values.map((v, i) => {
              if (v !== 0) {
                return v
              }
              if (!unlimitedResult) {
                return DNS
              }
              if (unlimitedResult.values[i] !== 0) {
                return DNF
              }
              return DNS
            })
            result.best = Math.min(...result.values)
            result.average = DNF
          }
          // if there's no unlimited result, copy the regular result
          if (!unlimitedResult) {
            const newResult = new Results()
            newResult.mode = CompetitionMode.UNLIMITED
            newResult.competitionId = result.competitionId
            newResult.userId = result.userId
            newResult.values = result.values
            newResult.best = result.best
            newResult.average = result.average
            unlimitedResults.push(newResult)
          }
        }
        for (const result of unlimitedResults) {
          if (result.values.includes(0)) {
            const regularResult = regularResultsMap.get(result.userId)
            result.values = result.values.map((v, i) => {
              if (v !== 0) {
                return v
              }
              if (!regularResult) {
                return DNS
              }
              if (regularResult.values[i] !== 0) {
                return regularResult.values[i]
              }
              return DNS
            })
            result.best = Math.min(...result.values)
            result.average = DNF
          }
        }
        setRanks(regularResults)
        setRanks(unlimitedResults)
        await this.resultsRepository.save(regularResults)
        await this.resultsRepository.save(unlimitedResults)
      }
    })
    await this.competitionsRepository.save(onGoings)
    const notStarteds = await this.competitionsRepository.find({
      where: {
        status: CompetitionStatus.NOT_STARTED,
      },
    })
    notStarteds.forEach(competition => {
      if (competition.startTime <= now) {
        competition.status = CompetitionStatus.ON_GOING
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
