import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import {
  CompetitionMode,
  Competitions,
  CompetitionStatus,
  CompetitionSubType,
  CompetitionType,
} from '@/entities/competitions.entity'
import { DNF, DNS, Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'

@Injectable()
export class PointService {
  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
  ) {}

  async calculate(): Promise<void> {
    // weekly
    const weeklies = await this.competitionsRepository.find({
      where: {
        type: CompetitionType.WEEKLY,
        status: CompetitionStatus.ENDED,
      },
      order: {
        startTime: 'ASC',
      },
    })
    const userPointsMap: Record<
      number,
      {
        user: Users
        point: number
      }
    > = {}
    let firstUser
    const firstUserPoints: { week: string; point: number; rank: number }[] = []
    const consuctiveUsers: Record<
      number,
      {
        weeks: number
        lastWeek: Date
      }
    > = {}
    for (const weekly of weeklies) {
      const results = await this.resultsRepository.find({
        where: {
          competitionId: weekly.id,
          mode: CompetitionMode.REGULAR,
        },
        order: {
          rank: 'ASC',
        },
        relations: {
          user: true,
        },
      })
      const unlimitedResults = await this.resultsRepository.find({
        where: {
          competitionId: weekly.id,
          mode: CompetitionMode.UNLIMITED,
        },
        order: {
          rank: 'ASC',
        },
        relations: {
          user: true,
        },
      })
      const unlimitedResultsMap = Object.fromEntries(unlimitedResults.map(result => [result.user.id, result]))
      const first = results[0]
      if (!firstUser) {
        firstUser = first.user
      }
      const bests: Record<
        number,
        {
          best: number
          users: Users[]
        }
      > = {}
      for (const result of results) {
        const user = result.user
        const userPoint = (userPointsMap[user.id] = userPointsMap[user.id] || {
          user,
          point: 0,
        })
        const isDNF = result.average === DNF
        const hasNonDNF = result.values.some(value => value !== DNF && value !== DNS)
        const isDNFUnlimited = unlimitedResultsMap[user.id]?.average === DNF
        const hasNonDNFUnlimited = unlimitedResultsMap[user.id]?.values?.some(v => v !== DNF && v !== DNS)
        const rankPoint = Math.max(0, 11 - result.rank)
        const averagePoint = isDNF ? 0 : 200 / result.average
        let joinPoint = 0
        if (isDNF) {
          if (hasNonDNF) {
            joinPoint = 3
          }
          // get 3 points if the user has non-DNF average in unlimited mode
          if (!isDNFUnlimited) {
            joinPoint += 3
          } else if (hasNonDNFUnlimited) {
            joinPoint += 1
          }
        } else {
          joinPoint = 10
        }
        if (hasNonDNF) {
          const consuctiveUser = consuctiveUsers[user.id] || { weeks: 0, lastWeek: new Date(0) }
          if (weekly.startTime.getTime() - consuctiveUser.lastWeek.getTime() <= 7 * 24 * 60 * 60 * 1000) {
            consuctiveUser.weeks++
          } else {
            consuctiveUser.weeks = 0
          }
          consuctiveUser.lastWeek = weekly.startTime
          consuctiveUsers[user.id] = consuctiveUser
        }
        const consuctivePoint = Math.min((consuctiveUsers[user.id]?.weeks || 0) * 2, 10)
        for (let i = 0; i < result.values.length; i++) {
          if (result.values[i] === DNF) {
            continue
          }
          const best = bests[i] || { best: Infinity, users: [] }
          if (result.values[i] < best.best) {
            best.best = result.values[i]
            best.users = [user]
          } else if (result.values[i] === best.best) {
            best.users.push(user)
          }
          bests[i] = best
        }
        userPoint.point += rankPoint + averagePoint + joinPoint + consuctivePoint
        if (user.id === firstUser.id) {
          firstUserPoints.push({
            week: weekly.name,
            point: rankPoint + averagePoint + joinPoint + consuctivePoint,
            rank: result.rank,
          })
        }
      }
      // bests
      for (const { users } of Object.values(bests)) {
        for (const user of users) {
          const userPoint = userPointsMap[user.id]
          if (userPoint) {
            userPoint.point += 10
          }
        }
      }
      bests[0] = { best: Infinity, users: [] }
      bests[1] = { best: Infinity, users: [] }
      bests[2] = { best: Infinity, users: [] }
      for (const result of unlimitedResults) {
        const user = result.user
        for (let i = 0; i < result.values.length; i++) {
          if (result.values[i] === DNF) {
            continue
          }
          const best = bests[i]
          if (result.values[i] < best.best) {
            best.best = result.values[i]
            best.users = [user]
          } else if (result.values[i] === best.best) {
            best.users.push(user)
          }
          bests[i] = best
        }
      }
      for (const { users } of Object.values(bests)) {
        for (const user of users) {
          const userPoint = userPointsMap[user.id]
          if (userPoint) {
            userPoint.point += 5
          }
        }
      }
    }
    // endless
    await this.calculateEndless(userPointsMap, CompetitionSubType.BOSS_CHALLENGE, 2, 0)
    await this.calculateEndless(userPointsMap, CompetitionSubType.REGULAR, 0.5, 0)
    const userPoints = Object.values(userPointsMap)
    userPoints.sort((a, b) => b.point - a.point)
    let i = 0
    for (const { user, point } of userPoints.slice(0, 50)) {
      console.log(++i, user.name, point)
    }
    // console.log(firstUserPoints)
  }

  async calculateEndless(
    userPointsMap: Record<
      number,
      {
        user: Users
        point: number
      }
    >,
    subType: CompetitionSubType,
    pointPerLevel: number,
    pointKickedOff: number,
  ) {
    const competition = await this.competitionsRepository.findOne({
      where: {
        type: CompetitionType.ENDLESS,
        subType,
      },
    })
    const scrambles = await this.scramblesRepository.find({
      where: {
        competitionId: competition.id,
      },
      order: {
        number: 'ASC',
      },
      relations: {
        kickoffs: {
          user: true,
        },
      },
    })
    for (const scramble of scrambles) {
      const submissions = await this.submissionsRepository.find({
        where: {
          scrambleId: scramble.id,
        },
        order: {
          cumulativeMoves: 'ASC',
          moves: 'ASC',
        },
        relations: {
          user: true,
        },
      })
      for (const submission of submissions) {
        const user = submission.user
        const userPoint = userPointsMap[user.id] || { user, point: 0 }
        userPoint.point += pointPerLevel
        userPointsMap[user.id] = userPoint
      }
      for (const { user } of scramble.kickoffs) {
        userPointsMap[user.id].point += pointKickedOff / scramble.kickoffs.length
      }
    }
  }
}
