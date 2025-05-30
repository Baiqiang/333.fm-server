import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate'
import { FindOptionsWhere, In, Repository, TreeRepository } from 'typeorm'

import {
  CompetitionFormat,
  CompetitionMode,
  Competitions,
  CompetitionStatus,
  CompetitionType,
} from '@/entities/competitions.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: TreeRepository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    private readonly userService: UserService,
  ) {}

  async getUserRecords(user: Users) {
    const weeklyRecord = await this.getRecordByType(user, CompetitionType.WEEKLY, true)
    const dailyRecord = await this.getRecordByType(user, CompetitionType.DAILY, true)
    const practiceRecord = await this.getRecordByType(user, CompetitionType.PERSONAL_PRACTICE)
    const endlessCompetitions = await this.competitionsRepository.find({
      where: {
        type: CompetitionType.ENDLESS,
      },
    })
    const endlessBests = await this.submissionsRepository
      .createQueryBuilder('s')
      .where('s.competition_id IN(:...competitionIds)', { competitionIds: endlessCompetitions.map(c => c.id) })
      .andWhere('s.user_id = :userId', { userId: user.id })
      .select([
        's.competition_id AS competitionId',
        'MIN(moves) AS single',
        'AVG(moves) AS mean',
        'COUNT(s.id) AS levels',
      ])
      .groupBy('s.competition_id')
      .getRawMany<{
        competitionId: number
        levels: string
        single: number
        mean: number
      }>()
    const endlessCompetitionsMap = Object.fromEntries(endlessCompetitions.map(c => [c.id, c]))
    const endlessStatsMap: Record<
      number,
      {
        competition: Competitions
        single: number
        mean: number
        levels: number
      }
    > = {}
    for (const { competitionId, single, mean, levels } of endlessBests) {
      endlessStatsMap[competitionId] = {
        competition: endlessCompetitionsMap[competitionId],
        single,
        mean: Math.floor(mean),
        levels: parseInt(levels),
      }
    }
    const endlessRecords = Object.values(endlessStatsMap)
    endlessRecords.sort((a, b) => b.competition.id - a.competition.id)
    return {
      competitionRecords: [
        {
          type: 'weekly',
          record: weeklyRecord,
        },
        {
          type: 'daily',
          record: dailyRecord,
        },
        {
          type: 'practice',
          record: practiceRecord,
        },
      ].filter(({ record }) => record.single > 0),
      endlessRecords,
    }
  }

  private async getRecordByType(user: Users, type: CompetitionType, ended: boolean = false) {
    const bestQb = this.resultsRepository
      .createQueryBuilder('r')
      .leftJoin('r.competition', 'c')
      .where('r.user_id = :userId', { userId: user.id })
      .andWhere('r.mode = :mode', { mode: CompetitionMode.REGULAR })
      .andWhere('c.type = :type', {
        type,
      })
      .select(['MIN(r.best) AS single'])
    if (ended) {
      bestQb.andWhere('c.status = :status', { status: CompetitionStatus.ENDED })
    }
    const averageQb = bestQb
      .clone()
      .andWhere('c.format = :format', { format: CompetitionFormat.MO3 })
      .andWhere('!JSON_CONTAINS(`values`, "0")')
      .select(['MIN(r.average) AS mean'])
    const { single } = await bestQb.getRawOne<{ single: number }>()
    const { mean } = await averageQb.getRawOne<{ mean: number }>()
    const competitionCondition: FindOptionsWhere<Competitions> = {
      type,
    }
    if (ended) {
      competitionCondition.status = CompetitionStatus.ENDED
    }
    const bestSingles = await this.submissionsRepository.find({
      where: {
        moves: single,
        userId: user.id,
        competition: competitionCondition,
      },
      relations: {
        result: {
          competition: {
            user: true,
          },
        },
      },
    })
    const bestMeans = await this.resultsRepository.find({
      where: {
        average: mean,
        userId: user.id,
        competition: competitionCondition,
      },
      relations: {
        competition: {
          user: true,
        },
        submissions: true,
      },
      order: {
        createdAt: 'DESC',
      },
    })
    return {
      single,
      mean,
      bestSingles: bestSingles.map(s => s.result),
      bestMeans: bestMeans.filter(r => r.submissions.length > 1),
    }
  }

  async getUserResultsByType(user: Users, type: CompetitionType) {
    const results = await this.resultsRepository.find({
      where: {
        userId: user.id,
        competition: {
          type,
          status: CompetitionStatus.ENDED,
        },
      },
      relations: {
        competition: true,
        submissions: {
          scramble: true,
        },
      },
      order: {
        competition: {
          startTime: 'DESC',
        },
      },
    })

    return results.filter(r => r.submissions.length > 0)
  }

  async getUserPracticeResults(user: Users) {
    const results = await this.resultsRepository.find({
      where: {
        userId: user.id,
        competition: {
          type: CompetitionType.PERSONAL_PRACTICE,
        },
      },
      relations: {
        competition: {
          user: true,
        },
        submissions: {
          scramble: true,
        },
      },
      order: {
        updatedAt: 'DESC',
      },
    })

    return results.filter(r => r.submissions.length > 0)
  }

  async getUserEndlessSubmissions(user: Users, currentUser?: Users, alias?: string) {
    const queryBuilder = this.submissionsRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.scramble', 'sc')
      .leftJoinAndSelect('s.competition', 'c')
      .leftJoinAndSelect('c.user', 'u')
      .leftJoinAndSelect('s.attachments', 'a')
      .loadRelationCountAndMap('s.likes', 's.userActivities', 'ual', qb => qb.andWhere('ual.like = 1'))
      .loadRelationCountAndMap('s.favorites', 's.userActivities', 'uaf', qb => qb.andWhere('uaf.favorite = 1'))
      .where('s.user_id = :userId', { userId: user.id })
      .andWhere('c.type = :type', { type: CompetitionType.ENDLESS })
      .orderBy('s.created_at', 'DESC')
    if (alias) {
      const endless = await this.competitionsRepository.findOne({
        where: {
          type: CompetitionType.ENDLESS,
          alias,
        },
      })
      if (endless) {
        queryBuilder.andWhere('s.competition_id = :competitionId', { competitionId: endless.id })
      }
    }
    const submissions = await queryBuilder.getMany()
    const scrambleIds = submissions.map(s => s.scrambleId)
    if (currentUser && currentUser.id === user.id) {
      for (const submission of submissions) {
        submission.hideSolution = false
      }
    } else {
      const submittedMap: Record<number, boolean> = {}
      if (currentUser) {
        await this.userService.loadUserActivities(currentUser, submissions)
        const currentUserSubmissions = await this.submissionsRepository.find({
          where: {
            scrambleId: In(scrambleIds),
            userId: currentUser.id,
          },
        })
        for (const submission of currentUserSubmissions) {
          submittedMap[submission.scrambleId] = true
        }
      }
      for (const submission of submissions) {
        submission.hideSolution = !submittedMap[submission.scrambleId]
        if (submission.hideSolution) {
          submission.removeSolution()
          submission.moves = 0
          submission.scramble.removeScramble()
        }
      }
    }
    return submissions
  }

  async getUserJoinedEndlesses(user: Users) {
    const competitions = await this.competitionsRepository.find({
      where: {
        type: CompetitionType.ENDLESS,
      },
    })
    const joinedEndlesses: Record<number, number> = {}
    await Promise.all(
      competitions.map(async competition => {
        const count = await this.submissionsRepository.count({
          where: {
            userId: user.id,
            competitionId: competition.id,
          },
        })
        joinedEndlesses[competition.id] = count
      }),
    )
    return competitions.filter(c => joinedEndlesses[c.id] > 0)
  }

  async getUserSubmissions(user: Users, type: number, options: IPaginationOptions, currentUser?: Users) {
    const queryBuilder = this.submissionsRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.scramble', 'sc')
      .leftJoinAndSelect('s.competition', 'c')
      .leftJoinAndSelect('c.user', 'u')
      .leftJoinAndSelect('s.attachments', 'a')
      .loadRelationCountAndMap('s.likes', 's.userActivities', 'ual', qb => qb.andWhere('ual.like = 1'))
      .loadRelationCountAndMap('s.favorites', 's.userActivities', 'uaf', qb => qb.andWhere('uaf.favorite = 1'))
      .where('s.user_id = :userId', { userId: user.id })
      .orderBy('s.created_at', 'DESC')
    if (!Number.isNaN(type)) {
      queryBuilder.andWhere('c.type = :type', { type })
    }
    const data = await paginate<Submissions>(queryBuilder, options)
    const scrambleIds = await Promise.all(
      data.items.map(async item => {
        // fetch parent
        if (item.parentId) {
          await this.submissionsRepository.findAncestorsTree(item)
        }
        return item.scrambleId
      }),
    )
    if (currentUser && currentUser.id === user.id) {
      for (const submission of data.items) {
        submission.hideSolution = false
      }
    } else {
      const submittedMap: Record<number, boolean> = {}
      if (currentUser) {
        await this.userService.loadUserActivities(currentUser, data.items)
        const currentUserSubmissions = await this.submissionsRepository.find({
          where: {
            scrambleId: In(scrambleIds),
            userId: currentUser.id,
          },
        })
        for (const submission of currentUserSubmissions) {
          submittedMap[submission.scrambleId] = true
        }
      }
      for (const submission of data.items) {
        submission.hideSolution = !submittedMap[submission.scrambleId]
        if (
          [CompetitionType.WEEKLY, CompetitionType.DAILY, CompetitionType.LEAGUE].includes(
            submission.competition.type,
          ) &&
          submission.competition.hasEnded
        ) {
          submission.hideSolution = false
        }
        if (submission.hideSolution) {
          submission.removeSolution()
          submission.moves = 0
          submission.scramble.removeScramble()
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
