import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common'

import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@/auth/guards/jwt.guard'
import { JwtRequiredGuard } from '@/auth/guards/jwt-required.guard'
import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'

import { ChainService } from './chain.service'

@Controller('chain')
export class ChainController {
  constructor(
    private readonly chainService: ChainService,
    private readonly userService: UserService,
  ) {}

  @Get('')
  public async getOnGoing() {
    return this.chainService.get()
  }

  @Get(':number/top10')
  public async top10(@Param('number', ParseIntPipe) number: number) {
    const competition = await this.chainService.get()
    if (!competition) {
      throw new NotFoundException()
    }
    const scramble = competition.scrambles.find(s => s.number === number)
    if (!scramble) {
      throw new NotFoundException()
    }
    return this.chainService.getTopN(competition, scramble, 10)
  }

  @Get([':number/submissions', ':number/:parentId/submissions'])
  @UseGuards(JwtAuthGuard)
  async submissions(
    @Param('number', ParseIntPipe) number: number,
    @Param('parentId', new DefaultValuePipe(0), ParseIntPipe) parentId: number,
    @CurrentUser() user: Users,
  ) {
    const competition = await this.chainService.get()
    if (!competition) {
      throw new NotFoundException()
    }
    const scramble = competition.scrambles.find(s => s.number === number)
    if (!scramble) {
      throw new NotFoundException()
    }
    let parent = null
    if (parentId) {
      parent = await this.chainService.getSubmission(competition, scramble, parentId)
      if (!parent) {
        throw new NotFoundException()
      }
    }
    const submissions = await this.chainService.getSubmissions(competition, scramble, parent, user)
    if (user) {
      await this.userService.loadUserActivities(user, submissions)
    }
    return submissions
  }

  @Get([':number', ':number/:id'])
  @UseGuards(JwtAuthGuard)
  async tree(
    @Param('number', ParseIntPipe) number: number,
    @Param('id', new DefaultValuePipe(0), ParseIntPipe) id: number,
    @CurrentUser() user: Users,
  ) {
    const competition = await this.chainService.get()
    if (!competition) {
      throw new NotFoundException()
    }
    const scramble = competition.scrambles.find(s => s.number === number)
    if (!scramble) {
      throw new NotFoundException()
    }
    if (!id) {
      return {
        scramble,
        tree: null,
      }
    }
    const submission = await this.chainService.getSubmission(competition, scramble, id)
    if (!submission) {
      throw new NotFoundException()
    }
    const tree = await this.chainService.getTree(submission)
    if (user) {
      await this.userService.act(user, submission.id, { view: true, notify: false })
      await this.userService.loadUserActivities(user, [tree])
    }
    return {
      scramble,
      tree,
    }
  }

  @Post('')
  @UseGuards(JwtRequiredGuard)
  async submit(@CurrentUser() user: Users, @Body() solution: SubmitSolutionDto) {
    const competition = await this.chainService.get()
    if (!competition) {
      throw new NotFoundException()
    }
    return this.chainService.submitSolution(competition, user, solution)
  }
}
