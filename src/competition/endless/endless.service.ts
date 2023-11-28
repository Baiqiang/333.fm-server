import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { fmcScramble } from 'twisty_puzzle_solver'
import { Repository } from 'typeorm'

import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { CompetitionMode, Competitions, CompetitionType } from '@/entities/competitions.entity'
import { EndlessKickoffs } from '@/entities/endless-kickoffs.entity'
import { DNF, Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { calculateMoves } from '@/utils'

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

@Injectable()
export class EndlessService {
  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    @InjectRepository(EndlessKickoffs)
    private readonly kickoffRepository: Repository<EndlessKickoffs>,
    @Inject(forwardRef(() => CompetitionService))
    private readonly competitionService: CompetitionService,
    @InjectQueue('endless')
    private readonly queue: Queue<EndlessJob>,
  ) {}

  async start(competition: Competitions) {
    const scramble = new Scrambles()
    scramble.competition = competition
    scramble.number = 1
    scramble.scramble = fmcScramble()
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
    })
    if (scramble === null) {
      throw new BadRequestException('Invalid level')
    }
    let kickedBy: EndlessKickoffs[] = []
    if (level > 1) {
      const prevSubmission = await this.submissionsRepository.findOne({
        where: {
          competitionId: competition.id,
          userId: user.id,
          scramble: {
            number: scramble.number - 1,
          },
        },
        relations: {
          scramble: {
            kickoffs: {
              user: true,
              submission: true,
            },
          },
        },
      })
      if (prevSubmission === null) {
        throw new BadRequestException('Previous scramble not solved')
      }
      kickedBy = prevSubmission.scramble.kickoffs.map(k => {
        k.removeSolution()
        return k
      })
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
    const submissions = await this.submissionsRepository.find({
      where: {
        scrambleId: scramble.id,
      },
      order: {
        moves: 'ASC',
      },
      relations: {
        user: true,
      },
    })
    return submissions
  }

  async submitSolution(competition: Competitions, user: Users, solution: SubmitSolutionDto) {
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
    submission.mode = CompetitionMode.REGULAR
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

  async updateComment(
    competition: Competitions,
    user: Users,
    id: number,
    solution: Pick<SubmitSolutionDto, 'comment'>,
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
    submission.comment = solution.comment
    return await this.submissionsRepository.save(submission)
  }
}
