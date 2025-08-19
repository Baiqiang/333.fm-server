import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Pagination } from 'nestjs-typeorm-paginate'

import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { JwtRequiredGuard } from '@/auth/guards/jwt-required.guard'
import { PaginationDto } from '@/dtos/pagination.dto'
import { AddScramblesDto, ReconstructionCompetitionDto } from '@/dtos/reconstruction.dto'
import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { Competitions } from '@/entities/competitions.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'

import { ReconstructionService } from './reconstruction.service'

@ApiTags('Reconstruction')
@Controller('reconstruction')
export class ReconstructionController {
  constructor(private readonly reconstructionService: ReconstructionService) {}

  @Post('competitions')
  @UseGuards(JwtRequiredGuard)
  @ApiBearerAuth()
  async createCompetition(
    @CurrentUser() user: Users,
    @Body() dto: ReconstructionCompetitionDto,
  ): Promise<Competitions> {
    return this.reconstructionService.createCompetition(user, dto)
  }

  @Get('competitions')
  @ApiQuery({ type: PaginationDto })
  async getCompetitions(@Query() paginationOptions: PaginationDto): Promise<Pagination<Competitions>> {
    return this.reconstructionService.getCompetitions(paginationOptions)
  }

  @Get('competitions/:id')
  async getCompetition(@Param('id', ParseIntPipe) id: number): Promise<Competitions> {
    const competition = await this.reconstructionService.getCompetitionById(id)
    if (!competition) {
      throw new NotFoundException()
    }
    return competition
  }

  @Post('competitions/:id')
  @UseGuards(JwtRequiredGuard)
  @ApiBearerAuth()
  async updateCompetition(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: Users,
    @Body() dto: ReconstructionCompetitionDto,
  ): Promise<Competitions> {
    return this.reconstructionService.updateCompetition(id, user, dto)
  }

  @Post('competitions/:id/scrambles')
  @UseGuards(JwtRequiredGuard)
  @ApiBearerAuth()
  async addScrambles(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: Users,
    @Body() dto: AddScramblesDto,
  ): Promise<Competitions> {
    return this.reconstructionService.addScramblesToCompetition(id, user, dto.scrambles)
  }

  @Post('submissions')
  @UseGuards(JwtRequiredGuard)
  @ApiBearerAuth()
  async submitSolution(@CurrentUser() user: Users, @Body() dto: SubmitSolutionDto): Promise<Submissions> {
    return this.reconstructionService.submitSolution(user, dto)
  }

  @Get('submissions/:id')
  async getSubmission(@Param('id', ParseIntPipe) id: number): Promise<Submissions> {
    const submission = await this.reconstructionService.getSubmissionById(id)
    if (!submission) {
      throw new NotFoundException()
    }
    return submission
  }

  @Post('submissions/:id')
  @UseGuards(JwtRequiredGuard)
  @ApiBearerAuth()
  async updateSubmission(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: Users,
    @Body() dto: SubmitSolutionDto,
  ): Promise<Submissions> {
    return this.reconstructionService.updateSubmission(id, user, dto)
  }
}
