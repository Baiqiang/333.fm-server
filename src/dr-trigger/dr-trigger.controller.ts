import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common'

import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { JwtRequiredGuard } from '@/auth/guards/jwt-required.guard'
import { DRTriggerStartDto, DRTriggerSubmitDto } from '@/dtos/dr-trigger-submit.dto'
import { Users } from '@/entities/users.entity'

import { DRTriggerService } from './dr-trigger.service'

@Controller('dr-trigger')
export class DRTriggerController {
  constructor(private readonly drTriggerService: DRTriggerService) {}

  @Post('start')
  @UseGuards(JwtRequiredGuard)
  async start(@CurrentUser() user: Users, @Body() dto: DRTriggerStartDto) {
    return this.drTriggerService.startGame(user, dto.difficulty ?? 5)
  }

  @Post('submit')
  @UseGuards(JwtRequiredGuard)
  async submit(@CurrentUser() user: Users, @Body() dto: DRTriggerSubmitDto) {
    return this.drTriggerService.submitSolution(user, dto.gameId, dto.solution)
  }

  @Post('abandon/:id')
  @UseGuards(JwtRequiredGuard)
  async abandon(@CurrentUser() user: Users, @Param('id', ParseIntPipe) id: number) {
    return this.drTriggerService.abandonGame(user, id)
  }

  @Get('ongoing')
  @UseGuards(JwtRequiredGuard)
  async ongoing(@CurrentUser() user: Users) {
    return this.drTriggerService.getOngoingGame(user)
  }

  @Get('game/:id')
  async getGame(@Param('id', ParseIntPipe) id: number) {
    return this.drTriggerService.getGame(id)
  }

  @Get('my-games')
  @UseGuards(JwtRequiredGuard)
  async myGames(@CurrentUser() user: Users, @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) {
    return this.drTriggerService.getMyGames(user, page)
  }

  @Get('leaderboard')
  async leaderboard() {
    return this.drTriggerService.getLeaderboard()
  }
}
