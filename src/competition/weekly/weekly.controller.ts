import { CacheInterceptor } from '@nestjs/cache-manager'
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'

import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@/auth/guards/jwt.guard'
import { JwtRequiredGuard } from '@/auth/guards/jwt-required.guard'
import { PaginationDto } from '@/dtos/pagination.dto'
import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { CompetitionMode } from '@/entities/competitions.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'

import { WeeklyService } from './weekly.service'

@Controller('weekly')
export class WeeklyController {
  constructor(
    private readonly weeklyService: WeeklyService,
    private readonly userService: UserService,
  ) {}

  @Get()
  @UseInterceptors(CacheInterceptor)
  public async getCompetitions(@Query() { page, limit }: PaginationDto) {
    return this.weeklyService.getCompetitions({ page, limit })
  }

  @Get('on-going')
  @UseInterceptors(CacheInterceptor)
  public async getOnGoing() {
    return this.weeklyService.getOnGoing()
  }

  @Get(':week')
  @UseInterceptors(CacheInterceptor)
  public async getCompetition(@Param('week') week: string) {
    const competition = await this.weeklyService.getCompetition(week)
    if (!competition) {
      throw new NotFoundException()
    }
    return competition
  }

  @Get(':week/results')
  @UseInterceptors(CacheInterceptor)
  public async getResults(@Param('week') week: string) {
    const competition = await this.weeklyService.getCompetition(week)
    if (!competition) {
      throw new NotFoundException()
    }
    const regular = await this.weeklyService.getResults(competition, CompetitionMode.REGULAR)
    const unlimited = await this.weeklyService.getResults(competition, CompetitionMode.UNLIMITED)
    return {
      regular,
      unlimited,
    }
  }

  @Post(':week')
  @UseGuards(JwtRequiredGuard)
  public async submit(@Param('week') week: string, @CurrentUser() user: Users, @Body() solution: SubmitSolutionDto) {
    const competition = await this.weeklyService.getCompetition(week)
    if (!competition) {
      throw new NotFoundException()
    }
    return await this.weeklyService.submitSolution(competition, user, solution)
  }

  @Post(':week/:id')
  @UseGuards(JwtRequiredGuard)
  public async update(
    @Param('week') week: string,
    @Param('id', ParseIntPipe) submissionId: number,
    @CurrentUser() user: Users,
    @Body() solution: Pick<SubmitSolutionDto, 'comment'>,
  ) {
    const competition = await this.weeklyService.getCompetition(week)
    if (!competition) {
      throw new NotFoundException()
    }
    await this.weeklyService.updateComment(competition, user, submissionId, solution)
    return true
  }

  @Post(':week/:id/unlimited')
  @UseGuards(JwtRequiredGuard)
  public async toUnlimited(
    @Param('week') week: string,
    @Param('id', ParseIntPipe) submissionId: number,
    @CurrentUser() user: Users,
  ) {
    const competition = await this.weeklyService.getCompetition(week)
    if (!competition) {
      throw new NotFoundException()
    }
    await this.weeklyService.turnToUnlimited(competition, user, submissionId)
    return true
  }

  @Get(':week/submissions')
  @UseGuards(JwtAuthGuard)
  public async getSubmissions(@CurrentUser() user: Users, @Param('week') week: string) {
    const competition = await this.weeklyService.getCompetition(week)
    if (!competition) {
      throw new NotFoundException()
    }
    const submissions = await this.weeklyService.getSubmissions(competition)
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
