import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, FindOneOptions, Repository } from 'typeorm'

import { AttachmentService } from '@/attachment/attachment.service'
import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { Attachments } from '@/entities/attachment.entity'
import { Competitions, CompetitionStatus, CompetitionType } from '@/entities/competitions.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { calculateMoves } from '@/utils'

import { ChainService } from './chain/chain.service'
import { EndlessService } from './endless/endless.service'
import { WeeklyService } from './weekly/weekly.service'

@Injectable()
export class CompetitionService {
  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    private readonly attachmentService: AttachmentService,
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
          case CompetitionType.DAILY:
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

  async getSubmissions(competition: Competitions) {
    const submissions = await this.submissionsRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'u')
      .leftJoinAndSelect('s.attachments', 'a')
      .loadRelationCountAndMap('s.likes', 's.userActivities', 'ual', qb => qb.andWhere('ual.like = 1'))
      .loadRelationCountAndMap('s.favorites', 's.userActivities', 'uaf', qb => qb.andWhere('uaf.favorite = 1'))
      .where('s.competition_id = :id', { id: competition.id })
      .orderBy('s.moves', 'ASC')
      .getMany()
    return submissions
  }

  async createSubmission(
    competition: Competitions,
    scramble: Scrambles,
    user: Users,
    dto: SubmitSolutionDto,
    options?: {
      moves?: number
    },
  ) {
    const submission = new Submissions()
    submission.competition = competition
    submission.mode = dto.mode
    submission.scramble = scramble
    submission.user = user
    submission.solution = dto.solution
    submission.comment = dto.comment
    const attachments = await this.attachmentService.findByIds(dto.attachments)
    submission.attachments = attachments
    if (typeof options?.moves === 'undefined') {
      const moves = calculateMoves(scramble.scramble, dto.solution)
      submission.moves = moves
    } else {
      submission.moves = options.moves
    }
    return submission
  }

  async updateUserSubmission(
    competition: Competitions,
    user: Users,
    id: number,
    newValues: Partial<SubmitSolutionDto>,
    allowKeys: (keyof Submissions)[] = ['comment', 'mode', 'attachments'],
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
    await this.updateSubmission(submission, newValues, allowKeys)
    return await this.submissionsRepository.save(submission)
  }

  async updateSubmission(
    submission: Submissions,
    newValues: Partial<SubmitSolutionDto | Submissions>,
    allowKeys: (keyof Submissions)[] = ['comment', 'mode', 'attachments'],
  ) {
    for (const key of allowKeys) {
      switch (key) {
        case 'solution':
        case 'comment':
          submission[key] = newValues[key]
          break
        case 'mode':
          submission[key] = newValues[key]
          break
        case 'attachments':
          if (typeof newValues.attachments[0] === 'number') {
            submission.attachments = await this.attachmentService.findByIds(newValues.attachments as number[])
          } else {
            submission.attachments = newValues.attachments as Attachments[]
          }
      }
    }
  }

  async getResults(competition: Competitions, where?: FindManyOptions<Results>['where']) {
    const results = await this.resultsRepository.find({
      where: {
        competitionId: competition.id,
        ...where,
      },
      order: {
        rank: 'ASC',
        average: 'ASC',
        best: 'ASC',
      },
      relations: {
        user: true,
      },
    })
    return results
  }
}
