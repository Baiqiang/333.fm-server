import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOneOptions, In, Repository } from 'typeorm'
import { readFile } from 'xlsx'

import { CompetitionService } from '@/competition/competition.service'
import {
  CompetitionFormat,
  CompetitionMode,
  Competitions,
  CompetitionStatus,
  CompetitionType,
} from '@/entities/competitions.entity'
import { LeagueDuels } from '@/entities/league-duels.entity'
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

  async import(filename: string, seasonNumber: string) {
    // read from xlsx file
    const xlsx = await readFile(filename)
    const scrambleSheetName = xlsx.SheetNames.find(s => s.toLowerCase().includes('scramble'))
    const scrambleSheet = xlsx.Sheets[scrambleSheetName]
    if (!scrambleSheet) {
      console.log('Failed to find scrambles')
      return
    }
    for (let week = 1; week <= 9; week++) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const sheetName = xlsx.SheetNames.find(s => s.includes(`${week}.${attempt}`))
        if (!sheetName) {
          console.error('Failed to find sheet', week, attempt)
          continue
        }
        const scramble = scrambleSheet[`B${(week - 1) * 3 + attempt + 1}`].v
        const sheet = xlsx.Sheets[sheetName]
        let row = 1
        while (true) {
          const nameCell = sheet[`A${row}`]
          if (!nameCell || !nameCell.v) {
            break
          }
          const name = nameCell.v
          const wcaID = sheet[`B${row}`].v
          const moves = sheet[`C${row}`].v
          const solution = sheet[`D${row}`]?.v
          const comment = sheet[`E${row}`]?.v
          const realMoves = calculateMoves(scramble, solution)
          let valid = true
          if (realMoves / 100 !== moves && moves < 100) {
            valid = false
          }
          let movesCount = parseInt(moves) * 100
          if (!(movesCount < 80)) {
            movesCount = DNF
          }
          const submission = new Submissions()
          const user = await this.usersRepository.findOne({ where: { wcaId: wcaID } })
          if (!user) {
            console.error('User not found', wcaID)
            continue
          }
          // submission.name = name
          // submission.wcaID = wcaID
          // submission.moves = movesCount
          // submission.comment = comment
          // submission.valid = valid
          // submission.seasonNumber = seasonNumber
          row++
          // break
        }
      }
    }
  }

  async updateElo(filename: string, seasonNumber: string) {
    const calculator = new EloCalculator(filename)
    const eloList = calculator.updateWeeks(Number(seasonNumber))
    console.log(eloList)
  }
}
