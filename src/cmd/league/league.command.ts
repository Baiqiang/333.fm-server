import { Logger } from '@nestjs/common'
import { Command, CommandRunner } from 'nest-commander'

import { LeagueService } from './league.service'

@Command({ name: 'league', description: 'League calculation' })
export class LeagueCommand extends CommandRunner {
  private readonly logger: Logger = new Logger(LeagueCommand.name)
  constructor(private readonly leagueService: LeagueService) {
    super()
  }

  async run(passedParam: string[]): Promise<void> {
    console.log(passedParam)
    switch (passedParam[0]) {
      case 'import':
        this.logger.log('Importing past leagues')
        await this.leagueService.import(passedParam[1], parseInt(passedParam[2]), passedParam[3])
        break
      case 'elo':
        this.logger.log('Calculating league elos')
        await this.leagueService.updateElo(passedParam[1], passedParam[2])
        break
      default:
        break
    }
  }
}
