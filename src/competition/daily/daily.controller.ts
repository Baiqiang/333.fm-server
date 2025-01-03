import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common'

import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@/auth/guards/jwt.guard'
import { JwtRequiredGuard } from '@/auth/guards/jwt-required.guard'
import { PaginationDto } from '@/dtos/pagination.dto'
import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { CompetitionMode } from '@/entities/competitions.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'

import { CompetitionService } from '../competition.service'
import { WeeklyService } from '../weekly/weekly.service'
import { DailyService } from './daily.service'

@Controller('daily')
export class DailyController {
  constructor(
    private readonly dailyService: DailyService,
    private readonly weeklyService: WeeklyService,
    private readonly competitionService: CompetitionService,
    private readonly userService: UserService,
  ) {}

  @Get()
  public async getCompetitions(@Query() { page, limit }: PaginationDto) {
    return this.dailyService.getCompetitions({ page, limit })
  }

  @Get('on-going')
  public async getOnGoing() {
    const competition = await this.dailyService.getOnGoing()
    if (!competition) {
      throw new NotFoundException()
    }
    return competition
  }

  @Get(':day')
  public async getCompetition(@Param('day') day: string) {
    const competition = await this.dailyService.getCompetition(day)
    if (!competition) {
      throw new NotFoundException()
    }
    return competition
  }

  @Get(':day/results')
  public async getResults(@Param('day') day: string) {
    const competition = await this.dailyService.getCompetition(day)
    if (!competition) {
      throw new NotFoundException()
    }
    const regular = await this.competitionService.getResults(competition, { mode: CompetitionMode.REGULAR })
    const unlimited = await this.competitionService.getResults(competition, { mode: CompetitionMode.UNLIMITED })
    return {
      regular,
      unlimited,
    }
  }

  @Post(':day')
  @UseGuards(JwtRequiredGuard)
  public async submit(@Param('day') day: string, @CurrentUser() user: Users, @Body() solution: SubmitSolutionDto) {
    const competition = await this.dailyService.getCompetition(day)
    if (!competition) {
      throw new NotFoundException()
    }
    return await this.weeklyService.submitSolution(competition, user, solution)
  }

  @Post(':day/:id')
  @UseGuards(JwtRequiredGuard)
  public async update(
    @Param('day') day: string,
    @Param('id', ParseIntPipe) submissionId: number,
    @CurrentUser() user: Users,
    @Body() solution: Pick<SubmitSolutionDto, 'comment' | 'attachments'>,
  ) {
    const competition = await this.dailyService.getCompetition(day)
    if (!competition) {
      throw new NotFoundException()
    }
    await this.weeklyService.update(competition, user, submissionId, solution)
    return true
  }

  @Post(':day/:id/unlimited')
  @UseGuards(JwtRequiredGuard)
  public async toUnlimited(
    @Param('day') day: string,
    @Param('id', ParseIntPipe) submissionId: number,
    @CurrentUser() user: Users,
  ) {
    const competition = await this.dailyService.getCompetition(day)
    if (!competition) {
      throw new NotFoundException()
    }
    await this.weeklyService.turnToUnlimited(competition, user, submissionId)
    return true
  }

  @Get(':day/submissions')
  @UseGuards(JwtAuthGuard)
  public async getSubmissions(@CurrentUser() user: Users, @Param('day') day: string) {
    const competition = await this.dailyService.getCompetition(day)
    if (!competition) {
      throw new NotFoundException()
    }
    const submissions = await this.competitionService.getSubmissions(competition)
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
}
