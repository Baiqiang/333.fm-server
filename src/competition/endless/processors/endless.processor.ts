import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bull'
import { LessThanOrEqual, Repository } from 'typeorm'

import { BossChallenge, Challenges, defaultChallenge, getDamage, RegularChallenge } from '@/entities/challenges.entity'
import { Competitions, CompetitionSubType } from '@/entities/competitions.entity'
import { EndlessKickoffs } from '@/entities/endless-kickoffs.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { generateScramble, ScrambleType } from '@/utils/scramble'

import { EndlessJob } from '../endless.service'

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
    const competition = await this.competitionsRepository.findOne({
      where: {
        id: competitionId,
      },
      relations: {
        challenges: true,
      },
    })
    if (competition.hasEnded) {
      return
    }
    let scrambleType: ScrambleType = ScrambleType.NORMAL
    switch (competition.subType) {
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
    const challenge = this.getChallenge(moves, competition.challenges)
    let generateNext = false
    let singleKickedOff = false
    let goodSubmissions: Submissions[] = []
    if (challenge.isRegular) {
      const { single, team } = challenge.challenge as RegularChallenge
      // if the result is greater than team required, do nothing
      if (moves > team[0]) {
        return
      }
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
    } else if (challenge.isBoss) {
      const { instantKill } = challenge.challenge as BossChallenge
      if (moves <= instantKill) {
        generateNext = true
        singleKickedOff = true
      } else {
        const damage = getDamage(moves)
        if (damage > 0) {
          const scramble = await this.scramblesRepository.findOneBy({
            id: scrambleId,
          })
          const submission = await this.submissionsRepository.findOneBy({
            id: submissionId,
          })
          this.logger.log(
            `Level ${scramble.number} has ${scramble.currentHP} HP, submission ${submission.id} (${moves}) makes ${submission.damage} damage`,
          )
          scramble.currentHP -= damage
          if (scramble.currentHP <= 0) {
            scramble.currentHP = 0
          }
          submission.damage = damage
          await this.scramblesRepository.save(scramble)
          await this.submissionsRepository.save(submission)
          if (scramble.currentHP <= 0) {
            generateNext = true
            goodSubmissions = await this.submissionsRepository.find({
              where: {
                scrambleId,
              },
            })
          }
        }
      }
    }
    if (!generateNext) {
      return
    }
    const nextChallenge = this.getChallenge(scrambleNumber + 1, competition.challenges)
    if (!nextChallenge) {
      return
    }
    const scramble = new Scrambles()
    scramble.competitionId = competitionId
    scramble.number = scrambleNumber + 1
    scramble.scramble = generateScramble(scrambleType)
    if (challenge.isBoss) {
      const { minHitPoints, maxHitPoints } = nextChallenge.challenge as BossChallenge
      const hitPoints = Math.floor(Math.random() * (maxHitPoints - minHitPoints + 1)) + minHitPoints
      scramble.currentHP = hitPoints
    }
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

  getChallenge(level: number, challenges: Challenges[]): Challenges | undefined {
    if (challenges.length === 0) {
      return defaultChallenge
    }
    let challenge = challenges.find(c => c.levels?.includes(level))
    if (challenge === undefined) {
      challenge = challenges.find(c => c.startLevel <= level && c.endLevel >= level)
    }
    return challenge
  }
}
