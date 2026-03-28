import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import {
  BossChallenge,
  Challenges,
  ChallengeType,
  getDamage,
  getRandomBossHitPoints,
  matchesChallengeLevel,
} from '@/entities/challenges.entity'
import {
  CompetitionFormat,
  Competitions,
  CompetitionStatus,
  CompetitionSubType,
  CompetitionType,
} from '@/entities/competitions.entity'
import { DNF } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { generateScramble } from '@/utils/scramble'

interface EndlessChallengeRuleInput {
  type: ChallengeType
  startLevel?: number
  endLevel?: number
  levels?: number[]
  challenge: BossChallenge
}

const DEFAULT_USER_ID = 1

function buildBossChallengeRules(): EndlessChallengeRuleInput[] {
  const rules: EndlessChallengeRuleInput[] = []
  const regularInstantKills = [2400, 2300, 2300, 2300, 2200, 2200, 2200, 2100, 2100, 2100]
  const majorInstantKills = [2200, 2200, 2200, 2100, 2100, 2100, 2000, 2000, 1900, 1900]
  const regularHitPointRanges: Array<[number, number]> = [
    [70, 110],
    [90, 130],
    [110, 160],
    [130, 190],
    [150, 210],
    [170, 230],
    [190, 250],
    [210, 280],
    [230, 310],
    [250, 340],
  ]
  const majorHitPointRanges: Array<[number, number]> = [
    [180, 260],
    [220, 320],
    [260, 380],
    [320, 450],
    [380, 540],
    [450, 630],
    [540, 760],
    [650, 900],
    [780, 1080],
    [900, 1250],
  ]
  for (let tier = 0; tier < 10; tier++) {
    const startLevel = tier * 10 + 1
    const bossLevel = startLevel + 9
    const [regularMinHitPoints, regularMaxHitPoints] = regularHitPointRanges[tier]
    const [majorMinHitPoints, majorMaxHitPoints] = majorHitPointRanges[tier]
    rules.push({
      type: ChallengeType.BOSS,
      startLevel,
      endLevel: bossLevel - 1,
      challenge: {
        instantKill: regularInstantKills[tier],
        minHitPoints: regularMinHitPoints,
        maxHitPoints: regularMaxHitPoints,
      },
    })
    rules.push({
      type: ChallengeType.BOSS,
      levels: [bossLevel],
      challenge: {
        instantKill: majorInstantKills[tier],
        minHitPoints: majorMinHitPoints,
        maxHitPoints: majorMaxHitPoints,
      },
    })
  }
  return rules
}

const HP_BOSS_CHALLENGE_RULES = buildBossChallengeRules()

@Injectable()
export class EndlessCommandService {
  private readonly logger = new Logger(EndlessCommandService.name)

  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Challenges)
    private readonly challengesRepository: Repository<Challenges>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
  ) {}

  async openBoss(alias: string, startTimeRaw?: string, endTimeRaw?: string) {
    if (!alias) {
      throw new BadRequestException('Alias is required')
    }
    const existing = await this.competitionsRepository.findOne({
      where: {
        alias,
      },
    })
    if (existing) {
      throw new BadRequestException(`Competition alias already exists: ${alias}`)
    }
    const startTime = this.parseDate(startTimeRaw) ?? new Date()
    const endTime = this.parseDate(endTimeRaw)
    if (endTime && endTime <= startTime) {
      throw new BadRequestException('endTime must be later than startTime')
    }
    const competition = new Competitions()
    competition.alias = alias
    competition.name = `Boss ${alias}`
    competition.type = CompetitionType.ENDLESS
    competition.subType = CompetitionSubType.BOSS_CHALLENGE
    competition.format = CompetitionFormat.BO1
    competition.userId = DEFAULT_USER_ID
    competition.startTime = startTime
    competition.endTime = endTime
    competition.status = startTime <= new Date() ? CompetitionStatus.ON_GOING : CompetitionStatus.NOT_STARTED
    await this.competitionsRepository.save(competition)

    const challenges = HP_BOSS_CHALLENGE_RULES.map(rule => {
      const challenge = new Challenges()
      challenge.competitionId = competition.id
      challenge.type = rule.type
      challenge.startLevel = rule.startLevel
      challenge.endLevel = rule.endLevel
      challenge.levels = rule.levels
      challenge.challenge = rule.challenge
      return challenge
    })
    await this.challengesRepository.save(challenges)

    if (competition.status === CompetitionStatus.ON_GOING) {
      const scramble = new Scrambles()
      scramble.competitionId = competition.id
      scramble.number = 1
      scramble.scramble = generateScramble()
      scramble.initialHP = getRandomBossHitPoints(HP_BOSS_CHALLENGE_RULES[0].challenge)
      scramble.currentHP = scramble.initialHP
      await this.scramblesRepository.save(scramble)
    }

    this.logger.log(`Created boss endless ${competition.alias} (#${competition.id})`)
    return competition
  }

  async end(alias: string) {
    if (!alias) {
      throw new BadRequestException('Alias is required')
    }
    const competition = await this.competitionsRepository.findOne({
      where: {
        alias,
        type: CompetitionType.ENDLESS,
      },
    })
    if (!competition) {
      throw new NotFoundException(`Endless not found: ${alias}`)
    }
    competition.endTime = new Date()
    competition.status = CompetitionStatus.ENDED
    await this.competitionsRepository.save(competition)
    this.logger.log(`Ended endless ${competition.alias} (#${competition.id})`)
    return competition
  }

  async simulateOldBoss(alias: string, runs = 1000) {
    if (!alias) {
      throw new BadRequestException('Alias is required')
    }
    if (!Number.isInteger(runs) || runs <= 0) {
      throw new BadRequestException('runs must be a positive integer')
    }
    const competition = await this.competitionsRepository.findOne({
      where: {
        alias,
        type: CompetitionType.ENDLESS,
        subType: CompetitionSubType.BOSS_CHALLENGE,
      },
    })
    if (!competition) {
      throw new NotFoundException(`Boss endless not found: ${alias}`)
    }
    const submissions = await this.submissionsRepository.find({
      where: {
        competitionId: competition.id,
      },
      relations: {
        scramble: true,
        user: true,
      },
      order: {
        scramble: {
          number: 'ASC',
        },
        createdAt: 'ASC',
      },
    })
    const submissionsByLevel: Record<number, Submissions[]> = {}
    for (const submission of submissions) {
      if (!submission.scramble || submission.moves === DNF || submission.moves <= 0) {
        continue
      }
      const level = submission.scramble.number
      submissionsByLevel[level] ??= []
      submissionsByLevel[level].push(submission)
    }
    const levelsReached = Array.from({ length: runs }, () => this.simulateOnce(submissionsByLevel))
    levelsReached.sort((a, b) => a - b)
    const total = levelsReached.reduce((sum, level) => sum + level, 0)
    const min = levelsReached[0]
    const max = levelsReached[levelsReached.length - 1]
    const average = Number((total / levelsReached.length).toFixed(2))
    const median = levelsReached[Math.floor(levelsReached.length / 2)]
    const p10 = levelsReached[Math.floor(levelsReached.length * 0.1)]
    const p90 = levelsReached[Math.floor(levelsReached.length * 0.9)]
    const deterministicByMaxHp = this.simulateOnce(submissionsByLevel, 'max')
    const deterministicByMinHp = this.simulateOnce(submissionsByLevel, 'min')
    this.logger.log(`Simulation target: ${competition.alias} (#${competition.id})`)
    this.logger.log(`Runs: ${runs}`)
    this.logger.log(`Levels reached with min HP: ${deterministicByMinHp}`)
    this.logger.log(`Levels reached with max HP: ${deterministicByMaxHp}`)
    this.logger.log(`Monte Carlo min/median/avg/max: ${min}/${median}/${average}/${max}`)
    this.logger.log(`Monte Carlo p10/p90: ${p10}/${p90}`)
  }

  private parseDate(value?: string) {
    if (!value) {
      return null
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`)
    }
    return date
  }

  private getBossChallenge(level: number) {
    return HP_BOSS_CHALLENGE_RULES.find(rule => matchesChallengeLevel(rule, level))
  }

  private simulateOnce(submissionsByLevel: Record<number, Submissions[]>, hpMode: 'random' | 'min' | 'max' = 'random') {
    let highestUnlockedLevel = 0
    for (let level = 1; ; level++) {
      const challenge = this.getBossChallenge(level)
      if (!challenge) {
        return highestUnlockedLevel
      }
      const submissions = submissionsByLevel[level] ?? []
      if (submissions.length === 0) {
        return highestUnlockedLevel
      }
      const bossChallenge = challenge.challenge
      const isInstantKilled = submissions.some(
        submission => submission.moves - (Math.random() < 0.5 ? 100 : 0) <= bossChallenge.instantKill,
      )
      if (isInstantKilled) {
        highestUnlockedLevel = level
        continue
      }
      const hp =
        hpMode === 'min'
          ? bossChallenge.minHitPoints
          : hpMode === 'max'
            ? bossChallenge.maxHitPoints
            : getRandomBossHitPoints(bossChallenge)
      const totalDamage = submissions.reduce(
        (sum, submission) => sum + getDamage(submission.moves - (Math.random() < 0.5 ? 100 : 0)),
        0,
      )
      if (totalDamage < hp) {
        return highestUnlockedLevel
      }
      highestUnlockedLevel = level
    }
  }
}
