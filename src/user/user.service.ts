import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IPaginationOptions, paginate, Pagination } from 'nestjs-typeorm-paginate'
import { Repository } from 'typeorm'

import { WCAProfile } from '@/auth/strategies/wca.strategy'
import { InsertionFinders } from '@/entities/insertion-finders.entity'
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
  ) {}

  async findOrCreate(profile: WCAProfile) {
    let user = await this.usersRepository.findOne({
      where: {
        email: profile.email,
      },
      relations: ['roles'],
    })
    if (!user) {
      user = new Users()
      user.email = profile.email
    }
    user.name = profile.name
    user.wcaId = profile.wca_id || ''
    user.avatar = profile.avatar.url || ''
    user.avatarThumb = profile.avatar.thumb_url || ''
    await this.usersRepository.save(user)
    return user
  }

  async findOne(id: number) {
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
}
