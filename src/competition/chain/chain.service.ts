import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository, TreeRepository } from 'typeorm'

import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { Competitions, CompetitionStatus, CompetitionType } from '@/entities/competitions.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { SubmissionPhase, Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { calculatePhases } from '@/utils'
import { generateScramble } from '@/utils/scramble'

import { CompetitionService } from '../competition.service'

@Injectable()
export class ChainService {
  constructor(
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: TreeRepository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    private readonly competitionService: CompetitionService,
  ) {}

  get() {
    return this.competitionService.findOne({
      where: {
        type: CompetitionType.FMC_CHAIN,
        status: CompetitionStatus.ON_GOING,
      },
      relations: {
        scrambles: true,
      },
      order: {
        id: 'DESC',
      },
    })
  }

  getSubmission(competition: Competitions, scramble: Scrambles, id: number) {
    return this.submissionsRepository.findOne({
      where: {
        id,
        competitionId: competition.id,
        scrambleId: scramble.id,
      },
    })
  }

  getTree(submission: Submissions) {
    return this.submissionsRepository.findAncestorsTree(submission, {
      relations: ['user'],
    })
  }

  async getSubmissions(competition: Competitions, scramble: Scrambles, parent: Submissions | null) {
    const queryBuilder = this.submissionsRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'u')
      .loadRelationCountAndMap('s.likes', 's.userActivities', 'ual', qb => qb.andWhere('ual.like = 1'))
      .loadRelationCountAndMap('s.favorites', 's.userActivities', 'uaf', qb => qb.andWhere('uaf.favorite = 1'))
      .where('s.competition_id = :competitionId and s.scramble_id = :scrambleId', {
        competitionId: competition.id,
        scrambleId: scramble.id,
      })
      .orderBy('s.cumulative_moves', 'ASC')
    if (parent) {
      queryBuilder.andWhere('s.parent_id = :parentId', { parentId: parent.id })
    } else {
      queryBuilder.andWhere('s.parent_id IS NULL')
    }
    const submissions = await queryBuilder.getMany()
    await Promise.all(
      submissions.map(async submission => {
        const childrenLength = (await this.submissionsRepository.countDescendants(submission)) - 1
        submission.childrenLength = childrenLength
      }),
    )
    return submissions
  }

  async getTopN(competition: Competitions, scramble: Scrambles, n: number) {
    const submissions = await this.submissionsRepository.find({
      where: {
        competitionId: competition.id,
        scrambleId: scramble.id,
        phase: In([SubmissionPhase.FINISHED, SubmissionPhase.INSERTIONS]),
      },
      order: {
        cumulativeMoves: 'ASC',
      },
      take: n,
    })
    return Promise.all(submissions.map(submission => this.getTree(submission)))
  }

  async submitSolution(competition: Competitions, user: Users, dto: SubmitSolutionDto) {
    if (competition.hasEnded) {
      throw new BadRequestException('Competition has ended')
    }
    const scramble = await this.scramblesRepository.findOne({
      where: {
        id: dto.scrambleId,
        competitionId: competition.id,
      },
    })
    if (scramble === null) {
      throw new BadRequestException('Invalid scramble')
    }
    const submission = new Submissions()
    let parent: Submissions | null = null
    if (dto.parentId) {
      parent = await this.submissionsRepository.findOne({
        where: {
          id: dto.parentId,
          competitionId: competition.id,
          scrambleId: scramble.id,
        },
      })
      if (parent === null) {
        throw new BadRequestException('Invalid parent')
      }
      parent = await this.submissionsRepository.findAncestorsTree(parent)
      submission.parent = parent
      if (parent === null) {
        throw new BadRequestException('Invalid parent')
      }
    }
    const { phase, solution, moves, cancelMoves, cumulativeMoves } = calculatePhases(scramble.scramble, dto, parent)
    // check moves
    if (moves === 0 || dto.solution.toUpperCase().includes('NISS')) {
      throw new BadRequestException('Invalid solution')
    }
    switch (phase) {
      case SubmissionPhase.SCRAMBLED:
        throw new BadRequestException('Invalid solution')
      case SubmissionPhase.EO:
      case SubmissionPhase.DR:
      case SubmissionPhase.HTR:
      case SubmissionPhase.SKELETON:
        if (
          parent &&
          (phase <= parent.phase || parent.phase === SubmissionPhase.FINISHED) &&
          !(phase === SubmissionPhase.HTR && parent.phase === SubmissionPhase.SKELETON)
        ) {
          throw new BadRequestException('Invalid solution')
        }
        submission.phase = phase
        break
      case SubmissionPhase.FINISHED:
      case SubmissionPhase.INSERTIONS:
        submission.phase = phase
        break
    }
    // check duplicate
    const duplicate = await this.submissionsRepository.findOne({
      where: {
        competitionId: competition.id,
        scrambleId: scramble.id,
        solution,
        parentId: parent ? parent.id : IsNull(),
      },
    })
    if (duplicate) {
      throw new BadRequestException('Duplicate solution')
    }
    submission.competition = competition
    submission.scramble = scramble
    submission.user = user
    submission.mode = dto.mode
    submission.solution = solution
    submission.insertions = dto.insertions ?? null
    submission.inverse = dto.inverse
    submission.comment = dto.comment
    submission.moves = moves
    submission.cancelMoves = cancelMoves
    submission.cumulativeMoves = cumulativeMoves
    await this.submissionsRepository.save(submission)
    return submission
  }

  async start(competition: Competitions) {
    const scramble = new Scrambles()
    scramble.competition = competition
    scramble.number = 1
    scramble.scramble = generateScramble()
    await this.scramblesRepository.save(scramble)
  }
}
