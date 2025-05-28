import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOneOptions, In, Repository } from 'typeorm'

import { LeaguePlayerDto } from '@/dtos/league-player.dto'
import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import {
  CompetitionFormat,
  CompetitionMode,
  Competitions,
  CompetitionStatus,
  CompetitionType,
} from '@/entities/competitions.entity'
import { LeagueDuels } from '@/entities/league-duels.entity'
import { LeaguePlayers } from '@/entities/league-players.entity'
import { LeagueSessions, LeagueSessionStatus } from '@/entities/league-sessions.entity'
import { LeagueStandings } from '@/entities/league-standings.entity'
import { LeagueTiers } from '@/entities/league-tiers.entity'
import { DNF, DNS } from '@/entities/results.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'
import { betterThan } from '@/utils'
import { generateScrambles } from '@/utils/scramble'

import { CompetitionService } from '../competition.service'

export interface LeagueJob {
  competitionId: number
  userId: number
  scrambleId: number
  scrambleNumber: number
  submissionId: number
  moves: number
}
export const ONE_WEEK = 7 * 24 * 60 * 60 * 1000

@Injectable()
export class LeagueService {
  constructor(
    @InjectRepository(LeagueSessions)
    private readonly leagueSessionsRepository: Repository<LeagueSessions>,
    @InjectRepository(LeagueTiers)
    private readonly leagueTiersRepository: Repository<LeagueTiers>,
    @InjectRepository(LeaguePlayers)
    private readonly leaguePlayersRepository: Repository<LeaguePlayers>,
    @InjectRepository(LeagueDuels)
    private readonly leagueDuelsRepository: Repository<LeagueDuels>,
    @InjectRepository(LeagueStandings)
    private readonly leagueStandingsRepository: Repository<LeagueStandings>,
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    @Inject(forwardRef(() => CompetitionService))
    private readonly competitionService: CompetitionService,
    private readonly userService: UserService,
  ) {}

  async getSessions() {
    return this.leagueSessionsRepository.find({
      order: {
        startTime: 'DESC',
      },
    })
  }

  async getSession(number: number) {
    return this.findSession({
      where: {
        number,
      },
    })
  }

  async getOnGoing() {
    return this.findSession({
      where: {
        status: LeagueSessionStatus.ON_GOING,
      },
    })
  }

  async getNext() {
    return this.findSession({
      where: {
        status: In([LeagueSessionStatus.NOT_STARTED, LeagueSessionStatus.ON_GOING]),
      },
      order: {
        number: 'DESC',
      },
    })
  }

  async findSession(options: FindOneOptions<LeagueSessions>) {
    const session = await this.leagueSessionsRepository.findOne({
      ...options,
      relations: {
        tiers: {
          players: {
            user: true,
          },
        },
        competitions: {
          scrambles: true,
        },
        standings: true,
        ...options.relations,
      },
    })
    if (session) {
      session.competitions.forEach((competition, i) => {
        competition.prevCompetition = session.competitions[i - 1]
          ? Object.assign(new Competitions(), session.competitions[i - 1])
          : null
        competition.nextCompetition = session.competitions[i + 1]
          ? Object.assign(new Competitions(), session.competitions[i + 1])
          : null
      })
    }
    return session
  }

  async createSession(number: number, startTimeStr: string, weeks: number) {
    const startTime = new Date(startTimeStr)
    const session = new LeagueSessions()
    session.number = number
    session.startTime = startTime
    session.endTime = new Date(startTime.getTime() + ONE_WEEK * weeks)
    session.status = LeagueSessionStatus.NOT_STARTED
    return this.leagueSessionsRepository.save(session)
  }

  async deleteSession(session: LeagueSessions) {
    await this.leagueSessionsRepository.delete(session.id)
  }

  async updateSession(session: LeagueSessions, attributes: Partial<LeagueSessions>) {
    Object.assign(session, attributes)
    return this.leagueSessionsRepository.save(session)
  }

  async createCompetitions(session: LeagueSessions, user: Users, weeks: number, firstStartTime: string) {
    const competitions: Competitions[] = []
    let startTime = new Date(firstStartTime)
    for (let i = 0; i < weeks; i++) {
      const endTime = new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000)
      const competition = await this.createCompetition(session, user, i + 1, startTime.toString(), endTime.toString())
      competitions.push(competition)
      startTime = endTime
    }
    return competitions
  }

  async createCompetition(session: LeagueSessions, user: Users, week: number, startTime: string, endTime: string) {
    const competition = new Competitions()
    competition.name = `League S${session.number} Week ${week}`
    competition.alias = `league-${session.number}-${week}`
    competition.leagueSessionId = session.id
    competition.type = CompetitionType.LEAGUE
    competition.format = CompetitionFormat.MO3
    competition.userId = user.id
    competition.status = CompetitionStatus.NOT_STARTED
    competition.startTime = new Date(startTime)
    competition.endTime = new Date(endTime)
    return this.competitionsRepository.save(competition)
  }

  async calculateCompetitionStatus(competition: Competitions) {
    // check if all scrambles are generated
    const scrambles = await this.scramblesRepository.find({
      where: {
        competitionId: competition.id,
      },
    })
    if (scrambles.length === 3) {
      return CompetitionStatus.ON_GOING
    }
    return CompetitionStatus.NOT_STARTED
  }

  async startSession(session: LeagueSessions) {
    session.status = LeagueSessionStatus.ON_GOING
    await this.leagueSessionsRepository.save(session)
  }

  async startCompetition(competition: Competitions) {
    competition.status = CompetitionStatus.ON_GOING
    competition.endTime = new Date(competition.startTime.getTime() + ONE_WEEK)
    await this.competitionsRepository.save(competition)
  }

  async endCompetition(competition: Competitions) {
    competition.endTime = new Date()
    await this.competitionsRepository.save(competition)
  }

  async removeScrambles(competition: Competitions) {
    await this.scramblesRepository.delete({
      competitionId: competition.id,
    })
  }

  async generateScrambles(competition: Competitions) {
    await this.removeScrambles(competition)
    const scrambles: Scrambles[] = generateScrambles(3).map((str, number) => {
      const scramble = new Scrambles()
      scramble.number = number + 1
      scramble.scramble = str
      scramble.competitionId = competition.id
      return scramble
    })
    return this.scramblesRepository.save(scrambles)
  }

  async updateScrambles(competition: Competitions, scrambleStrings: string[]) {
    await this.removeScrambles(competition)
    const scrambles: Scrambles[] = scrambleStrings.map((str, number) => {
      const scramble = new Scrambles()
      scramble.number = number + 1
      scramble.scramble = str
      scramble.competitionId = competition.id
      return scramble
    })
    return this.scramblesRepository.save(scrambles)
  }

  async createTiers(session: LeagueSessions, num: number) {
    const tiers = []
    for (let i = 0; i < num; i++) {
      const tier = new LeagueTiers()
      tier.sessionId = session.id
      tier.level = (i + 1).toString()
      tiers.push(tier)
    }
    return this.leagueTiersRepository.save(tiers)
  }

  async updateTier(tier: LeagueTiers, attributes: Partial<LeagueTiers>) {
    Object.assign(tier, attributes)
    return this.leagueTiersRepository.save(tier)
  }

  async pickPlayers(tier: LeagueTiers, playerInfos: LeaguePlayerDto[]) {
    const players = []
    for (const { wcaId, name, avatarThumb } of playerInfos) {
      // find user by wcaId
      let user = await this.userService.findOne(wcaId)
      if (user === null) {
        // create dummy user if not found
        user = await this.userService.createDummyUser(wcaId, name, avatarThumb)
      }
      let player = await this.leaguePlayersRepository.findOne({
        where: {
          sessionId: tier.sessionId,
          userId: user.id,
        },
      })
      // create new player if not found
      if (player === null) {
        player = new LeaguePlayers()
        player.userId = user.id
        player.sessionId = tier.sessionId
        player.user = user
      }
      // update tier for existing player
      player.tierId = tier.id
      await this.leaguePlayersRepository.save(player)
      players.push(player)
    }
    return players
  }

  async movePlayer(player: LeaguePlayers, toTier: LeagueTiers) {
    player.tierId = toTier.id
    await this.leaguePlayersRepository.save(player)
  }

  async clearSchedules(session: LeagueSessions) {
    await this.leagueDuelsRepository.delete({
      competitionId: In(session.competitions.map(c => c.id)),
    })
  }

  async generateSchedules(session: LeagueSessions) {
    // remove all duels
    await this.clearSchedules(session)
    const tierPlayers = await this.getTierPlayers(session)
    const competitions = await this.competitionsRepository.find({
      where: {
        leagueSessionId: session.id,
      },
    })
    let competitionIndex = 0
    for (const { tier, players } of tierPlayers) {
      const schedules: LeagueDuels[] = []
      // round robin
      if (players.length % 2 === 1) {
        players.push(null)
      }
      // shuffle players
      players.sort(() => Math.random() - 0.5)
      const count = players.length
      for (let i = 0; i < count - 1; i++) {
        const competition = competitions[competitionIndex % competitions.length]
        for (let j = 0; j < count / 2; j++) {
          const player = players[j].user
          const opponent = players[count - 1 - j].user
          const isHome = false //j === 0 && i % 2 === 1
          const duel = new LeagueDuels()
          duel.user1 = isHome ? player : opponent
          duel.user2 = isHome ? opponent : player
          duel.sessionId = session.id
          duel.tierId = tier.id
          duel.competitionId = competition.id
          duel.user1Id = duel.user1?.id
          duel.user2Id = duel.user2?.id
          schedules.push(duel)
          competitionIndex++
        }
        players.splice(1, 0, players.pop()) // rotate players
      }
      await this.leagueDuelsRepository.save(schedules)
    }
  }

  async getSessionCompetition(session: LeagueSessions, week: number) {
    return this.competitionService.findOne({
      where: {
        alias: `league-${session.number}-${week}`,
      },
      relations: {
        scrambles: true,
      },
    })
  }

  async getSessionCompetitionByAlias(session: LeagueSessions, alias: string) {
    return this.competitionService.findOne({
      where: {
        leagueSessionId: session.id,
        alias,
      },
      relations: {
        scrambles: true,
      },
    })
  }

  hideScrambles(session?: LeagueSessions) {
    if (!session || !session.competitions) {
      return
    }
    session.competitions.map(competition => {
      // hide scrambles if competition hasn't started
      if (!competition.hasStarted && !competition.hasEnded) {
        competition.scrambles = []
      }
    })
  }

  async getTier(session: LeagueSessions, id: number) {
    return this.leagueTiersRepository.findOne({
      where: {
        id,
        sessionId: session.id,
      },
    })
  }

  async getTiers(session: LeagueSessions) {
    return this.leagueTiersRepository.find({
      where: {
        sessionId: session.id,
      },
      relations: {
        players: {
          user: true,
        },
      },
    })
  }

  async getTierPlayers(session: LeagueSessions) {
    const players = await this.leaguePlayersRepository.find({
      where: {
        sessionId: session.id,
      },
      relations: {
        tier: true,
        user: true,
      },
    })
    const tmp: Record<
      number,
      {
        tier: LeagueTiers
        players: LeaguePlayers[]
      }
    > = {}
    for (const player of players) {
      if (!tmp[player.tierId]) {
        tmp[player.tierId] = {
          tier: player.tier,
          players: [],
        }
      }
      tmp[player.tierId].players.push(player)
    }
    return Object.values(tmp).sort((a, b) => a.tier.level.localeCompare(b.tier.level))
  }

  async getPlayer(session: LeagueSessions, user: Users) {
    return this.leaguePlayersRepository.findOne({
      where: {
        userId: user.id,
        sessionId: session.id,
      },
    })
  }

  async getStandings(session: LeagueSessions) {
    return this.leagueStandingsRepository.find({
      where: {
        sessionId: session.id,
      },
      relations: {
        user: true,
        tier: true,
      },
      order: {
        points: 'DESC',
        wins: 'DESC',
        draws: 'DESC',
        losses: 'ASC',
      },
    })
  }

  async getOrCreateStandings(session: LeagueSessions) {
    const standings = await this.getStandings(session)
    if (standings.length === 0) {
      // all players have a standing
      const tierPlayers = await this.getTierPlayers(session)
      for (const { players } of tierPlayers) {
        for (const player of players) {
          const standing = new LeagueStandings()
          standing.sessionId = session.id
          standing.userId = player.userId
          standing.tierId = player.tierId
          standings.push(standing)
        }
      }
      await this.leagueStandingsRepository.save(standings)
    }
    return standings
  }

  async getMappedStandings(session: LeagueSessions) {
    const standings = await this.getStandings(session)
    return Object.fromEntries(standings.map(s => [s.userId, s]))
  }

  async getSchedules(session: LeagueSessions) {
    const tiers = await this.getTiers(session)
    const schedules: { tier: LeagueTiers; schedules: LeagueDuels[] }[] = []
    for (const tier of tiers) {
      const tierSchedules = await this.getTierSchedules(tier)
      schedules.push({ tier, schedules: tierSchedules })
    }
    return schedules
  }

  async getTierSchedules(tier: LeagueTiers) {
    const duels = await this.leagueDuelsRepository.find({
      where: {
        tierId: tier.id,
      },
      relations: {
        user1: true,
        user2: true,
        competition: true,
      },
    })
    await this.loadDuelsResults(duels)
    return duels
  }

  async getWeekSchedules(session: LeagueSessions, competition: Competitions) {
    const schedules = await this.getSchedules(session)
    schedules.forEach(s => {
      s.schedules = s.schedules.filter(s => s.competitionId === competition.id)
    })
    return schedules
  }

  async loadDuelsResults(duels: LeagueDuels[]) {
    const results = await this.resultsRepository.find({
      where: {
        userId: In([...duels.map(d => d.user1Id), ...duels.map(d => d.user2Id)].filter(Boolean)),
        competitionId: In(duels.map(d => d.competitionId)),
      },
    })
    const resultMap = results.reduce(
      (acc, result) => {
        acc[result.competitionId] = acc[result.competitionId] || {}
        acc[result.competitionId][result.userId] = result
        return acc
      },
      {} as Record<number, Record<number, Results>>,
    )
    for (const duel of duels) {
      duel.user1Result = resultMap[duel.competitionId]?.[duel.user1Id]
      duel.user2Result = resultMap[duel.competitionId]?.[duel.user2Id]
      if (duel.competition.hasEnded) {
        continue
      }
      // hide results if any player hasn't completed the competition
      if (
        !duel.user1Result ||
        !duel.user2Result ||
        duel.user1Result.values.some(v => v === 0) ||
        duel.user2Result.values.some(v => v === 0)
      ) {
        duel.user1Result = null
        duel.user2Result = null
      }
    }
    return duels
  }

  async getWeekDuel(competition: Competitions, user: Users) {
    return this.leagueDuelsRepository.findOne({
      where: [
        {
          competitionId: competition.id,
          user1Id: user.id,
        },
        {
          competitionId: competition.id,
          user2Id: user.id,
        },
      ],
      relations: {
        user1: true,
        user2: true,
      },
    })
  }

  async getStatistics(session: LeagueSessions) {
    return this.leagueStandingsRepository.find({
      where: {
        sessionId: session.id,
      },
    })
  }

  async submitSolution(competition: Competitions, user: Users, solution: SubmitSolutionDto) {
    if (competition.hasEnded) {
      throw new BadRequestException('Competition has ended')
    }
    const player = await this.leaguePlayersRepository.findOne({
      where: {
        userId: user.id,
        sessionId: competition.leagueSessionId,
      },
    })
    const scramble = await this.scramblesRepository.findOne({
      where: {
        id: solution.scrambleId,
        competitionId: competition.id,
      },
    })
    if (scramble === null) {
      throw new BadRequestException('Invalid scramble')
    }
    const preSubmission = await this.submissionsRepository.findOne({
      where: {
        scrambleId: scramble.id,
        userId: user.id,
      },
    })
    if (preSubmission !== null) {
      throw new BadRequestException('You have already submitted a solution')
    }
    solution.mode = player ? CompetitionMode.REGULAR : CompetitionMode.UNLIMITED
    const submission = await this.competitionService.createSubmission(competition, scramble, user, solution)
    let result = await this.resultsRepository.findOne({
      where: {
        competitionId: competition.id,
        userId: user.id,
      },
    })
    if (result === null) {
      result = new Results()
      result.mode = solution.mode
      result.competition = competition
      result.user = user
      result.values = competition.scrambles.map(() => 0)
      result.best = 0
      result.average = 0
      await this.resultsRepository.save(result)
    }
    submission.result = result
    await this.submissionsRepository.save(submission)
    result.values[scramble.number - 1] = submission.moves
    const nonZeroValues = result.values.filter(value => value > 0)
    result.best = Math.min(...nonZeroValues)
    result.average = Math.round(nonZeroValues.reduce((a, b) => a + b, 0) / nonZeroValues.length)
    if (result.values.some(v => v === DNF || v === DNS)) {
      result.average = DNF
    }
    await this.resultsRepository.save(result)
    return submission
  }

  async update(
    competition: Competitions,
    user: Users,
    id: number,
    solution: Pick<SubmitSolutionDto, 'comment' | 'attachments'>,
  ) {
    return await this.competitionService.updateUserSubmission(competition, user, id, solution)
  }

  async calculatePoints(competition: Competitions) {
    const session = await this.leagueSessionsRepository.findOne({
      where: {
        id: competition.leagueSessionId,
      },
    })
    const duels = await this.leagueDuelsRepository.find({
      where: {
        competitionId: competition.id,
      },
      relations: {
        user1: true,
        user2: true,
      },
    })
    const competitionResults = await this.resultsRepository.find({
      where: {
        competitionId: competition.id,
      },
    })
    const playerResults = Object.fromEntries(competitionResults.map(r => [r.userId, r]))
    const standings = await this.getStandings(session)
    const mappedStandings = Object.fromEntries(standings.map(s => [s.userId, s]))
    const mappedDuels: Record<number, Record<number, LeagueDuels>> = {}
    for (const duel of duels) {
      // @todo how to handle points for a bye player?
      if (duel.user1 === null || duel.user2 === null) {
        continue
      }
      // if points are already set, skip
      if (duel.ended) {
        continue
      }
      duel.user1Result = playerResults[duel.user1Id]
      duel.user2Result = playerResults[duel.user2Id]
      this.calculateDuelPoints(duel, mappedStandings)
      mappedDuels[duel.user1Id] = mappedDuels[duel.user1Id] || {}
      mappedDuels[duel.user1Id][duel.user2Id] = duel
      mappedDuels[duel.user2Id] = mappedDuels[duel.user2Id] || {}
      mappedDuels[duel.user2Id][duel.user1Id] = duel
    }

    const tierMappedStandings: Record<number, LeagueStandings[]> = {}
    for (const standing of standings) {
      tierMappedStandings[standing.tierId] = tierMappedStandings[standing.tierId] || []
      tierMappedStandings[standing.tierId].push(standing)
    }
    for (const standings of Object.values(tierMappedStandings)) {
      standings.sort((a, b) => {
        if (a.points != b.points) {
          return b.points - a.points
        }
        if (a.wins != b.wins) {
          return b.wins - a.wins
        }
        if (a.bestMo3 != b.bestMo3) {
          if (a.bestMo3 === 0) {
            return 1
          }
          if (b.bestMo3 === 0) {
            return -1
          }
          return a.bestMo3 - b.bestMo3
        }
        return -1
      })
      // find small tables
      const pointsMappedStandings: Record<number, LeagueStandings[]> = {}
      standings.forEach((standing, i) => {
        standing.position = i + 1
        pointsMappedStandings[standing.points] = pointsMappedStandings[standing.points] || []
        pointsMappedStandings[standing.points].push(standing)
      })
      for (const smallTables of Object.values(pointsMappedStandings)) {
        const count = smallTables.length
        if (count === 1) {
          continue
        }
        const wins = Object.fromEntries(smallTables.map(s => [s.userId, 0]))
        const minPosition = smallTables[0].position
        // check all head to head
        for (let i = 0; i < count - 1; i++) {
          for (let j = i + 1; j < count; j++) {
            const a = smallTables[i]
            const b = smallTables[j]
            const duel = mappedDuels[a.userId]?.[b.userId]
            if (!duel) {
              continue
            }
            const aPoints = duel.getUserPoints(a.user)
            const bPoints = duel.getUserPoints(duel.getOpponent(a.user))
            if (aPoints > bPoints) {
              wins[a.userId]++
            } else if (aPoints < bPoints) {
              wins[b.userId]++
            }
          }
        }
        smallTables.sort((a, b) => {
          if (wins[a.userId] !== wins[b.userId]) {
            return wins[b.userId] - wins[a.userId]
          }
          if (a.wins != b.wins) {
            return b.wins - a.wins
          }
          if (a.bestMo3 != b.bestMo3) {
            if (a.bestMo3 === 0) {
              return 1
            }
            if (b.bestMo3 === 0) {
              return -1
            }
            return a.bestMo3 - b.bestMo3
          }
        })
        smallTables.forEach((s, i) => (s.position = minPosition + i))
      }
    }

    await this.leagueDuelsRepository.save(duels)
    await this.leagueStandingsRepository.save(standings)
  }

  calculateDuelPoints(duel: LeagueDuels, mappedStandings: Record<number, LeagueStandings>) {
    const result1 = duel.user1Result?.values || [DNS, DNS, DNS]
    const result2 = duel.user2Result?.values || [DNS, DNS, DNS]
    let user1Points = 0
    let user2Points = 0
    for (let i = 0; i < 3; i++) {
      if (betterThan(result1[i], result2[i])) {
        user1Points++
      } else if (betterThan(result2[i], result1[i])) {
        user2Points++
      } else {
        user1Points += 0.5
        user2Points += 0.5
      }
    }
    duel.user1Points = user1Points
    duel.user2Points = user2Points
    const user1Standing = mappedStandings[duel.user1Id]
    const user2Standing = mappedStandings[duel.user2Id]
    // win 2 points, draw 1 point, loss 0 point
    if (user1Points > user2Points) {
      user1Standing.points += 2
      user1Standing.wins++
      user2Standing.losses++
    } else if (user1Points < user2Points) {
      user2Standing.points += 2
      user2Standing.wins++
      user1Standing.losses++
    } else {
      user1Standing.points++
      user2Standing.points++
      user1Standing.draws++
      user2Standing.draws++
    }
    if (
      duel.user1Result?.average > 0 &&
      (duel.user1Result?.average < user1Standing.bestMo3 || user1Standing.bestMo3 === 0)
    ) {
      user1Standing.bestMo3 = duel.user1Result.average
    }
    if (
      duel.user2Result?.average > 0 &&
      (duel.user2Result?.average < user2Standing.bestMo3 || user2Standing.bestMo3 === 0)
    ) {
      user2Standing.bestMo3 = duel.user2Result.average
    }
  }
}
