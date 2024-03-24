import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { EndlessKickoffs } from '@/entities/endless-kickoffs.entity'
import { Results } from '@/entities/results.entity'
import { Submissions } from '@/entities/submissions.entity'
import { UserInsertionFinders } from '@/entities/user-insertion-finders.entity'
import { Users } from '@/entities/users.entity'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    @InjectRepository(EndlessKickoffs)
    private readonly endlessKickoffsRepository: Repository<EndlessKickoffs>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    @InjectRepository(UserInsertionFinders)
    private readonly userInsertionFindersRepository: Repository<UserInsertionFinders>,
  ) {}

  async merge() {
    const duplicatedWCAIds = await this.usersRepository
      .createQueryBuilder()
      .select('wca_id wcaId')
      .where('wca_id != "" && source != "MERGED"')
      .groupBy('wca_id')
      .having('count(wca_id) > 1')
      .getRawMany<{ wcaId: string }>()
    console.log(duplicatedWCAIds.length)
    for (const { wcaId } of duplicatedWCAIds) {
      const users = await this.usersRepository.find({
        where: {
          wcaId,
        },
        order: {
          id: 'ASC',
        },
      })
      const mainUser = users[users.length - 1]
      console.log(mainUser.name, users.length)
      for (const user of users.slice(0, -1)) {
        // merge into mainUser
        await this.submissionsRepository.update({ userId: user.id }, { userId: mainUser.id })
        await this.resultsRepository.update({ userId: user.id }, { userId: mainUser.id })
        await this.endlessKickoffsRepository.update({ userId: user.id }, { userId: mainUser.id })
        await this.userInsertionFindersRepository.update({ userId: user.id }, { userId: mainUser.id })
        user.source = 'MERGED'
        await this.usersRepository.save(user)
      }
    }
    // set source to WCA and sourceId to wcaId if source is empty
    await this.usersRepository
      .createQueryBuilder()
      .update(Users)
      .set({
        source: 'WCA',
        sourceId: () => 'wca_id',
      })
      .where('source = ""')
      .execute()
  }
}
