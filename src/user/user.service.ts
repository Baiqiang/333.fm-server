import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IPaginationOptions, paginate, Pagination } from 'nestjs-typeorm-paginate'
import { FindOptionsWhere, In, Repository } from 'typeorm'

import { WCAProfile } from '@/auth/strategies/wca.strategy'
import { BotService } from '@/bot/bot.service'
import { InsertionFinders } from '@/entities/insertion-finders.entity'
import { Submissions } from '@/entities/submissions.entity'
import { UserActivities } from '@/entities/user-activities.entity'
import { UserInsertionFinders } from '@/entities/user-insertion-finders.entity'
import { UserRoles } from '@/entities/user-roles.entity'
import { Users } from '@/entities/users.entity'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserInsertionFinders)
    private readonly userInsertionFindersRepository: Repository<UserInsertionFinders>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    @InjectRepository(UserRoles)
    private readonly userRolesRepository: Repository<UserRoles>,
    @InjectRepository(UserActivities)
    private readonly userActivitiesRepository: Repository<UserActivities>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    private readonly botService: BotService,
  ) {}

  async findOrCreate(profile: WCAProfile) {
    // profile.id is unique
    let user = await this.usersRepository.findOne({
      where: {
        source: 'WCA',
        sourceId: profile.id.toString(),
      },
    })
    // check wca id for backward compatibility
    if (!user && profile.wca_id) {
      user = await this.usersRepository.findOne({
        where: {
          source: 'WCA',
          sourceId: profile.wca_id,
        },
      })
    }
    // check email for backward compatibility
    if (!user) {
      user = await this.usersRepository.findOne({
        where: {
          email: profile.email,
        },
      })
    }
    if (!user) {
      user = new Users()
    }
    user.email = profile.email
    user.name = profile.name
    user.wcaId = profile.wca_id || ''
    user.avatar = profile.avatar.url || ''
    user.avatarThumb = profile.avatar.thumb_url || ''
    user.source = 'WCA'
    user.sourceId = profile.id.toString()
    await this.usersRepository.save(user)
    return user
  }

  async createDummyUser(wcaId: string, name: string, avatarThumb?: string) {
    const user = new Users()
    user.wcaId = wcaId
    user.name = name
    user.source = 'WCA'
    user.sourceId = wcaId
    user.email = `${wcaId}@333.fm`
    user.avatar = ''
    user.avatarThumb = avatarThumb || ''
    await this.usersRepository.save(user)
    return user
  }

  async findOne(id: number | string) {
    if (typeof id === 'string') {
      if (/^\d{4}[A-Z]{4}\d{2}$/.test(id)) {
        return this.usersRepository.findOne({
          where: {
            source: 'WCA',
            wcaId: id,
          },
          relations: ['roles'],
        })
      }
      id = parseInt(id, 10)
      if (isNaN(id) || id < 1) {
        return null
      }
    }
    return this.usersRepository.findOne({
      where: { id },
      relations: ['roles'],
    })
  }

  getUserIFs(user: Users, options: IPaginationOptions): Promise<Pagination<UserInsertionFinders>> {
    return paginate<UserInsertionFinders>(this.userInsertionFindersRepository, options, {
      where: {
        userId: user.id,
      },
      order: {
        createdAt: 'DESC',
      },
      relations: ['insertionFinder', 'insertionFinder.realInsertionFinder', 'insertionFinder.realInsertionFinder.algs'],
    })
  }

  countUserIFs(user: Users) {
    return this.userInsertionFindersRepository.count({
      where: {
        userId: user.id,
      },
    })
  }

  getUserIFByHash(user: Users, hash: string) {
    return this.userInsertionFindersRepository.findOne({
      where: {
        userId: user.id,
        insertionFinder: {
          hash,
        },
      },
      relations: ['insertionFinder', 'insertionFinder.realInsertionFinder', 'insertionFinder.realInsertionFinder.algs'],
    })
  }

  getUsers(options: IPaginationOptions): Promise<Pagination<Users>> {
    return paginate<Users>(this.usersRepository, options, {
      order: {
        createdAt: 'DESC',
      },
      relations: ['roles'],
    })
  }

  async createUserIF(user: Users, insertionFinder: InsertionFinders, name: string) {
    let userIF = await this.userInsertionFindersRepository.findOne({
      where: {
        userId: user.id,
        insertionFinderId: insertionFinder.id,
      },
      withDeleted: true,
    })
    if (userIF) {
      userIF.name = name
      return await this.userInsertionFindersRepository.recover(userIF)
    }
    userIF = new UserInsertionFinders()
    userIF.user = user
    userIF.insertionFinder = insertionFinder
    userIF.name = name
    return await this.userInsertionFindersRepository.save(userIF)
  }

  saveUserIF(userIF: UserInsertionFinders) {
    return this.userInsertionFindersRepository.save(userIF)
  }

  deleteUserIF(userIF: UserInsertionFinders) {
    return this.userInsertionFindersRepository.softRemove(userIF)
  }

  getSubmission(id: number) {
    return this.submissionsRepository.findOne({
      where: {
        id,
      },
      relations: {
        competition: true,
      },
    })
  }

  getUserSubmission(scrambleId: number, user: Users) {
    return this.submissionsRepository.findOneBy({
      scrambleId,
      userId: user.id,
    })
  }

  async loadUserActivities(user: Users, submissions: Submissions[]) {
    const submissionIds = submissions.map(submission => submission.id)
    const userActivities = await this.userActivitiesRepository.find({
      where: {
        userId: user.id,
        submissionId: In(submissionIds),
      },
    })
    const userActivitiesMap: Record<number, UserActivities> = {}
    userActivities.forEach(userActivity => {
      userActivitiesMap[userActivity.submissionId] = userActivity
    })
    for (const submission of submissions) {
      submission.liked = userActivitiesMap[submission.id]?.like || false
      submission.favorited = userActivitiesMap[submission.id]?.favorite || false
      submission.viewed = userActivitiesMap[submission.id]?.view || false
      submission.declined = userActivitiesMap[submission.id]?.decline || false
      submission.notification = userActivitiesMap[submission.id]?.notify || false
    }
  }

  async act(
    user: Users,
    submissionId: number,
    body: Partial<Record<'like' | 'favorite' | 'decline' | 'view' | 'notify', boolean>>,
  ) {
    let userActivitie = await this.userActivitiesRepository.findOneBy({
      userId: user.id,
      submissionId,
    })
    if (!userActivitie) {
      userActivitie = new UserActivities()
      userActivitie.user = user
      userActivitie.submissionId = submissionId
      userActivitie.like = false
      userActivitie.favorite = false
      userActivitie.decline = false
      userActivitie.view = false
      userActivitie.notify = false
    }
    for (const key of ['like', 'favorite', 'decline', 'view', 'notify']) {
      if (key in body) {
        userActivitie[key] = Boolean(body[key])
      }
    }
    await this.userActivitiesRepository.save(userActivitie)
    return userActivitie
  }

  async getActivities(
    user: Users,
    where: FindOptionsWhere<UserActivities>,
    options: IPaginationOptions,
  ): Promise<Pagination<Submissions>> {
    where.userId = user.id
    const queryBuilder = this.userActivitiesRepository
      .createQueryBuilder('ua')
      .leftJoinAndSelect('ua.submission', 'submission')
      .leftJoinAndSelect('submission.competition', 'competition')
      .leftJoinAndSelect('submission.scramble', 'scramble')
      .leftJoinAndSelect('submission.user', 'user')
      .loadRelationCountAndMap('submission.likes', 'submission.userActivities', 'ual', qb =>
        qb.andWhere('ual.like = 1'),
      )
      .loadRelationCountAndMap('submission.favorites', 'submission.userActivities', 'uaf', qb =>
        qb.andWhere('uaf.favorite = 1'),
      )
      .where(where)
      .orderBy('ua.created_at', 'DESC')
    const data = await paginate<UserActivities>(queryBuilder, options)
    return {
      items: data.items.map(x => {
        x.submission.hideSolution = false
        x.submission.liked = x.like
        x.submission.favorited = x.favorite
        return x.submission
      }),
      meta: data.meta,
    }
  }

  async getBotToken(user: Users) {
    return this.botService.getOrGenerateToken(user)
  }
}
