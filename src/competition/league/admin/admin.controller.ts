import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common'

import { AuthService } from '@/auth/auth.service'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { Roles } from '@/auth/decorators/roles.decorator'
import { Role } from '@/auth/enums/role.enum'
import { JwtRequiredGuard } from '@/auth/guards/jwt-required.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { LeaguePlayerDto } from '@/dtos/league-player.dto'
import { CompetitionStatus } from '@/entities/competitions.entity'
import { LeagueSessionStatus } from '@/entities/league-sessions.entity'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'

import { LeagueService } from '../league.service'

@Controller('league/admin')
@UseGuards(JwtRequiredGuard, RolesGuard)
@Roles(Role.LeagueAdmin)
export class AdminController {
  constructor(
    private readonly leagueService: LeagueService,
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Post('signin-as')
  async signInAs(@Body('wcaId') wcaId: string) {
    const user = await this.userService.findOne(wcaId)
    if (!user) {
      throw new BadRequestException('User does not exist')
    }
    return this.authService.wcaSignIn(user)
  }

  @Get('sessions')
  async getSessions() {
    return this.leagueService.getSessions()
  }

  @Get('session/:number')
  async getSession(@Param('number', ParseIntPipe) number: number) {
    return this.leagueService.getSession(number)
  }

  @Post('session')
  async createSession(
    @Body('number') number: number,
    @Body('startTime') startTime: string,
    @Body('weeks') weeks: number,
    @Body('numTiers') numTiers: number,
    @CurrentUser() user: Users,
  ) {
    const session = await this.leagueService.createSession(number, startTime, weeks)
    const competitions = await this.leagueService.createCompetitions(session, user, weeks, startTime)
    const tiers = await this.leagueService.createTiers(session, numTiers)
    session.competitions = competitions
    session.tiers = tiers
    return session
  }

  @Delete('session/:number')
  async deleteSession(@Param('number', ParseIntPipe) number: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    await this.leagueService.deleteSession(session)
    return {
      message: 'Session deleted',
    }
  }

  @Post('session/:number/players')
  async pickPlayers(
    @Param('number', ParseIntPipe) number: number,
    @Body('tierId') tierId: number,
    @Body('players') players: LeaguePlayerDto[],
  ) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const tier = await this.leagueService.getTier(session, tierId)
    if (!tier) {
      throw new NotFoundException('Tier not found')
    }
    await this.leagueService.pickPlayers(tier, players)
    return {
      tier,
      players,
    }
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

  @Post('session/:number/schedules')
  async generateSchedules(@Param('number', ParseIntPipe) number: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const currentSchedules = await this.leagueService.getSchedules(session)
    if (
      currentSchedules.length !== 0 &&
      (session.status !== LeagueSessionStatus.NOT_STARTED ||
        session.competitions.some(competition => competition.status !== CompetitionStatus.NOT_STARTED))
    ) {
      throw new BadRequestException('Schedules exist and can not regenerate')
    }
    await this.leagueService.getOrCreateStandings(session)
    const schedules = await this.leagueService.generateSchedules(session)
    return schedules
  }

  @Get('session/:number/:week')
  async getSessionCompetition(
    @Param('number', ParseIntPipe) number: number,
    @Param('week', ParseIntPipe) week: number,
  ) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetition(session, week)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    return competition
  }

  @Post('session/:number/:week/start')
  async startSessionCompetition(
    @Param('number', ParseIntPipe) number: number,
    @Param('week', ParseIntPipe) week: number,
  ) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetition(session, week)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    await this.leagueService.startCompetition(competition)
    await this.leagueService.startSession(session)
    return competition
  }

  @Post('session/:number/:week/end')
  async endSessionCompetition(
    @Param('number', ParseIntPipe) number: number,
    @Param('week', ParseIntPipe) week: number,
  ) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetition(session, week)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    await this.leagueService.endCompetition(competition)
    return competition
  }

  @Post('session/:number/:week/scrambles')
  async importScrambles(
    @Param('number', ParseIntPipe) number: number,
    @Param('week', ParseIntPipe) week: number,
    @Body('scrambles') scrambleStrings: string[],
  ) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetition(session, week)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    // check if competition has started
    if (competition.hasStarted && competition.scrambles.length > 0) {
      throw new BadRequestException('Competition has already started')
    }
    const scrambles = await this.leagueService.updateScrambles(competition, scrambleStrings)
    return {
      competition,
      scrambles,
    }
  }

  @Post('session/:number/:week/generate-scrambles')
  async generateScrambles(@Param('number', ParseIntPipe) number: number, @Param('week', ParseIntPipe) week: number) {
    const session = await this.leagueService.getSession(number)
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    const competition = await this.leagueService.getSessionCompetition(session, week)
    if (!competition) {
      throw new NotFoundException('Competition not found')
    }
    // check if competition has started
    if (competition.hasStarted && competition.scrambles.length > 0) {
      throw new BadRequestException('Competition has already started')
    }
    const scrambles = await this.leagueService.generateScrambles(competition)
    return {
      competition,
      scrambles,
    }
  }
}
