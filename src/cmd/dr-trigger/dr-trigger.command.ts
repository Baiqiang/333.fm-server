import { Logger } from '@nestjs/common'
import { Command, CommandRunner } from 'nest-commander'

import { DRTriggerCommandService } from './dr-trigger.service'

@Command({ name: 'dr-trigger', description: 'DR Trigger management' })
export class DRTriggerCommand extends CommandRunner {
  private readonly logger = new Logger(DRTriggerCommand.name)

  constructor(private readonly service: DRTriggerCommandService) {
    super()
  }

  async run(passedParam: string[]): Promise<void> {
    switch (passedParam[0]) {
      case 'seed':
        await this.service.seed()
        break
      case 'reset':
        await this.service.reset()
        break
      case 'fix-eo':
        await this.service.fixEoBreaking()
        break
      default:
        this.logger.warn('Usage: npm run cmd -- dr-trigger seed|reset|fix-eo')
        break
    }
  }
}
