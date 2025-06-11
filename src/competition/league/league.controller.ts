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

  @Get('sessions')
  async getSessions() {
    return this.leagueService.getSessions()
  }

  @Get('session/on-going')
  async getOnGoingSession() {
    const session = await this.leagueService.getOnGoing()
    this.leagueService.hideScrambles(session)
    return session
  }

  @Get('session/next')
  async getNextSession() {
    const session = await this.leagueService.getNext()
    this.leagueService.hideScrambles(session)
    return session
  }

  @Get('session/:number')
  async getSession(@Param('number', ParseIntPipe) number: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    this.leagueService.hideScrambles(session)
    return session
  }

  @Get('session/:number/schedules')
  async getSchedules(@Param('number', ParseIntPipe) number: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const schedules = await this.leagueService.getSchedules(session)
    return schedules
  }

  @Get('session/:number/standings')
  async getStandings(@Param('number', ParseIntPipe) number: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const standings = await this.leagueService.getStandings(session)
    return standings
  }

  @Get('session/:number/results')
  async getResults(@Param('number', ParseIntPipe) number: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const results = await this.leagueService.getResults(session)
    return results
  }

  @Get('session/:number/tiers')
  async getTiers(@Param('number', ParseIntPipe) number: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const tiers = await this.leagueService.getTiers(session)
    return tiers
  }

  @Get('session/:number/:week/schedules')
  async getWeekSchedules(@Param('number', ParseIntPipe) number: number, @Param('week', ParseIntPipe) week: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetition(session, week)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    const schedules = await this.leagueService.getWeekSchedules(session, competition)
    return schedules
  }

  @Get('session/:number/:week/submissions')
  @UseGuards(JwtAuthGuard)
  async getWeekSubmissions(
    @Param('number', ParseIntPipe) number: number,
    @Param('week', ParseIntPipe) week: number,
    @CurrentUser() user: Users,
  ) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetition(session, week)
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

  @Get('session/:number/:week/results')
  async getWeekResults(@Param('number', ParseIntPipe) number: number, @Param('week', ParseIntPipe) week: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetition(session, week)
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

  @Get('session/:number/:week')
  async getSessionCompetition(
    @Param('number', ParseIntPipe) number: number,
    @Param('week', ParseIntPipe) week: number,
  ) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException()
    }
    return session.competitions.find(c => c.alias === `league-${number}-${week}`)
  }

  @Post('session/:number/:alias')
  @ApiBearerAuth()
  @UseGuards(JwtRequiredGuard)
  public async submit(
    @Param('number', ParseIntPipe) number: number,
    @Param('alias') alias: string,
    @CurrentUser() user: Users,
    @Body() solution: SubmitSolutionDto,
  ) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetitionByAlias(session, alias)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    // check player
    // const player = await this.leagueService.getPlayer(session, user)
    // if (!player) {
    //   throw new NotFoundException('Player not found')
    // }
    return await this.leagueService.submitSolution(competition, user, solution)
  }

  @Post('session/:number/:alias/:id')
  @ApiBearerAuth()
  @UseGuards(JwtRequiredGuard)
  public async update(
    @Param('number', ParseIntPipe) number: number,
    @Param('alias') alias: string,
    @Param('id', ParseIntPipe) submissionId: number,
    @CurrentUser() user: Users,
    @Body() solution: Pick<SubmitSolutionDto, 'comment' | 'attachments'>,
  ) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetitionByAlias(session, alias)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    await this.leagueService.update(competition, user, submissionId, solution)
    return true
  }
}
