import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { Pagination } from 'nestjs-typeorm-paginate'

import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { JwtRequiredGuard } from '@/auth/guards/jwt-required.guard'
import { PaginationDto } from '@/dtos/pagination.dto'
import { UserInsertionFinders } from '@/entities/user-insertion-finders.entity'
import { Users } from '@/entities/users.entity'

import { UserService } from './user.service'

@Controller('user')
@UseGuards(JwtRequiredGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('ifs')
  @ApiQuery({ type: PaginationDto })
  public async getIFs(
    @CurrentUser() user: Users,
    @Query() { limit, page }: PaginationDto,
  ): Promise<Pagination<UserInsertionFinders['summary']>> {
    const ret = await this.userService.getUserIFs(user, { limit, page })
    return new Pagination(
      ret.items.map(item => item.summary),
      ret.meta,
      ret.links,
    )
  }

  @Post('if/:hash')
  public async updateIF(@CurrentUser() user: Users, @Param('hash') hash: string, @Body('name') name: string) {
    const userIF = await this.userService.getUserIFByHash(user, hash)
    if (!userIF) {
      throw new NotFoundException()
    }
    userIF.name = name
    await this.userService.saveUserIF(userIF)
    return userIF.summary
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('if/:hash')
  public async deleteIF(@CurrentUser() user: Users, @Param('hash') hash: string) {
    const userIF = await this.userService.getUserIFByHash(user, hash)
    if (!userIF) {
      throw new NotFoundException()
    }
    await this.userService.deleteUserIF(userIF)
  }
}
