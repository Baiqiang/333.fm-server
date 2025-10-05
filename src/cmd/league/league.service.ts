import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import XLSX from 'xlsx'

import {
  CompetitionFormat,
  CompetitionMode,
  Competitions,
  CompetitionStatus,
  CompetitionType,
} from '@/entities/competitions.entity'
import { LeagueDuels } from '@/entities/league-duels.entity'
import { LeagueEloHistories } from '@/entities/league-elo-histories.entity'
import { LeagueElos } from '@/entities/league-elos.entity'
import { LeaguePlayers } from '@/entities/league-players.entity'
import { LeagueResults } from '@/entities/league-results.entity'
import { LeagueSeasons, LeagueSeasonStatus } from '@/entities/league-seasons.entity'
import { LeagueStandings } from '@/entities/league-standings.entity'
import { LeagueTiers } from '@/entities/league-tiers.entity'
import { DNF, DNS } from '@/entities/results.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { calculateMoves } from '@/utils'
import { EloCalculator } from '@/utils/elo-calculator'

const { encode_col: encodeCol } = XLSX.utils
@Injectable()
export class LeagueService {
  constructor(
    @InjectRepository(LeagueSeasons)
    private readonly leagueSeasonsRepository: Repository<LeagueSeasons>,
    @InjectRepository(LeagueTiers)
    private readonly leagueTiersRepository: Repository<LeagueTiers>,
    @InjectRepository(LeaguePlayers)
    private readonly leaguePlayersRepository: Repository<LeaguePlayers>,
    @InjectRepository(LeagueDuels)
    private readonly leagueDuelsRepository: Repository<LeagueDuels>,
    @InjectRepository(LeagueStandings)
    private readonly leagueStandingsRepository: Repository<LeagueStandings>,
    @InjectRepository(LeagueResults)
    private readonly leagueResultsRepository: Repository<LeagueResults>,
    @InjectRepository(LeagueElos)
    private readonly leagueElosRepository: Repository<LeagueElos>,
    @InjectRepository(LeagueEloHistories)
    private readonly leagueEloHistoriesRepository: Repository<LeagueEloHistories>,
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

  async import(filename: string, seasonNumber: number, startDate: string) {
    // read from xlsx file
    const xlsx = await XLSX.readFile(filename)
    const scrambleSheetName = xlsx.SheetNames.find(s => s.toLowerCase().includes('scramble'))
    const standingsSheetName = xlsx.SheetNames.find(s => s.toLowerCase().includes('standings'))
    const scrambleSheet = xlsx.Sheets[scrambleSheetName]
    const standingsSheet = xlsx.Sheets[standingsSheetName]
    if (!scrambleSheet || !standingsSheet) {
      console.log('Failed to find scrambles or standings')
      return
    }
    const queryRunner = this.leagueSeasonsRepository.manager.connection.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    try {
      let weeks = 9
      const season = new LeagueSeasons()
      season.number = Number(seasonNumber)
      season.status = LeagueSeasonStatus.ENDED
      season.startTime = new Date(`${startDate} 18:00:00`)
      // 9 weeks for default
      season.endTime = new Date(season.startTime.getTime() + weeks * 7 * 24 * 60 * 60 * 1000)
      await queryRunner.manager.save(season)
      // get all players from standings sheet
      let row = 2
      const tiers: LeagueTiers[] = []
      const standings: Record<string, LeagueStandings> = {}
      const userMap: Record<string, Users> = {}
      // make users map from live sheet
      const liveSheetName = xlsx.SheetNames.find(s => s.toLowerCase().includes('live'))
      const liveSheet = xlsx.Sheets[liveSheetName]
      if (liveSheet) {
        while (true) {
          const cell = liveSheet[`A${row}`]
          if (!cell || !cell.v) {
            break
          }
          const wcaId = liveSheet[`B${row}`].v
          let user = await this.usersRepository.findOne({ where: { wcaId } })
          if (!user) {
            console.warn('User not found for live', wcaId, cell.v)
            user = this.createUser(wcaId.toUpperCase(), cell.v)
            await queryRunner.manager.save(user)
          }
          userMap[wcaId] = user
          // names map
          userMap[cell.v.toLowerCase()] = user
          row++
        }
      }
      row = 1
      while (true) {
        const cell = standingsSheet[`B${row}`]
        if (!cell || !cell.v || cell.v.includes('Seed')) {
          break
        }
        const tier = new LeagueTiers()
        tier.level = parseInt(standingsSheet[`A${row}`].v.split(' ')[1])
        tier.seasonId = season.id
        await queryRunner.manager.save(tier)
        tiers.push(tier)
        tier.players = []
        let i = 1
        for (; ; i++) {
          const nameCell = standingsSheet[`B${row + i}`]
          if (!nameCell || !nameCell.v) {
            weeks = tier.players.length - 1
            // console.log(tier.id, tier.level, weeks)
            break
          }
          // const wcaId = standingsSheet[`C${row + i}`].v
          // const user = await this.usersRepository.findOne({ where: { wcaId } })
          const user = userMap[nameCell.v.toLowerCase()]
          if (!user) {
            console.error('User not found for standings', nameCell.v, row + i)
            return
          }
          userMap[nameCell.v] = user
          userMap[user.wcaId] = user
          const standing = new LeagueStandings()
          standing.seasonId = season.id
          standing.tierId = tier.id
          standing.userId = user.id
          standing.user = user
          standing.position = i
          standing.points = standingsSheet[`D${row + i}`].v
          standing.wins = standingsSheet[`E${row + i}`].v
          standing.draws = standingsSheet[`F${row + i}`].v
          standing.losses = standingsSheet[`G${row + i}`].v
          let bestMo3 = standingsSheet[`H${row + i}`].v
          if (bestMo3 === 'DNF') {
            bestMo3 = DNF
          } else {
            bestMo3 = parseFloat(bestMo3) * 100
          }
          standing.bestMo3 = parseInt(bestMo3)
          await queryRunner.manager.save(standing)
          standings[user.wcaId] = standing
          const player = new LeaguePlayers()
          player.userId = user.id
          player.tierId = tier.id
          player.seasonId = season.id
          tier.players.push(player)
          await queryRunner.manager.save(player)
        }
        row += i + 1
      }
      // results of each week
      const competitions: Competitions[] = []
      const scrambles: Scrambles[] = []
      let startTime = new Date(startDate)
      let colOffset = 0
      for (let week = 1; week <= weeks; week++) {
        const competition = new Competitions()
        competition.name = `League S${season.number} Week ${week}`
        competition.alias = `league-${season.number}-${week}`
        competition.leagueSeasonId = season.id
        competition.type = CompetitionType.LEAGUE
        competition.format = CompetitionFormat.MO3
        competition.userId = 1
        competition.status = CompetitionStatus.ON_GOING
        competition.startTime = startTime
        competition.endTime = new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000)
        competitions.push(competition)
        let count = 0
        await queryRunner.manager.save(competition)
        startTime = competition.endTime
        const userResults: Record<number, Results> = {}
        for (let attempt = 1; attempt <= 3; attempt++) {
          const sheetName = xlsx.SheetNames.find(s => s.includes(`${week}.${attempt}`))
          if (!sheetName) {
            console.error('Failed to find sheet', week, attempt)
            continue
          }
          // console.log(week, attempt, sheetName)
          const scrambleStr = scrambleSheet[`B${(week - 1) * 3 + attempt + 1}`].v
          const scramble = new Scrambles()
          scramble.number = attempt
          scramble.scramble = scrambleStr
          scramble.competitionId = competition.id
          scrambles.push(scramble)
          await queryRunner.manager.save(scramble)
          const sheet = xlsx.Sheets[sheetName]
          let row = 2
          const cTitle = sheet['C1']?.v
          if (typeof cTitle === 'string' && cTitle.toLowerCase().includes('tier')) {
            colOffset = 1
          }
          if (typeof cTitle === 'number') {
            row = 1
          }
          while (true) {
            const nameCell = sheet[`A${row}`]
            if (!nameCell || !nameCell.v) {
              break
            }
            const wcaID = sheet[`B${row}`].v.toUpperCase()
            const moves = sheet[`${encodeCol(2 + colOffset)}${row}`].v
            const solution = sheet[`${encodeCol(3 + colOffset)}${row}`]?.v || ''
            const comment = sheet[`${encodeCol(4 + colOffset)}${row}`]?.v || ''
            const realMoves = calculateMoves(scrambleStr, solution)
            let valid = true
            if (realMoves / 100 !== moves && moves < 100) {
              valid = false
            }
            let movesCount = parseInt(moves) * 100
            if (!(movesCount < 8000)) {
              movesCount = DNF
            }
            if (moves === 'DNS') {
              movesCount = DNS
            }
            const submission = new Submissions()
            let user = userMap[wcaID]
            if (!user) {
              user = await this.usersRepository.findOne({ where: { wcaId: wcaID } })
              if (!user) {
                console.warn('User not found', wcaID, nameCell.v, week, attempt, row)
                user = this.createUser(wcaID, nameCell.v)
                await queryRunner.manager.save(user)
                userMap[wcaID] = user
              }
            }
            submission.mode = CompetitionMode.REGULAR
            if (!userMap[user.wcaId]) {
              submission.mode = CompetitionMode.UNLIMITED
            }
            submission.competitionId = competition.id
            submission.scrambleId = scramble.id
            submission.userId = user.id
            submission.moves = movesCount
            // console.log(user.id, week, attempt, user.name, solution)
            submission.solution = solution
            submission.comment = comment
            submission.verified = valid
            // fake created at
            submission.createdAt = new Date(competition.startTime.getTime() + 3.5 * 86400 * 1000 + count * 1000)
            count++
            const result = userResults[user.id] || new Results()
            if (!userResults[user.id]) {
              result.mode = submission.mode
              result.competitionId = competition.id
              result.userId = user.id
              result.values = [0, 0, 0]
              result.best = 0
              result.average = 0
              userResults[user.id] = result
            }
            result.values[attempt - 1] = movesCount
            await queryRunner.manager.save(result)
            // link result to submission
            submission.resultId = result.id
            await queryRunner.manager.save(submission)
            row++
          }
        }
      }

      // schedules
      const scheduleSheetName = xlsx.SheetNames.find(s => s.toLowerCase().includes('schedule'))
      const scheduleSheet = xlsx.Sheets[scheduleSheetName]
      if (!scheduleSheet) {
        console.error('Failed to find schedule')
        return
      }
      const SCHEDULE_TIER_COL = 15
      const SCHEDULE_TIER_ROW = 3 + weeks + 1
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i]
        for (let week = 1; week <= weeks; week++) {
          for (let j = 0; j < weeks / 2; j++) {
            const row = (week - 1) * SCHEDULE_TIER_ROW + j + 1 + 3
            // console.log(
            //   row,
            //   `${XLSX.utils.encode_col(i * SCHEDULE_TIER_COL)}${row}`,
            //   `${XLSX.utils.encode_col(i * SCHEDULE_TIER_COL + SCHEDULE_TIER_COL - 1)}${row}`,
            // )
            const player1Cell = scheduleSheet[`${encodeCol(i * SCHEDULE_TIER_COL)}${row}`]
            const player2Cell = scheduleSheet[`${encodeCol(i * SCHEDULE_TIER_COL + 11)}${row}`]
            const player1 = userMap[player1Cell.v]
            const player2 = userMap[player2Cell.v]
            if (!player1 || !player2) {
              console.error('Player not found', player1Cell.v, player2Cell.v, !player1, !player2)
              continue
            }
            const duel = new LeagueDuels()
            duel.seasonId = season.id
            duel.competitionId = competitions[week - 1].id
            duel.tierId = tier.id
            duel.user1Id = player1.id
            duel.user2Id = player2.id
            duel.user1Points = scheduleSheet[`${encodeCol(i * SCHEDULE_TIER_COL + 4)}${row}`].v
            duel.user2Points = scheduleSheet[`${encodeCol(i * SCHEDULE_TIER_COL + 7)}${row}`].v
            await queryRunner.manager.save(duel)
            // user results
            const user1Result = new LeagueResults()
            user1Result.userId = player1.id
            user1Result.seasonId = season.id
            user1Result.competitionId = competitions[week - 1].id
            user1Result.week = week
            const user2Result = new LeagueResults()
            user2Result.userId = player2.id
            user2Result.seasonId = season.id
            user2Result.competitionId = competitions[week - 1].id
            user2Result.week = week
            if (duel.user1Points > duel.user2Points) {
              user1Result.points = 2
            } else if (duel.user1Points < duel.user2Points) {
              user2Result.points = 2
            } else {
              user1Result.points = 1
              user2Result.points = 1
            }
            await queryRunner.manager.save(user1Result)
            await queryRunner.manager.save(user2Result)
          }
        }
      }
      // elo
      const eloSheetName = xlsx.SheetNames.find(s => s.toLowerCase().includes('elo'))
      const eloSheet = xlsx.Sheets[eloSheetName]
      if (eloSheet) {
        row = 2
        while (true) {
          const wcaIdCell = eloSheet[`B${row}`]
          if (!wcaIdCell || !wcaIdCell.v) {
            break
          }
          const user = userMap[wcaIdCell.v]
          if (!user) {
            console.error('User not found', wcaIdCell.v)
            continue
          }
          let lastElo: LeagueEloHistories | null = null
          let userElo = await this.leagueElosRepository.findOne({ where: { userId: user.id } })
          if (!userElo) {
            userElo = new LeagueElos()
            userElo.userId = user.id
            userElo.points = 0
          }
          for (let i = 0; i < weeks; i++) {
            const eloCell = eloSheet[`${encodeCol(i + 2)}${row}`]
            const elo = eloCell.v
            const eloHistory = new LeagueEloHistories()
            eloHistory.seasonId = season.id
            eloHistory.competitionId = competitions[i].id
            eloHistory.week = i + 1
            eloHistory.userId = user.id
            eloHistory.points = elo
            eloHistory.delta = lastElo ? elo - lastElo.points : 0
            lastElo = eloHistory
            userElo.points = elo
            await queryRunner.manager.save(eloHistory)
          }
          await queryRunner.manager.save(userElo)
          row++
        }
      }
      await queryRunner.commitTransaction()
    } catch (error) {
      await queryRunner.rollbackTransaction()
      console.error(error)
      throw error
    } finally {
      await queryRunner.release()
    }
  }

  createUser(wcaId: string, name: string) {
    const user = new Users()
    user.wcaId = wcaId
    user.name = name
    user.email = `${wcaId}@333.fm`
    user.source = 'WCA'
    user.sourceId = wcaId
    user.avatar = ''
    user.avatarThumb = ''
    return user
  }

  async updateElo(filename: string, seasonNumber: string) {
    const calculator = new EloCalculator(filename)
    const eloList = calculator.updateWeeks(Number(seasonNumber))
    console.log(eloList)
  }
}
