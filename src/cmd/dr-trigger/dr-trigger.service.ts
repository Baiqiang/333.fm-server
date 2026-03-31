import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { Repository } from 'typeorm'

import { DRTriggers, DRTriggerSolution } from '@/entities/dr-triggers.entity'

const CSV_DIR = join(__dirname, '..', '..', '..', '..', 'drm_doc_dev', 'public')
const BATCH_SIZE = 500

@Injectable()
export class DRTriggerCommandService {
  private readonly logger = new Logger(DRTriggerCommandService.name)

  constructor(
    @InjectRepository(DRTriggers)
    private readonly triggersRepository: Repository<DRTriggers>,
  ) {}

  async seed() {
    const files = readdirSync(CSV_DIR).filter(f => f.endsWith('_db_input.csv'))
    this.logger.log(`Found ${files.length} CSV files in ${CSV_DIR}`)

    let totalCases = 0
    let totalSolutions = 0

    for (const file of files) {
      const rzp = file.replace('_db_input.csv', '')
      const existing = await this.triggersRepository.count({ where: { rzp } })
      if (existing > 0) {
        this.logger.log(`Skipping ${file}: already has ${existing} cases`)
        totalCases += existing
        continue
      }

      const content = readFileSync(join(CSV_DIR, file), 'utf-8')
      const { cases, solutionCount } = this.parseCsv(content, rzp)

      if (cases.length === 0) {
        this.logger.warn(`No cases found in ${file}`)
        continue
      }

      for (let i = 0; i < cases.length; i += BATCH_SIZE) {
        const batch = cases.slice(i, i + BATCH_SIZE)
        await this.triggersRepository.save(batch)
      }

      totalCases += cases.length
      totalSolutions += solutionCount
      this.logger.log(`${file}: imported ${cases.length} cases, ${solutionCount} solutions`)
    }

    this.logger.log(`Done. Total: ${totalCases} cases, ${totalSolutions} solutions`)
  }

  async reset() {
    const count = await this.triggersRepository.count()
    if (count === 0) {
      this.logger.log('No triggers to delete')
      return
    }
    await this.triggersRepository.clear()
    this.logger.log(`Deleted ${count} triggers`)
  }

  private parseCsv(content: string, rzp: string): { cases: DRTriggers[]; solutionCount: number } {
    const lines = content.split('\n')
    const caseMap = new Map<number, DRTriggers>()
    const solutionsMap = new Map<number, DRTriggerSolution[]>()
    let solutionCount = 0

    for (const line of lines) {
      if (!line.trim()) continue
      const parts = line.split(',')

      if (parts[0] === 'case') {
        const caseId = parseInt(parts[1])
        const trigger = new DRTriggers()
        trigger.caseId = caseId
        trigger.rzp = rzp
        trigger.arm = parts[3] || ''
        trigger.pairs = parseInt(parts[4]) || 0
        trigger.tetrad = parts[5] || null
        trigger.corners = parts[6]?.trim() || null
        trigger.optimalMoves = 0
        trigger.solutions = []
        caseMap.set(caseId, trigger)
        solutionsMap.set(caseId, [])
      } else if (parts[0] === 'solution') {
        const caseId = parseInt(parts[1])
        const sol: DRTriggerSolution = {
          length: parseInt(parts[2]) || 0,
          eoBreaking: parts[3] === '1',
          trigger: parseInt(parts[4]) || 0,
          solution: parts[5]?.trim() || '',
        }
        if (!sol.solution) continue
        solutionsMap.get(caseId)?.push(sol)
        solutionCount++
      }
    }

    const cases: DRTriggers[] = []
    for (const [caseId, trigger] of caseMap) {
      const solutions = solutionsMap.get(caseId) || []
      if (solutions.length === 0) continue
      trigger.solutions = solutions
      trigger.optimalMoves = Math.min(...solutions.map(s => s.length)) * 100
      cases.push(trigger)
    }

    return { cases, solutionCount }
  }
}
