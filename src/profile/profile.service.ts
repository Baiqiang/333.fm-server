import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate'
import { FindOptionsWhere, In, Repository } from 'typeorm'

import { Competitions } from '@/entities/competitions.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
  ) {}

  async getUserSubmissions(user: Users, type: number, options: IPaginationOptions, currentUser?: Users) {
    const where: FindOptionsWhere<Submissions> = {
      userId: user.id,
    }
    if (!Number.isNaN(type)) {
      where.competition = {
        type,
      }
    }
    const data = await paginate<Submissions>(this.submissionsRepository, options, {
      where,
      order: {
        createdAt: 'DESC',
      },
      relations: ['scramble', 'competition'],
    })
    if (currentUser) {
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
        }
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
