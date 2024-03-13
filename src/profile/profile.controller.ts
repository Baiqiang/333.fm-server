import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common'
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
  async userProfile(@Param('id') id: string) {
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
    @Param('id') id: string,
    @CurrentUser() currentUser: Users,
    @Query() paginationOption: PaginationDto,
    @Query('type') type: number,
  ) {
    const user = await this.userService.findOne(id)
    if (!user) {
      throw new NotFoundException()
    }
    return this.profileService.getUserSubmissions(user, type, paginationOption, currentUser)
  }
}
