import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@/auth/guards/jwt.guard'
import { CreateIFDto } from '@/dtos/create-if.dto'
import { IFType } from '@/entities/insertion-finders.entity'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'

import { IfService } from './if.service'

@Controller('if')
export class IfController {
  constructor(
    private readonly ifService: IfService,
    private readonly userService: UserService,
  ) {}

  @Get('latest')
  public async getLatest() {
    const latest = await this.ifService.getLatest()
    return latest.map(insertionFinder => insertionFinder.json)
  }

  @Get(':hash')
  public async getIFByHash(@Param('hash') hash: string) {
    const insertionFinder = await this.ifService.getIFByHash(hash)
    if (!insertionFinder) {
      throw new NotFoundException()
    }
    return insertionFinder.json
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  public async createIF(@CurrentUser() user: Users, @Body() createIFDto: CreateIFDto) {
    if (!user && createIFDto.type === IFType.INSERTION_FINDER) {
      createIFDto.greedy = 2
    }
    const insertionFinder = await this.ifService.createIF(createIFDto)
    if (user) {
      await this.userService.createUserIF(user, insertionFinder, createIFDto.name)
    }
    return insertionFinder
  }
}
