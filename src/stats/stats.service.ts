import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import dayjs from 'dayjs'
import { In, Repository } from 'typeorm'

import { Comments } from '@/entities/comments.entity'
import {
  CompetitionMode,
  Competitions,
  CompetitionStatus,
  CompetitionSubType,
  CompetitionType,
} from '@/entities/competitions.entity'
import { Results } from '@/entities/results.entity'
import { Submissions } from '@/entities/submissions.entity'
import { UserActivities } from '@/entities/user-activities.entity'
import { Users } from '@/entities/users.entity'

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    @InjectRepository(UserActivities)
    private readonly userActivitiesRepository: Repository<UserActivities>,
    @InjectRepository(Comments)
    private readonly commentsRepository: Repository<Comments>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
  ) {}

  async getAll() {
    const [topLiked, topFavorited, topCommented, weeklyBestSingles, weeklyActiveSubmitters, topSubmitters, topWinners] =
      await Promise.all([
        this.getTopLiked(),
        this.getTopFavorited(),
        this.getTopCommented(),
        this.getWeeklyBestSingles(),
        this.getWeeklyActiveSubmitters(),
        this.getTopSubmitters(),
        this.getTopWinners(),
      ])

    return {
      topLiked,
      topFavorited,
      topCommented,
      weeklyBestSingles,
      weeklyActiveSubmitters,
      topSubmitters,
      topWinners,
    }
  }

  private async loadSubmissionsByIds(ids: number[]) {
    if (ids.length === 0) return []
    const submissions = await this.submissionsRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'u')
      .leftJoinAndSelect('s.competition', 'c')
      .leftJoinAndSelect('c.user', 'cUser')
      .leftJoinAndSelect('s.scramble', 'sc')
      .loadRelationCountAndMap('s.likes', 's.userActivities', 'ual', qb => qb.andWhere('ual.like = 1'))
      .loadRelationCountAndMap('s.favorites', 's.userActivities', 'uaf', qb => qb.andWhere('uaf.favorite = 1'))
      .where('s.id IN (:...ids)', { ids })
      .getMany()
    const map = new Map(submissions.map(s => [s.id, s]))
    return ids.map(id => map.get(id)).filter(Boolean) as Submissions[]
  }

  async getTopLiked(limit = 10) {
    const likeCountExpr = '(SELECT COUNT(*) FROM user_activities ua WHERE ua.submission_id = s.id AND ua.`like` = 1)'
    const ranked = await this.submissionsRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .addSelect(likeCountExpr, 'cnt')
      .leftJoin('s.competition', 'c')
      .where('c.type != :chain', { chain: CompetitionType.FMC_CHAIN })
      .andWhere('c.subType NOT IN (:...practiceSubTypes)', {
        practiceSubTypes: [
          CompetitionSubType.EO_PRACTICE,
          CompetitionSubType.DR_PRACTICE,
          CompetitionSubType.HTR_PRACTICE,
        ],
      })
      .andWhere('s.moves > 0')
      .andWhere(`${likeCountExpr} > 0`)
      .orderBy(likeCountExpr, 'DESC')
      .limit(limit)
      .getRawMany()

    return this.loadSubmissionsByIds(ranked.map(r => r.id))
  }

  async getTopFavorited(limit = 10) {
    const favCountExpr = '(SELECT COUNT(*) FROM user_activities ua WHERE ua.submission_id = s.id AND ua.favorite = 1)'
    const ranked = await this.submissionsRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .addSelect(favCountExpr, 'cnt')
      .leftJoin('s.competition', 'c')
      .where('c.type != :chain', { chain: CompetitionType.FMC_CHAIN })
      .andWhere('c.subType NOT IN (:...practiceSubTypes)', {
        practiceSubTypes: [
          CompetitionSubType.EO_PRACTICE,
          CompetitionSubType.DR_PRACTICE,
          CompetitionSubType.HTR_PRACTICE,
        ],
      })
      .andWhere('s.moves > 0')
      .andWhere(`${favCountExpr} > 0`)
      .orderBy(favCountExpr, 'DESC')
      .limit(limit)
      .getRawMany()

    return this.loadSubmissionsByIds(ranked.map(r => r.id))
  }

  async getTopCommented(limit = 10) {
    const ranked = await this.commentsRepository
      .createQueryBuilder('cm')
      .select('cm.submission_id', 'submissionId')
      .addSelect('COUNT(*)', 'cnt')
      .leftJoin('cm.submission', 's')
      .leftJoin('s.competition', 'c')
      .where('c.type != :chain', { chain: CompetitionType.FMC_CHAIN })
      .andWhere('c.subType NOT IN (:...practiceSubTypes)', {
        practiceSubTypes: [
          CompetitionSubType.EO_PRACTICE,
          CompetitionSubType.DR_PRACTICE,
          CompetitionSubType.HTR_PRACTICE,
        ],
      })
      .andWhere('s.moves > 0')
      .groupBy('cm.submission_id')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany()

    const submissions = await this.loadSubmissionsByIds(ranked.map(r => r.submissionId))
    const countMap: Record<number, number> = {}
    for (const row of ranked) {
      countMap[row.submissionId] = Number(row.cnt)
    }
    return submissions.map(s => ({ ...s, commentCount: countMap[s.id] || 0 }))
  }

  /** 每周全场最佳：按提交时间所在周，该周内步数最短的一条（排除 CHAIN、排除当前周） */
  async getWeeklyBestSingles() {
    const currentWeekStart = dayjs().day(1).startOf('day').toDate()

    const rows = await this.submissionsRepository
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .addSelect('s.moves', 'moves')
      .addSelect('s.created_at', 'createdAt')
      .addSelect('YEARWEEK(s.created_at, 3)', 'yw')
      .leftJoin('s.competition', 'c')
      .where('c.type != :chain', { chain: CompetitionType.FMC_CHAIN })
      .andWhere('c.subType NOT IN (:...practiceSubTypes)', {
        practiceSubTypes: [
          CompetitionSubType.EO_PRACTICE,
          CompetitionSubType.DR_PRACTICE,
          CompetitionSubType.HTR_PRACTICE,
        ],
      })
      .andWhere('s.moves > 0')
      .andWhere('s.created_at < :currentWeekStart', { currentWeekStart })
      .orderBy('yw', 'ASC')
      .addOrderBy('s.moves', 'ASC')
      .addOrderBy('s.created_at', 'ASC')
      .getRawMany()

    const bestIdByWeek = new Map<number, number>()
    for (const row of rows) {
      const yw = Number(row.yw)
      if (!bestIdByWeek.has(yw)) {
        bestIdByWeek.set(yw, row.id)
      }
    }

    const ids = [...bestIdByWeek.values()]
    if (ids.length === 0) return []

    const submissions = await this.loadSubmissionsByIds(ids)

    const weekKeys = [...bestIdByWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(-10)
      .reverse()
    const ywToStr = (yw: number) => {
      const year = Math.floor(yw / 100)
      const week = yw % 100
      return `${year}-${week.toString().padStart(2, '0')}`
    }

    return weekKeys
      .map(([yw, id]) => {
        const submission = submissions.find(s => s.id === id)
        return {
          week: ywToStr(yw),
          submission: submission ?? null,
        }
      })
      .filter(item => item.submission !== null)
  }

  /** 每周最活跃的选手：最近 10 周，每周按提交次数排序取前 10 名（排除 CHAIN、练习、当前周） */
  async getWeeklyActiveSubmitters(weeksLimit = 10, topPerWeek = 10) {
    const currentWeekStart = dayjs().day(1).startOf('day').toDate()

    const rows = await this.submissionsRepository
      .createQueryBuilder('s')
      .select('YEARWEEK(s.created_at, 3)', 'yw')
      .addSelect('s.user_id', 'userId')
      .addSelect('COUNT(*)', 'cnt')
      .leftJoin('s.competition', 'c')
      .where('c.type != :chain', { chain: CompetitionType.FMC_CHAIN })
      .andWhere('c.subType NOT IN (:...practiceSubTypes)', {
        practiceSubTypes: [
          CompetitionSubType.EO_PRACTICE,
          CompetitionSubType.DR_PRACTICE,
          CompetitionSubType.HTR_PRACTICE,
        ],
      })
      .andWhere('s.moves > 0')
      .andWhere('s.created_at < :currentWeekStart', { currentWeekStart })
      .groupBy('yw')
      .addGroupBy('s.user_id')
      .orderBy('yw', 'DESC')
      .addOrderBy('cnt', 'DESC')
      .getRawMany()

    const byWeek = new Map<number, { userId: number; cnt: number }[]>()
    for (const r of rows) {
      const yw = Number(r.yw)
      if (!byWeek.has(yw)) byWeek.set(yw, [])
      const list = byWeek.get(yw)!
      if (list.length < topPerWeek) list.push({ userId: r.userId, cnt: Number(r.cnt) })
    }

    const sortedWeeks = [...byWeek.keys()].sort((a, b) => b - a).slice(0, weeksLimit)
    if (sortedWeeks.length === 0) return []

    const userIds = [...new Set(rows.map(r => r.userId))]
    const userMap = new Map((await this.usersRepository.find({ where: { id: In(userIds) } })).map(u => [u.id, u]))

    const ywToStr = (yw: number) => {
      const year = Math.floor(yw / 100)
      const week = yw % 100
      return `${year}-${week.toString().padStart(2, '0')}`
    }

    return sortedWeeks.map(yw => ({
      week: ywToStr(yw),
      submitters: (byWeek.get(yw) ?? [])
        .map(({ userId, cnt }) => ({
          user: userMap.get(userId) ?? null,
          submissionCount: cnt,
        }))
        .filter(s => s.user !== null),
    }))
  }

  async getTopSubmitters(limit = 10) {
    const results = await this.submissionsRepository
      .createQueryBuilder('s')
      .leftJoin('s.competition', 'c')
      .leftJoin('s.user', 'u')
      .select('s.user_id', 'userId')
      .addSelect('u.id', 'u_id')
      .addSelect('u.name', 'u_name')
      .addSelect('u.wca_id', 'u_wcaId')
      .addSelect('u.avatar', 'u_avatar')
      .addSelect('u.avatar_thumb', 'u_avatarThumb')
      .addSelect('COUNT(*)', 'submissionCount')
      .addSelect('MIN(s.moves)', 'bestSingle')
      .where('c.type != :chain', { chain: CompetitionType.FMC_CHAIN })
      .andWhere('c.subType NOT IN (:...practiceSubTypes)', {
        practiceSubTypes: [
          CompetitionSubType.EO_PRACTICE,
          CompetitionSubType.DR_PRACTICE,
          CompetitionSubType.HTR_PRACTICE,
        ],
      })
      .andWhere('s.moves > 0')
      .andWhere('s.mode = :mode', { mode: CompetitionMode.REGULAR })
      .groupBy('s.user_id')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany()

    return results.map(r => ({
      user: {
        id: r.u_id,
        name: r.u_name,
        wcaId: r.u_wcaId,
        avatar: r.u_avatar,
        avatarThumb: r.u_avatarThumb,
      },
      submissionCount: Number(r.submissionCount),
      bestSingle: Number(r.bestSingle),
    }))
  }

  async getTopWinners(limit = 10) {
    const results = await this.resultsRepository
      .createQueryBuilder('r')
      .leftJoin('r.competition', 'c')
      .leftJoin('r.user', 'u')
      .select('r.user_id', 'userId')
      .addSelect('u.id', 'u_id')
      .addSelect('u.name', 'u_name')
      .addSelect('u.wca_id', 'u_wcaId')
      .addSelect('u.avatar', 'u_avatar')
      .addSelect('u.avatar_thumb', 'u_avatarThumb')
      .addSelect('COUNT(*)', 'wins')
      .where('c.type IN (:...types)', {
        types: [CompetitionType.WEEKLY, CompetitionType.DAILY, CompetitionType.LEAGUE],
      })
      .andWhere('c.status = :status', { status: CompetitionStatus.ENDED })
      .andWhere('r.rank = 1')
      .andWhere('r.mode = :mode', { mode: CompetitionMode.REGULAR })
      .groupBy('r.user_id')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany()

    return results.map(r => ({
      user: {
        id: r.u_id,
        name: r.u_name,
        wcaId: r.u_wcaId,
        avatar: r.u_avatar,
        avatarThumb: r.u_avatarThumb,
      },
      wins: Number(r.wins),
    }))
  }
}
