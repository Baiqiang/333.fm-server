import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth } from '@nestjs/swagger'

import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@/auth/guards/jwt.guard'
import { JwtRequiredGuard } from '@/auth/guards/jwt-required.guard'
import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { CompetitionMode } from '@/entities/competitions.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'

import { CompetitionService } from '../competition.service'
import { LeagueService } from './league.service'

@Controller('league')
export class LeagueController {
  constructor(
    private readonly leagueService: LeagueService,
    private readonly competitionService: CompetitionService,
    private readonly userService: UserService,
  ) {}

  @Get('seasons')
  async getSeasons() {
    return this.leagueService.getSeasons()
  }

  @Get('season/on-going')
  async getOnGoingSeason() {
    const season = await this.leagueService.getOnGoing()
    this.leagueService.hideScrambles(season)
    return season
  }

  @Get('season/next')
  async getNextSeason() {
    const season = await this.leagueService.getNext()
    this.leagueService.hideScrambles(season)
    return season
  }

  @Get('season/:number')
  async getSeason(@Param('number', ParseIntPipe) number: number) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    this.leagueService.hideScrambles(season)
    return season
  }

  @Get('season/:number/schedules')
  @UseGuards(JwtAuthGuard)
  async getSchedules(@Param('number', ParseIntPipe) number: number, @CurrentUser() user: Users) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const schedules = await this.leagueService.getSchedules(season, user)
    return schedules
  }

  @Get('season/:number/standings')
  async getStandings(@Param('number', ParseIntPipe) number: number) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const standings = await this.leagueService.getStandings(season)
    return standings
  }

  @Get('season/:number/results')
  async getResults(@Param('number', ParseIntPipe) number: number) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const results = await this.leagueService.getResults(season)
    return results
  }

  @Get('season/:number/solves')
  async getSolves(@Param('number', ParseIntPipe) number: number) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const solves = await this.leagueService.getSolves(season)
    return solves
  }

  @Get('season/:number/tiers')
  async getTiers(@Param('number', ParseIntPipe) number: number) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const tiers = await this.leagueService.getTiers(season)
    return tiers
  }

  @Get('season/:number/participated')
  @ApiBearerAuth()
  @UseGuards(JwtRequiredGuard)
  async getParticipated(@Param('number', ParseIntPipe) number: number, @CurrentUser() user: Users) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const participant = await this.leagueService.getParticipant(season, user)
    return participant
  }

  @Post('season/:number/participate')
  @ApiBearerAuth()
  @UseGuards(JwtRequiredGuard)
  async participate(@Param('number', ParseIntPipe) number: number, @CurrentUser() user: Users) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    await this.leagueService.participate(season, user)
    return true
  }

  @Post('season/:number/unparticipate')
  @ApiBearerAuth()
  @UseGuards(JwtRequiredGuard)
  async unparticipate(@Param('number', ParseIntPipe) number: number, @CurrentUser() user: Users) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    await this.leagueService.unparticipate(season, user)
    return true
  }

  @Get('season/:number/:week/schedules')
  @UseGuards(JwtAuthGuard)
  async getWeekSchedules(
    @Param('number', ParseIntPipe) number: number,
    @Param('week', ParseIntPipe) week: number,
    @CurrentUser() user: Users,
  ) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const competition = await this.leagueService.getSeasonCompetition(season, week)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    const schedules = await this.leagueService.getWeekSchedules(season, competition, user)
    return schedules
  }

  @Get('season/:number/:week/submissions')
  @UseGuards(JwtAuthGuard)
  async getWeekSubmissions(
    @Param('number', ParseIntPipe) number: number,
    @Param('week', ParseIntPipe) week: number,
    @CurrentUser() user: Users,
  ) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const competition = await this.leagueService.getSeasonCompetition(season, week)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    // return blank list if competition has ended
    if (!user && !competition.hasEnded) {
      return []
    }
    let submissions = await this.competitionService.getSubmissions(competition)
    if (!competition.hasEnded) {
      const duel = await this.leagueService.getWeekDuel(competition, user)
      if (duel) {
        const opponent = duel.getOpponent(user)
        if (submissions.filter(s => s.userId === user.id).length < 3) {
          submissions = submissions.filter(s => s.userId !== opponent.id)
        }
      }
    }
    const ret: Record<number, Submissions[]> = {}
    const userSubmissions: Record<number, Submissions> = {}
    submissions.forEach(submission => {
      if (!ret[submission.scrambleId]) {
        ret[submission.scrambleId] = []
      }
      ret[submission.scrambleId].push(submission)
      if (user) {
        if (submission.userId === user.id) {
          userSubmissions[submission.scrambleId] = submission
        }
      }
    })
    submissions.forEach(submission => {
      if (userSubmissions[submission.scrambleId] || competition.hasEnded) {
        submission.hideSolution = false
      } else {
        submission.hideSolution = true
        submission.removeSolution()
      }
    })
    if (user) {
      await this.userService.loadUserActivities(user, submissions)
    }
    return ret
  }

  @Get('season/:number/:week/results')
  async getWeekResults(@Param('number', ParseIntPipe) number: number, @Param('week', ParseIntPipe) week: number) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const competition = await this.leagueService.getSeasonCompetition(season, week)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    if (!competition.hasEnded) {
      return {
        regular: [],
        unlimited: [],
      }
    }
    const regular = await this.competitionService.getResults(competition, { mode: CompetitionMode.REGULAR })
    const unlimited = await this.competitionService.getResults(competition, { mode: CompetitionMode.UNLIMITED })
    return {
      regular,
      unlimited,
    }
  }

  @Get('season/:number/:week')
  async getSeasonCompetition(@Param('number', ParseIntPipe) number: number, @Param('week', ParseIntPipe) week: number) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException()
    }
    this.leagueService.hideScrambles(season)
    return season.competitions.find(c => c.alias === `league-${number}-${week}`)
  }

  @Post('season/:number/:alias')
  @ApiBearerAuth()
  @UseGuards(JwtRequiredGuard)
  public async submit(
    @Param('number', ParseIntPipe) number: number,
    @Param('alias') alias: string,
    @CurrentUser() user: Users,
    @Body() solution: SubmitSolutionDto,
  ) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const competition = await this.leagueService.getSeasonCompetitionByAlias(season, alias)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    // check player
    // const player = await this.leagueService.getPlayer(season, user)
    // if (!player) {
    //   throw new NotFoundException('Player not found')
    // }
    return await this.leagueService.submitSolution(competition, user, solution)
  }

  @Post('season/:number/:alias/:id')
  @ApiBearerAuth()
  @UseGuards(JwtRequiredGuard)
  public async update(
    @Param('number', ParseIntPipe) number: number,
    @Param('alias') alias: string,
    @Param('id', ParseIntPipe) submissionId: number,
    @CurrentUser() user: Users,
    @Body() solution: Pick<SubmitSolutionDto, 'comment' | 'attachments'>,
  ) {
    const season = await this.leagueService.getSeason(number)
    if (!season) {
      throw new NotFoundException('Season not found')
    }
    const competition = await this.leagueService.getSeasonCompetitionByAlias(season, alias)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    await this.leagueService.update(competition, user, submissionId, solution)
    return true
  }
}
