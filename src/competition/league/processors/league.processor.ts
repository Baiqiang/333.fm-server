import { Process, Processor } from '@nestjs/bull'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bull'
import { Repository } from 'typeorm'

import { LeagueDuels } from '@/entities/league-duels.entity'
import { LeaguePlayers } from '@/entities/league-players.entity'
import { LeagueStandings } from '@/entities/league-standings.entity'
import { Results } from '@/entities/results.entity'

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
      const player = await this.leaguePlayersRepository.findOneBy({
        userId,
      })
      const duel = await this.leagueDuelsRepository.findOne({
        where: [
          {
            competitionId,
            player1Id: player.id,
          },
          {
            competitionId,
            player2Id: player.id,
          },
        ],
        relations: {
          competition: {
            leagueSession: true,
          },
          player1: true,
          player2: true,
        },
      })
      const opponent = duel.getOpponent(player)
      const opponentResult = await this.resultsRepository.findOneBy({
        competitionId,
        userId: opponent.userId,
      })
      console.log(opponentResult?.values)
      if (!opponentResult || opponentResult.values.some(v => v === 0)) {
        return
      }
      duel.player1Result = duel.player1Id === player.id ? result : opponentResult
      duel.player2Result = duel.player2Id === player.id ? result : opponentResult
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
