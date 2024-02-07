import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate'
import { FindOptionsWhere, In, Repository } from 'typeorm'

import { Competitions, CompetitionType } from '@/entities/competitions.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    private readonly userService: UserService,
  ) {}

  async getUserSubmissions(user: Users, type: number, options: IPaginationOptions, currentUser?: Users) {
    const queryBuilder = this.submissionsRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.scramble', 'sc')
      .leftJoinAndSelect('s.competition', 'c')
      .loadRelationCountAndMap('s.likes', 's.userActivities', 'ual', qb => qb.andWhere('ual.like = 1'))
      .loadRelationCountAndMap('s.favorites', 's.userActivities', 'uaf', qb => qb.andWhere('uaf.favorite = 1'))
      .where('s.user_id = :userId', { userId: user.id })
      .orderBy('s.created_at', 'DESC')
    if (!Number.isNaN(type)) {
      queryBuilder.andWhere('c.type = :type', { type })
    }
    const data = await paginate<Submissions>(queryBuilder, options)
    if (currentUser) {
      await this.userService.loadUserActivities(currentUser, data.items)
      if (currentUser.id === user.id) {
        for (const submission of data.items) {
          submission.alreadySubmitted = true
        }
      } else {
        const submittedMap: Record<number, boolean> = {}
        const scrambleIds = data.items.map(item => item.scrambleId)
        const currentUserSubmissions = await this.submissionsRepository.find({
          where: {
            scrambleId: In(scrambleIds),
            userId: currentUser.id,
          },
        })
        for (const submission of currentUserSubmissions) {
          submittedMap[submission.scrambleId] = true
        }
        for (const submission of data.items) {
          submission.alreadySubmitted = submittedMap[submission.scrambleId] || false
          if (!submission.alreadySubmitted) {
            let hideSolution = true
            if (submission.competition.type === CompetitionType.WEEKLY && submission.competition.hasEnded) {
              hideSolution = false
            }
            if (hideSolution) {
              submission.removeSolution()
              submission.moves = 0
              submission.scramble.removeScramble()
            }
          }
        }
      }
    } else {
      for (const submission of data.items) {
        submission.alreadySubmitted = false
        submission.removeSolution()
        submission.moves = 0
        submission.scramble.removeScramble()
      }
    }
    // filters
    data.meta.filters = []
    if (data.meta.totalItems > 0) {
      const competitions = await this.submissionsRepository
        .createQueryBuilder('s')
        .select(['c.type as type', 'COUNT(s.id) as count'])
        .leftJoin(Competitions, 'c', 'c.id = s.competition_id')
        .where('s.user_id = :id', { id: user.id })
        .groupBy('c.type')
        .getRawMany()
      data.meta.filters = competitions
    }
    return data
  }
}
