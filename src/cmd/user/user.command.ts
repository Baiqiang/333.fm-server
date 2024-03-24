import { Logger } from '@nestjs/common'
import { Command, CommandRunner } from 'nest-commander'

import { UserService } from './user.service'

@Command({ name: 'user', description: 'User management' })
export class UserCommand extends CommandRunner {
  private readonly logger: Logger = new Logger(UserCommand.name)
  constructor(private readonly userService: UserService) {
    super()
  }

  async run(passedParam: string[]): Promise<void> {
    switch (passedParam[0]) {
      case 'merge':
        await this.userService.merge()
        break
      default:
        break
    }
  }
}
