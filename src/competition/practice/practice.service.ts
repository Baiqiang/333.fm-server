import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { In, Repository } from 'typeorm'

import { CreateCompetitionDto } from '@/dtos/create-comptition.dto'
import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import {
  CompetitionFormat,
  CompetitionMode,
  Competitions,
  CompetitionStatus,
  CompetitionType,
} from '@/entities/competitions.entity'
import { DNF, DNS, Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { calculateMoves } from '@/utils'
import { generateScrambles } from '@/utils/scramble'

import { CompetitionService } from '../competition.service'

export interface PracticeJob {
  competitionId: number
  userId: number
  scrambleId: number
  scrambleNumber: number
  submissionId: number
  moves: number
}

@Injectable()
export class PracticeService {
  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    @InjectQueue('practice')
    private readonly queue: Queue<PracticeJob>,
    @Inject(forwardRef(() => CompetitionService))
    private readonly competitionService: CompetitionService,
  ) {}

  async getByAlias(alias: string) {
    return this.competitionService.findOne({
      where: {
        type: CompetitionType.PERSONAL_PRACTICE,
        alias,
      },
      relations: {
        scrambles: true,
      },
    })
  }

  async getLatest(user: Users) {
    return await this.competitionService.findOne({
      where: {
        userId: user.id,
        type: CompetitionType.PERSONAL_PRACTICE,
      },
      order: {
        createdAt: 'DESC',
      },
      relations: {
        scrambles: true,
      },
    })
  }

  async getIndexInfo() {
    const [latest, mostAttended] = await Promise.all([
      this.competitionsRepository
        .createQueryBuilder('c')
        .innerJoinAndSelect('c.user', 'u')
        .leftJoin('c.results', 'r')
        .loadRelationCountAndMap('c.attendees', 'c.results')
        .where('c.type = :type', { type: CompetitionType.PERSONAL_PRACTICE })
        .groupBy('c.id')
        .orderBy('c.created_at', 'DESC')
        .limit(20)
        .getMany(),
      this.competitionsRepository
        .createQueryBuilder('c')
        .innerJoinAndSelect('c.user', 'u')
        .leftJoin('c.results', 'r')
        .loadRelationCountAndMap('c.attendees', 'c.results')
        .addSelect('COUNT(r.id)', 'attendees')
        .where('c.type = :type', { type: CompetitionType.PERSONAL_PRACTICE })
        .groupBy('c.id')
        .orderBy('attendees', 'DESC')
        .limit(20)
        .getMany(),
    ])
    await Promise.all(latest.map(competition => this.fetchInfo(competition)))
    return {
      latest,
      mostAttended,
    }
  }

  async getUserPractices(user: Users) {
    const competitions = await this.competitionService.findMany({
      where: {
        type: CompetitionType.PERSONAL_PRACTICE,
        userId: user.id,
      },
      order: {
        createdAt: 'DESC',
      },
      relations: {
        user: true,
      },
    })
    await Promise.all(competitions.map(competition => this.fetchInfo(competition)))
    return competitions
  }

  async fetchInfo(competition: Competitions, siblings = false) {
    const [attendees, ownerResult] = await Promise.all([
      this.resultsRepository.countBy({
        competitionId: competition.id,
      }),
      this.resultsRepository.findOneBy({
        competitionId: competition.id,
        userId: competition.userId,
      }),
    ])
    competition.attendees = attendees
    competition.ownerResult = ownerResult
    if (siblings) {
      const count = await this.competitionsRepository.countBy({
        type: CompetitionType.PERSONAL_PRACTICE,
        userId: competition.userId,
      })
      const index = parseInt(competition.alias.split('-').pop(), 10)
      if (index > 1) {
        competition.prevIndex = index - 1
      }
      if (index < count) {
        competition.nextIndex = index + 1
      }
    }
  }

  async checkFinished(user: Users, competition: Competitions) {
    const scrambles = await this.scramblesRepository.findBy({
      competitionId: competition.id,
    })
    if (scrambles.length === 0) {
      return false
    }
    const submissions = await this.submissionsRepository.findBy({
      scrambleId: In(scrambles.map(s => s.id)),
    })
    if (scrambles.every(({ id }) => submissions.some(({ scrambleId }) => scrambleId === id))) {
      return true
    }
    return false
  }

  async count(user: Users) {
    return await this.competitionsRepository.countBy({
      type: CompetitionType.PERSONAL_PRACTICE,
      userId: user.id,
    })
  }

  async create(user: Users, dto: CreateCompetitionDto) {
    const count = await this.count(user)
    const competition = new Competitions()
    competition.userId = user.id
    competition.user = user
    competition.type = CompetitionType.PERSONAL_PRACTICE
    competition.format = dto.format
    competition.name = `Practice #${count + 1}`
    competition.alias = `practice-${user.id}-${count + 1}`
    competition.startTime = new Date()
    competition.status = CompetitionStatus.ON_GOING
    await this.competitionsRepository.save(competition)
    const scrambleNum = competition.format === CompetitionFormat.MO3 ? 3 : 1
    const scrambles = generateScrambles(scrambleNum).map((str, number) => {
      const scramble = new Scrambles()
      scramble.number = number + 1
      scramble.scramble = str
      scramble.competitionId = competition.id
      return scramble
    })
    competition.scrambles = scrambles
    await this.scramblesRepository.save(scrambles)
    return competition
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
    const preSubmission = await this.submissionsRepository.findOne({
      where: {
        scrambleId: scramble.id,
        userId: user.id,
      },
    })
    if (preSubmission !== null) {
      throw new BadRequestException('You have already submitted a solution')
    }

    const submission = new Submissions()
    submission.competition = competition
    submission.mode = solution.mode
    submission.scramble = scramble
    submission.user = user
    submission.solution = solution.solution
    submission.comment = solution.comment
    const moves = calculateMoves(scramble.scramble, solution.solution)
    submission.moves = moves
    let result = await this.resultsRepository.findOne({
      where: {
        competitionId: competition.id,
        userId: user.id,
      },
    })
    if (result === null) {
      result = new Results()
      result.mode = CompetitionMode.REGULAR
      result.competition = competition
      result.user = user
      result.values = competition.scrambles.map(() => 0)
      result.best = 0
      result.average = 0
      await this.resultsRepository.save(result)
    }
    submission.result = result
    await this.submissionsRepository.save(submission)
    result.values[scramble.number - 1] = submission.moves
    const nonZeroValues = result.values.filter(value => value > 0)
    result.best = Math.min(...nonZeroValues)
    result.average = Math.round(nonZeroValues.reduce((a, b) => a + b, 0) / nonZeroValues.length)
    if (result.values.some(v => v === DNF || v === DNS)) {
      result.average = DNF
    }
    await this.resultsRepository.save(result)
    await this.queue.add({
      competitionId: competition.id,
      userId: user.id,
      scrambleId: scramble.id,
      scrambleNumber: scramble.number,
      submissionId: submission.id,
      moves,
    })
    return submission
  }

  async update(competition: Competitions, user: Users, id: number, solution: Pick<SubmitSolutionDto, 'comment'>) {
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
