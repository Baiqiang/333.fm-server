import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { Competitions, CompetitionType } from '@/entities/competitions.entity'

const WCA_API_BASE = 'https://www.worldcubeassociation.org/api/v0'

@Injectable()
export class WcaService {
  private readonly logger: Logger = new Logger(WcaService.name)

  constructor(@InjectRepository(Competitions) private readonly competitionsRepository: Repository<Competitions>) {}

  async fixCompetitionDates() {
    const competitions = await this.competitionsRepository.find({
      where: { type: CompetitionType.WCA_RECONSTRUCTION },
    })

    this.logger.log(`Found ${competitions.length} WCA reconstruction competitions`)

    for (const comp of competitions) {
      const wcaId = comp.wcaCompetitionId
      if (!wcaId) continue

      try {
        const resp = await fetch(`${WCA_API_BASE}/competitions/${wcaId}`)
        if (!resp.ok) {
          this.logger.warn(`Failed to fetch ${wcaId}: ${resp.status}`)
          continue
        }
        const data = (await resp.json()) as { name: string; start_date: string; end_date: string }

        let dirty = false
        if (data.name && comp.name !== data.name) {
          comp.name = data.name
          dirty = true
        }
        if (data.start_date) {
          const startTime = new Date(data.start_date)
          if (comp.startTime.getTime() !== startTime.getTime()) {
            comp.startTime = startTime
            dirty = true
          }
        }
        if (data.end_date) {
          const endTime = new Date(`${data.end_date}T23:59:59`)
          if (!comp.endTime || comp.endTime.getTime() !== endTime.getTime()) {
            comp.endTime = endTime
            dirty = true
          }
        }

        if (dirty) {
          await this.competitionsRepository.save(comp)
          this.logger.log(`Updated ${wcaId}: ${data.name} (${data.start_date} ~ ${data.end_date})`)
        } else {
          this.logger.log(`Skipped ${wcaId}: already up to date`)
        }
      } catch (e) {
        this.logger.error(`Error processing ${wcaId}: ${e}`)
      }
    }

    this.logger.log('Done')
  }
}
