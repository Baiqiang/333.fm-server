import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common'
import { ApiQuery } from '@nestjs/swagger'

import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '@/auth/guards/jwt.guard'
import { PaginationDto } from '@/dtos/pagination.dto'
import { Users } from '@/entities/users.entity'
import { UserService } from '@/user/user.service'

import { ProfileService } from './profile.service'

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
  ) {}

  @Get(':id')
  async userProfile(@Param('id', ParseIntPipe) id: number) {
    const user = await this.userService.findOne(id)
    if (!user) {
      throw new NotFoundException()
    }
    return user
  }

  @Get(':id/submissions')
  @UseGuards(JwtAuthGuard)
  @ApiQuery({ type: PaginationDto })
  async submissions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() currentUser: Users,
    @Query() paginationOption: PaginationDto,
  ) {
    const user = await this.userService.findOne(id)
    if (!user) {
      throw new NotFoundException()
    }
    return this.profileService.getUserSubmissions(user, paginationOption, currentUser)
  }
}
