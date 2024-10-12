import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bull'
import { LessThanOrEqual, Repository } from 'typeorm'

import { Competitions, CompetitionSubType } from '@/entities/competitions.entity'
import { EndlessKickoffs } from '@/entities/endless-kickoffs.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { generateScramble, ScrambleType } from '@/utils/scramble'

import { Challenge, EndlessJob } from '../endless.service'

@Processor('endless')
export class EndlessProcessor {
  private readonly logger = new Logger(EndlessProcessor.name)
  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(EndlessKickoffs)
    private readonly kickoffsRepository: Repository<EndlessKickoffs>,
    private readonly configService: ConfigService,
  ) {}

  @Process()
  async process(job: Job<EndlessJob>) {
    const { competitionId, userId, scrambleId, scrambleNumber, submissionId, moves } = job.data
    let challenge: Challenge = {
      single: 8000,
      team: [8000, 1],
    }
    let scrambleType: ScrambleType = ScrambleType.NORMAL
    const competition = await this.competitionsRepository.findOneBy({ id: competitionId })
    if (competition.hasEnded) {
      return
    }
    switch (competition.subType) {
      case CompetitionSubType.BOSS_CHALLENGE:
        challenge = this.getBossChallenge(scrambleNumber)
        break
      case CompetitionSubType.EO_PRACTICE:
        scrambleType = ScrambleType.EO
        break
      case CompetitionSubType.DR_PRACTICE:
        scrambleType = ScrambleType.DR
        break
      case CompetitionSubType.HTR_PRACTICE:
        scrambleType = ScrambleType.HTR
        break
      case CompetitionSubType.JZP_PRACTICE:
        scrambleType = ScrambleType.JZP
        break
      case CompetitionSubType.REGULAR:
        challenge = this.configService.get<Challenge>('endless.kickoffMoves')
      default:
        break
    }
    const { single, team } = challenge
    // if the result is greater than 30, nothing to do
    if (moves > team[0]) {
      return
    }
    const next = await this.scramblesRepository.findOne({
      where: {
        competitionId,
        number: scrambleNumber + 1,
      },
    })
    // if next scramble exists, nothing to do
    if (next !== null) {
      return
    }
    let generateNext = false
    let singleKickedOff = false
    let goodSubmissions: Submissions[] = []
    if (moves <= single) {
      generateNext = true
      singleKickedOff = true
    } else {
      goodSubmissions = await this.submissionsRepository.find({
        where: {
          scrambleId,
          moves: LessThanOrEqual(team[0]),
        },
      })
      if (goodSubmissions.length >= team[1]) {
        generateNext = true
      }
    }
    if (!generateNext) {
      return
    }
    const scramble = new Scrambles()
    scramble.competitionId = competitionId
    scramble.number = scrambleNumber + 1
    scramble.scramble = generateScramble(scrambleType)
    await this.scramblesRepository.save(scramble)
    this.logger.log(`Generated scramble ${scramble.id} kicked off ${singleKickedOff} user ${userId}`)
    // set kickoff
    const kickoffs: EndlessKickoffs[] = []
    if (singleKickedOff) {
      const kickoff = new EndlessKickoffs()
      kickoff.competitionId = competitionId
      kickoff.userId = userId
      kickoff.scrambleId = scrambleId
      kickoff.submissionId = submissionId
      kickoffs.push(kickoff)
    } else {
      for (const submission of goodSubmissions) {
        const kickoff = new EndlessKickoffs()
        kickoff.competitionId = competitionId
        kickoff.userId = submission.userId
        kickoff.scrambleId = scrambleId
        kickoff.submissionId = submission.id
        kickoffs.push(kickoff)
      }
    }
    await this.kickoffsRepository.save(kickoffs)
  }

  getBossChallenge(level: number): Challenge {
    const bossChallenges = this.configService.get<Challenge[]>('endless.bossChallenges')
    let bossChallenge = bossChallenges.find(c => c.levels?.includes(level))
    if (bossChallenge === undefined) {
      bossChallenge = bossChallenges.find(c => c.startLevel <= level && c.endLevel >= level)
    }
    return bossChallenge ?? bossChallenges[bossChallenges.length - (level % 10 === 0 ? 1 : 2)]
  }
}
