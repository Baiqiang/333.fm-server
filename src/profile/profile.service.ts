import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate'
import { In, Repository } from 'typeorm'

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

  async getUserSubmissions(user: Users, options: IPaginationOptions, currentUser?: Users) {
    const data = await paginate<Submissions>(this.submissionsRepository, options, {
      where: {
        userId: user.id,
      },
      order: {
        createdAt: 'DESC',
      },
      relations: ['scramble', 'competition'],
    })
    if (currentUser) {
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
    return data
  }
}
