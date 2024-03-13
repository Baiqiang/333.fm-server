import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { Repository } from 'typeorm'

import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { Competitions, CompetitionStatus, CompetitionSubType, CompetitionType } from '@/entities/competitions.entity'
import { EndlessKickoffs } from '@/entities/endless-kickoffs.entity'
import { DNF, Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { calculateMoves, getCubieCube, getTopDistinctN, getTopN, sortResult } from '@/utils'
import { generateScramble, ScrambleType } from '@/utils/scramble'

import { CompetitionService } from '../competition.service'

export interface UserProgress {
  current: Progress | null
  next: Progress
}

export interface Progress {
  level: number
  scramble: Scrambles
  submission?: Submissions
  kickedBy?: EndlessKickoffs[]
}

export interface EndlessJob {
  competitionId: number
  userId: number
  scrambleId: number
  scrambleNumber: number
  submissionId: number
  moves: number
}

export interface UserLevel {
  level: number
  rank: number
  userId: number
  user: Users
}

export interface UserBest extends UserLevel {
  best: number
}

export interface Challenge {
  startLevel?: number
  endLevel?: number
  levels?: number[]
  single: number
  team: [number, number]
}

@Injectable()
export class EndlessService {
  constructor(
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    @Inject(forwardRef(() => CompetitionService))
    private readonly competitionService: CompetitionService,
    @InjectQueue('endless')
    private readonly queue: Queue<EndlessJob>,
    private readonly configService: ConfigService,
  ) {}

  async start(competition: Competitions) {
    const scramble = new Scrambles()
    scramble.competition = competition
    scramble.number = 1
    switch (competition.subType) {
      case CompetitionSubType.EO_PRACTICE:
        scramble.scramble = generateScramble(ScrambleType.EO)
        break
      case CompetitionSubType.DR_PRACTICE:
        scramble.scramble = generateScramble(ScrambleType.DR)
        break
      case CompetitionSubType.HTR_PRACTICE:
        scramble.scramble = generateScramble(ScrambleType.HTR)
        break
      default:
        scramble.scramble = generateScramble()
        break
    }
    await this.scramblesRepository.save(scramble)
  }

  async getLatest() {
    const competition = await this.competitionService.findOne({
      where: {
        type: CompetitionType.ENDLESS,
      },
      order: {
        id: 'DESC',
      },
    })
    if (competition === null) {
      return null
    }
    await this.fetchLevelInfo(competition)
    return competition
  }

  async getOnGoing(subType?: CompetitionSubType) {
    const competitions = await this.competitionService.findMany({
      where: {
        type: CompetitionType.ENDLESS,
        subType,
        status: CompetitionStatus.ON_GOING,
      },
      order: {
        startTime: 'DESC',
      },
    })
    // await Promise.all(competitions.map(c => this.fetchLevelInfo(c)))
    return competitions
  }

  async getBySeason(season: string) {
    const competition = await this.competitionService.findOne({
      where: {
        type: CompetitionType.ENDLESS,
        alias: season,
      },
    })
    if (competition === null) {
      return null
    }
    await this.fetchLevelInfo(competition)
    return competition
  }

  async fetchLevelInfo(competition: Competitions) {
    const levels = await this.scramblesRepository.find({
      where: {
        competitionId: competition.id,
      },
      order: {
        number: 'DESC',
      },
      relations: {
        kickoffs: {
          user: true,
          submission: true,
        },
      },
    })
    competition.levels = await Promise.all(
      levels.map(async level => {
        const competitors = await this.submissionsRepository.count({
          where: {
            scrambleId: level.id,
          },
        })
        const bestSubmission = await this.submissionsRepository.findOne({
          where: {
            scrambleId: level.id,
          },
          order: {
            moves: 'ASC',
          },
          relations: {
            user: true,
          },
        })
        let bestSubmissions: Submissions[] = []
        if (bestSubmission) {
          bestSubmissions = await this.submissionsRepository.find({
            where: {
              scrambleId: level.id,
              moves: bestSubmission.moves,
            },
            relations: {
              user: true,
            },
          })
          bestSubmissions.forEach(s => s.removeSolution())
        }
        return {
          level: level.number,
          competitors,
          bestSubmissions,
          kickedOffs: level.kickoffs.map(k => {
            k.removeSolution()
            return k
          }),
        }
      }),
    )
    switch (competition.subType) {
      case CompetitionSubType.REGULAR:
        competition.challenges = [this.configService.get<Challenge>('endless.kickoffMoves')]
        break
      case CompetitionSubType.BOSS_CHALLENGE:
        competition.challenges = this.configService.get<Challenge[]>('endless.bossChallenges')
        break
    }
  }

  handleScramble(scramble: Scrambles, competition: Competitions) {
    if (!scramble) {
      return
    }
    if (competition.subType === CompetitionSubType.HIDDEN_SCRAMBLE) {
      scramble.cubieCube = getCubieCube(scramble.scramble)
      scramble.removeScramble()
    }
  }

  async getStats(competition: Competitions) {
    // get all submissions
    const submissions = await this.submissionsRepository.find({
      where: {
        competitionId: competition.id,
      },
      order: {
        moves: 'ASC',
      },
      relations: {
        user: true,
        scramble: true,
      },
    })
    const singles: UserBest[] = []
    const singlesMap: Record<number, boolean> = {}
    const submissionsMap: Record<number, UserLevel> = {}
    for (const submission of submissions) {
      if (!singlesMap[submission.userId]) {
        singlesMap[submission.userId] = true
        submissionsMap[submission.userId] = {
          userId: submission.userId,
          user: submission.user,
          level: 0,
          rank: 0,
        }
        singles.push({
          userId: submission.userId,
          user: submission.user,
          level: submission.scramble.number,
          rank: 0,
          best: submission.moves,
        })
      }
      submissionsMap[submission.userId].level++
    }
    const results = await this.resultsRepository.find({
      where: {
        competitionId: competition.id,
      },
      order: {
        average: 'ASC',
        best: 'ASC',
      },
      relations: {
        user: true,
      },
    })
    // rolling average of 5 and average of 12
    const allRollingMo3: Results[] = []
    const allRollingAo5: Results[] = []
    const allRollingAo12: Results[] = []
    for (const result of results) {
      const length = result.values.length
      if (length < 3) {
        continue
      }
      for (let i = 0; i < length - 2; i++) {
        // mean of 3
        allRollingMo3.push(result.cloneRolling(i, 3, true))
        // average of 5
        if (length >= 5 && i < length - 4) {
          allRollingAo5.push(result.cloneRolling(i, 5))
          // average of 12
          if (length >= 12 && i < length - 11) {
            allRollingAo12.push(result.cloneRolling(i, 12))
          }
        }
      }
    }
    // sort means and averages
    allRollingMo3.sort(sortResult)
    allRollingAo5.sort(sortResult)
    allRollingAo12.sort(sortResult)
    // const { single, team } = this.configService.get<{ single: number; team: [number, number] }>('endless.kickoffMoves')
    // const kickedOffs = await this.kickoffRepository
    //   .createQueryBuilder('k')
    //   .select([`SUM(CASE WHEN s.moves <= ${single} THEN 1 ELSE 1/${team[1]} END) count`, 'u.*'])
    //   .leftJoin(Users, 'u', 'u.id = k.userId')
    //   .leftJoin(Submissions, 's', 's.id = k.submissionId')
    //   .where('k.competitionId = :competitionId', { competitionId: competition.id })
    //   .groupBy('k.userId')
    //   .orderBy('count', 'DESC')
    //   .limit(10)
    //   .getRawMany()

    return {
      // kickedOffs,
      highestLevels: getTopDistinctN(submissionsMap, 10, ['level'], true),
      singles: getTopN(singles, 10, ['best']),
      means: getTopN(
        results.filter(r => r.values.length >= 3),
        10,
      ),
      rollingMo3: getTopDistinctN(allRollingMo3, 10),
      rollingAo5: getTopDistinctN(allRollingAo5, 10),
      rollingAo12: getTopDistinctN(allRollingAo12, 10),
    }
  }

  async getProgress(competition: Competitions, user: Users): Promise<UserProgress> {
    const latestSubmission = await this.submissionsRepository.findOne({
      where: {
        competitionId: competition.id,
        userId: user.id,
      },
      order: {
        id: 'DESC',
      },
      relations: {
        scramble: true,
      },
    })
    if (!latestSubmission) {
      const nextScramble = await this.scramblesRepository.findOne({
        where: {
          competitionId: competition.id,
          number: 1,
        },
      })
      this.handleScramble(nextScramble, competition)
      return {
        current: null,
        next: {
          level: 1,
          scramble: nextScramble,
        },
      }
    }
    const nextScramble = await this.scramblesRepository.findOne({
      where: {
        competitionId: competition.id,
        number: latestSubmission.scramble.number + 1,
      },
    })
    this.handleScramble(nextScramble, competition)
    return {
      current: {
        level: latestSubmission.scramble.number,
        scramble: latestSubmission.scramble,
        submission: latestSubmission,
      },
      next: {
        level: latestSubmission.scramble.number + 1,
        scramble: nextScramble,
      },
    }
  }

  async getLevel(competition: Competitions, user: Users, level: number): Promise<Progress> {
    if (!user && level > 1) {
      throw new BadRequestException('Invalid level')
    }
    const scramble = await this.scramblesRepository.findOne({
      where: {
        competitionId: competition.id,
        number: level,
      },
      relations: {
        kickoffs: {
          user: true,
          submission: true,
        },
      },
    })
    if (scramble === null) {
      throw new BadRequestException('Invalid level')
    }
    if (level > 1) {
      const prevSubmission = await this.submissionsRepository.findOne({
        where: {
          competitionId: competition.id,
          userId: user.id,
          scramble: {
            number: scramble.number - 1,
          },
        },
      })
      if (prevSubmission === null) {
        throw new BadRequestException('Previous scramble not solved')
      }
    }
    let submission: Submissions = null
    if (user) {
      submission = await this.submissionsRepository.findOne({
        where: {
          userId: user.id,
          scrambleId: scramble.id,
        },
      })
    }
    const kickedBy = scramble.kickoffs.map(k => {
      k.removeSolution()
      return k
    })
    delete scramble.kickoffs
    this.handleScramble(scramble, competition)
    return {
      level,
      scramble,
      submission,
      kickedBy,
    }
  }

  async getLevelSubmissions(competition: Competitions, user: Users, level: number): Promise<Submissions[]> {
    const scramble = await this.scramblesRepository.findOne({
      where: {
        competitionId: competition.id,
        number: level,
      },
    })
    if (scramble === null) {
      throw new BadRequestException('Invalid level')
    }
    if (level > 1) {
      const prevSubmission = await this.submissionsRepository.findOne({
        where: {
          scramble: {
            number: scramble.number - 1,
          },
          userId: user.id,
        },
      })
      if (prevSubmission === null) {
        throw new BadRequestException('Previous scramble not solved')
      }
    }
    const submissions = await this.submissionsRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'u')
      .loadRelationCountAndMap('s.likes', 's.userActivities', 'ual', qb => qb.andWhere('ual.like = 1'))
      .loadRelationCountAndMap('s.favorites', 's.userActivities', 'uaf', qb => qb.andWhere('uaf.favorite = 1'))
      .where('s.scramble_id = :id', { id: scramble.id })
      .orderBy('s.moves', 'ASC')
      .getMany()
    return submissions
  }

  async submitSolution(competition: Competitions, user: Users, solution: SubmitSolutionDto) {
    if (competition.hasEnded) {
      throw new BadRequestException('Competition has ended')
    }
    const scramble = await this.scramblesRepository.findOne({
      where: {
        id: solution.scrambleId,
        competitionId: competition.id,
      },
    })
    if (scramble === null) {
      throw new BadRequestException('Invalid scramble')
    }
    // check for previous level
    if (scramble.number > 1) {
      const prevScramble = await this.scramblesRepository.findOne({
        where: {
          competitionId: competition.id,
          number: scramble.number - 1,
        },
      })
      const prevSubmission = await this.submissionsRepository.findOne({
        where: {
          scrambleId: prevScramble.id,
          userId: user.id,
        },
      })
      if (prevSubmission === null) {
        throw new BadRequestException('Previous scramble not solved')
      }
    }
    const prevSubmission = await this.submissionsRepository.findOne({
      where: {
        scrambleId: scramble.id,
        userId: user.id,
      },
    })
    if (prevSubmission !== null) {
      throw new BadRequestException('Already submitted')
    }
    const moves = calculateMoves(scramble.scramble, solution.solution)
    if (moves === DNF) {
      throw new BadRequestException('DNF')
    }
    const submission = new Submissions()
    submission.competition = competition
    submission.scramble = scramble
    submission.user = user
    submission.mode = solution.mode
    submission.solution = solution.solution
    submission.comment = solution.comment
    submission.moves = moves
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
      result.mode = submission.mode
      result.competition = competition
      result.user = user
      result.values = []
      result.best = 0
      result.average = 0
      await this.resultsRepository.save(result)
    }
    submission.result = result
    await this.submissionsRepository.save(submission)
    result.values.push(submission.moves)
    result.best = Math.min(...result.values)
    result.average = Math.round(result.values.reduce((a, b) => a + b, 0) / result.values.length)
    await this.resultsRepository.save(result)
    this.queue.add({
      competitionId: competition.id,
      userId: user.id,
      scrambleId: scramble.id,
      scrambleNumber: scramble.number,
      submissionId: submission.id,
      moves,
    })
    return submission
  }

  async update(
    competition: Competitions,
    user: Users,
    id: number,
    solution: Pick<SubmitSolutionDto, 'comment' | 'mode'>,
  ) {
    const submission = await this.submissionsRepository.findOne({
      where: {
        id,
        userId: user.id,
        competitionId: competition.id,
      },
    })
    if (submission === null) {
      throw new BadRequestException('Invalid submission')
    }
    submission.mode = solution.mode
    submission.comment = solution.comment
    return await this.submissionsRepository.save(submission)
  }
}
