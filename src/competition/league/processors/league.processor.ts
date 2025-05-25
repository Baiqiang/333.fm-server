import { Process, Processor } from '@nestjs/bull'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bull'
import { Repository } from 'typeorm'

import { LeagueDuels } from '@/entities/league-duels.entity'
import { LeaguePlayers } from '@/entities/league-players.entity'
import { LeagueStandings } from '@/entities/league-standings.entity'
import { Results } from '@/entities/results.entity'
import { UserService } from '@/user/user.service'

import { LeagueJob, LeagueService } from '../league.service'

@Processor('league')
export class LeagueProcessor {
  constructor(
    @InjectRepository(LeaguePlayers)
    private readonly leaguePlayersRepository: Repository<LeaguePlayers>,
    @InjectRepository(LeagueDuels)
    private readonly leagueDuelsRepository: Repository<LeagueDuels>,
    @InjectRepository(LeagueStandings)
    private readonly leagueStandingsRepository: Repository<LeagueStandings>,
    @InjectRepository(Results)
    private readonly resultsRepository: Repository<Results>,
    private readonly leagueService: LeagueService,
    private readonly userService: UserService,
  ) {}

  @Process()
  async process(job: Job<LeagueJob>) {
    console.log('process job', job.data)
    const { competitionId, userId } = job.data
    const result = await this.resultsRepository.findOneBy({ competitionId, userId })
    console.log(result?.values)
    // check if all attempts submitted
    if (!result || result.values.some(v => v === 0)) {
      return
    }
    try {
      const user = await this.userService.findOne(userId)
      const duel = await this.leagueDuelsRepository.findOne({
        where: [
          {
            competitionId,
            user1Id: user.id,
          },
          {
            competitionId,
            user2Id: user.id,
          },
        ],
        relations: {
          competition: {
            leagueSession: true,
          },
          user1: true,
          user2: true,
        },
      })
      const opponent = duel.getOpponent(user)
      const opponentResult = await this.resultsRepository.findOneBy({
        competitionId,
        userId: opponent.id,
      })
      console.log(opponentResult?.values)
      if (!opponentResult || opponentResult.values.some(v => v === 0)) {
        return
      }
      duel.user1Result = duel.user1Id === user.id ? result : opponentResult
      duel.user2Result = duel.user2Id === user.id ? result : opponentResult
      const mappedStandings = await this.leagueService.getMappedStandings(duel.competition.leagueSession)
      await this.leagueService.calculateDuelPoints(duel, mappedStandings)
      await this.leagueDuelsRepository.save(duel)
      await this.leagueStandingsRepository.save(Object.values(mappedStandings))
      console.log(duel, mappedStandings)
    } catch (e) {
      console.log(e)
    }
  }
}
