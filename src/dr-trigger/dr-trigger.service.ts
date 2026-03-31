import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'crypto'
import { Algorithm, Cube } from 'insertionfinder'
import min2phase from 'min2phase.js'
import { Repository } from 'typeorm'

import { DRTriggerGameRounds } from '@/entities/dr-trigger-game-rounds.entity'
import { DRTriggerGames, DRTriggerGameStatus } from '@/entities/dr-trigger-games.entity'
import { DRTriggers } from '@/entities/dr-triggers.entity'
import { Users } from '@/entities/users.entity'
import { replaceQuote } from '@/utils'

const INITIAL_TIME = 600000
const OPTIMAL_BONUS = 10000
const NEAR_OPTIMAL_BONUS = 3000
const MIN_ROUND_DURATION = 1500

const DR_MOVES = ['U', "U'", 'U2', 'D', "D'", 'D2', 'R2', 'L2', 'F2', 'B2']

@Injectable()
export class DRTriggerService {
  private readonly logger = new Logger(DRTriggerService.name)

  constructor(
    @InjectRepository(DRTriggers)
    private readonly triggersRepository: Repository<DRTriggers>,
    @InjectRepository(DRTriggerGames)
    private readonly gamesRepository: Repository<DRTriggerGames>,
    @InjectRepository(DRTriggerGameRounds)
    private readonly roundsRepository: Repository<DRTriggerGameRounds>,
  ) {
    min2phase.initFull()
  }

  async startGame(user: Users, difficulty = 5) {
    const existing = await this.gamesRepository.findOne({
      where: { userId: user.id, status: DRTriggerGameStatus.ONGOING },
    })
    if (existing) {
      throw new BadRequestException('You already have an ongoing game')
    }

    const maxOptimal = difficulty > 0 ? difficulty * 100 : 0
    const trigger = await this.getRandomTrigger([], maxOptimal)
    if (!trigger) {
      throw new BadRequestException('No triggers available for this difficulty')
    }

    const scramble = this.generateScramble(trigger)

    const game = new DRTriggerGames()
    game.userId = user.id
    game.status = DRTriggerGameStatus.ONGOING
    game.remainingTime = INITIAL_TIME
    game.levels = 0
    game.difficulty = difficulty
    game.currentTriggerId = trigger.id
    game.currentRoundStartedAt = Date.now()
    const hash = createHash('sha256').update(`${user.id}-${Date.now()}-${Math.random()}`).digest('hex').substring(0, 64)
    game.sessionHash = `${hash}|${scramble}`
    await this.gamesRepository.save(game)

    return {
      game: this.formatGame(game),
      trigger: this.formatTriggerResponse(trigger, scramble),
    }
  }

  async submitSolution(user: Users, gameId: number, solution: string) {
    const game = await this.gamesRepository.findOne({
      where: { id: gameId, userId: user.id, status: DRTriggerGameStatus.ONGOING },
    })
    if (!game) {
      throw new BadRequestException('Game not found or already ended')
    }

    const now = Date.now()
    const roundDuration = now - Number(game.currentRoundStartedAt)
    if (roundDuration < MIN_ROUND_DURATION) {
      throw new BadRequestException('Too fast')
    }

    const newRemaining = Number(game.remainingTime) - roundDuration
    if (newRemaining <= 0) {
      return this.endGame(game)
    }

    const trigger = await this.triggersRepository.findOne({ where: { id: game.currentTriggerId } })
    if (!trigger) {
      throw new BadRequestException('Invalid trigger')
    }

    const currentScramble = this.recoverScrambleFromGameState(game)
    const { isDR, moves } = this.validateDRSolution(currentScramble, solution)
    if (!isDR) {
      throw new BadRequestException('Solution does not reach DR state')
    }

    let timeBonus = 0
    if (moves <= trigger.optimalMoves) {
      timeBonus = OPTIMAL_BONUS
    } else if (moves <= trigger.optimalMoves + 100) {
      timeBonus = NEAR_OPTIMAL_BONUS
    }

    const round = new DRTriggerGameRounds()
    round.gameId = game.id
    round.triggerId = trigger.id
    round.scramble = currentScramble
    round.solution = solution
    round.moves = moves
    round.optimalMoves = trigger.optimalMoves
    round.timeBonus = timeBonus
    round.duration = roundDuration
    await this.roundsRepository.save(round)

    game.levels += 1
    game.remainingTime = newRemaining + timeBonus
    game.totalTimeBonus += timeBonus

    if (Number(game.remainingTime) <= 0) {
      return this.endGame(game)
    }

    const maxOptimal = game.difficulty > 0 ? game.difficulty * 100 : 0
    const usedTriggerIds = await this.getUsedTriggerIds(game.id)
    const nextTrigger = await this.getRandomTrigger(usedTriggerIds, maxOptimal)

    if (!nextTrigger) {
      return this.endGame(game, true)
    }

    const nextScramble = this.generateScramble(nextTrigger)

    game.currentTriggerId = nextTrigger.id
    game.currentRoundStartedAt = Date.now()
    game.sessionHash = this.storeScrambleInHash(game.sessionHash, nextScramble)
    await this.gamesRepository.save(game)

    return {
      game: this.formatGame(game),
      trigger: this.formatTriggerResponse(nextTrigger, nextScramble),
      lastRound: {
        moves,
        optimalMoves: trigger.optimalMoves,
        timeBonus,
        duration: roundDuration,
      },
    }
  }

  async getOngoingGame(user: Users) {
    const game = await this.gamesRepository.findOne({
      where: { userId: user.id, status: DRTriggerGameStatus.ONGOING },
    })
    if (!game) return null

    const now = Date.now()
    const elapsed = now - Number(game.currentRoundStartedAt)
    if (Number(game.remainingTime) - elapsed <= 0) {
      return this.endGame(game)
    }

    const result: any = { game: this.formatGame(game) }
    if (game.currentTriggerId) {
      const trigger = await this.triggersRepository.findOne({ where: { id: game.currentTriggerId } })
      if (trigger) {
        const scramble = this.generateScramble(trigger)
        game.sessionHash = this.storeScrambleInHash(game.sessionHash, scramble)
        await this.gamesRepository.save(game)
        result.trigger = this.formatTriggerResponse(trigger, scramble)
      }
    }
    return result
  }

  async abandonGame(user: Users, gameId: number) {
    const game = await this.gamesRepository.findOne({
      where: { id: gameId, userId: user.id, status: DRTriggerGameStatus.ONGOING },
    })
    if (!game) {
      throw new BadRequestException('Game not found or already ended')
    }
    return this.endGame(game)
  }

  async getGame(gameId: number) {
    const game = await this.gamesRepository.findOne({
      where: { id: gameId },
      relations: ['user'],
    })
    if (!game) {
      throw new BadRequestException('Game not found')
    }

    const rounds = await this.roundsRepository.find({
      where: { gameId: game.id },
      relations: ['trigger'],
      order: { id: 'ASC' },
    })

    let lastTrigger: any = null
    if (game.status === DRTriggerGameStatus.ENDED && game.currentTriggerId) {
      const trigger = await this.triggersRepository.findOne({ where: { id: game.currentTriggerId } })
      if (trigger) {
        const scramble = this.recoverScrambleFromGameState(game)
        lastTrigger = {
          scramble,
          caseId: trigger.caseId,
          rzp: trigger.rzp,
          arm: trigger.arm,
          optimalMoves: trigger.optimalMoves,
          solutions: trigger.solutions,
        }
      }
    }

    return {
      game: this.formatGame(game),
      rounds: rounds.map(r => ({
        id: r.id,
        scramble: r.scramble,
        solution: r.solution,
        moves: r.moves,
        optimalMoves: r.optimalMoves,
        timeBonus: r.timeBonus,
        duration: Number(r.duration),
        trigger: r.trigger
          ? {
              caseId: r.trigger.caseId,
              rzp: r.trigger.rzp,
              arm: r.trigger.arm,
              solutions: r.trigger.solutions,
            }
          : null,
      })),
      lastTrigger,
    }
  }

  async getMyGames(user: Users, page = 1, limit = 20) {
    const [games, total] = await this.gamesRepository.findAndCount({
      where: { userId: user.id, status: DRTriggerGameStatus.ENDED },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    })

    return { games, total, page, limit }
  }

  async getLeaderboard() {
    const highestLevels = await this.gamesRepository.find({
      where: { status: DRTriggerGameStatus.ENDED },
      relations: ['user'],
      order: { levels: 'DESC', remainingTime: 'DESC' },
      take: 50,
    })

    return { highestLevels }
  }

  // --- Scramble generation ---

  private generateScramble(trigger: DRTriggers): string {
    const solutions = trigger.solutions.filter(s => !s.eoBreaking)

    const drPart: string[] = []
    for (let i = 0; i < 100; i++) {
      drPart.push(DR_MOVES[Math.floor(Math.random() * DR_MOVES.length)])
    }
    console.log(solutions[0].solution)
    const prefix = "R' U' F"
    const alg = new Algorithm(solutions[0].solution + drPart.join(''))
    alg.clearFlags()
    const cube = new Cube()
    cube.twist(new Algorithm(prefix + alg.toString() + prefix))
    console.log(alg.toString())
    const faceletString = cube.toFaceletString()
    let scramble = new min2phase.Search().solution(
      [
        // match the orders
        faceletString.slice(0, 9), //U
        faceletString.slice(18, 27), //R
        faceletString.slice(36, 45), //F
        faceletString.slice(9, 18), //D
        faceletString.slice(27, 36), //L
        faceletString.slice(45, 54), //B
      ].join(''),
      21,
      1e9,
      0,
      0,
      2,
      1,
    )

    // valid scramble
    if (scramble.includes('Error')) {
      const alg2 = new Algorithm('(' + alg.toString() + ')')
      alg2.clearFlags()
      scramble = alg2.toString()
    } else {
      scramble = [prefix, scramble.trim(), prefix].join(' ')
    }

    return scramble
  }

  private reverseTwists(twists: string): string {
    return twists
      .split(' ')
      .filter(t => t)
      .map(t => {
        if (t.endsWith('2')) return t
        if (t.endsWith("'")) return t.slice(0, -1)
        return t + "'"
      })
      .reverse()
      .join(' ')
  }

  // --- Validation ---

  private validateDRSolution(scramble: string, solution: string): { isDR: boolean; moves: number } {
    try {
      const cleanSolution = replaceQuote(solution)
      if (cleanSolution.includes('NISS') || cleanSolution.includes('(')) {
        return { isDR: false, moves: 0 }
      }

      const solutionAlg = new Algorithm(cleanSolution)
      const moves = solutionAlg.length * 100

      const cube = new Cube()
      cube.twist(new Algorithm(scramble))
      cube.twist(solutionAlg)
      const bestCube = cube.getBestPlacement()

      const drStatus = bestCube.getDominoReductionStatus()
      return { isDR: drStatus.includes('UD'), moves }
    } catch {
      return { isDR: false, moves: 0 }
    }
  }

  // --- Helpers ---

  private async getUsedTriggerIds(gameId: number): Promise<number[]> {
    const rounds = await this.roundsRepository.find({
      where: { gameId },
      select: ['triggerId'],
    })
    return rounds.map(r => r.triggerId)
  }

  private async getRandomTrigger(excludeIds: number[], maxOptimal = 0): Promise<DRTriggers | null> {
    const qb = this.triggersRepository.createQueryBuilder('t').orderBy('RAND()').limit(1)
    if (excludeIds.length > 0) {
      qb.where('t.id NOT IN (:...excludeIds)', { excludeIds })
    }
    if (maxOptimal > 0) {
      qb.andWhere('t.optimalMoves <= :maxOptimal', { maxOptimal })
    }
    return qb.getOne()
  }

  private async endGame(game: DRTriggerGames, allCleared = false) {
    if (game.levels === 0) {
      await this.gamesRepository.remove(game)
      return {
        game: { ...this.formatGame(game), id: 0 },
        rounds: [],
        ended: true,
        allCleared: false,
      }
    }

    const lastScramble = this.recoverScrambleFromGameState(game)

    game.status = DRTriggerGameStatus.ENDED
    if (!allCleared) {
      game.remainingTime = 0
    }
    game.currentRoundStartedAt = null
    await this.gamesRepository.save(game)

    const rounds = await this.roundsRepository.find({
      where: { gameId: game.id },
      order: { id: 'ASC' },
    })

    let lastTrigger: any = null
    if (!allCleared && game.currentTriggerId) {
      const trigger = await this.triggersRepository.findOne({ where: { id: game.currentTriggerId } })
      if (trigger) {
        lastTrigger = {
          scramble: lastScramble,
          caseId: trigger.caseId,
          rzp: trigger.rzp,
          arm: trigger.arm,
          optimalMoves: trigger.optimalMoves,
          solutions: trigger.solutions,
        }
      }
    }

    return {
      game: this.formatGame(game),
      rounds: rounds.map(r => ({
        moves: r.moves,
        optimalMoves: r.optimalMoves,
        timeBonus: r.timeBonus,
        duration: Number(r.duration),
      })),
      lastTrigger,
      ended: true,
      allCleared,
    }
  }

  private formatGame(game: DRTriggerGames) {
    const now = Date.now()
    let remainingTime = Number(game.remainingTime)
    if (game.status === DRTriggerGameStatus.ONGOING && game.currentRoundStartedAt) {
      remainingTime -= now - Number(game.currentRoundStartedAt)
    }
    return {
      id: game.id,
      status: game.status,
      levels: game.levels,
      difficulty: game.difficulty,
      remainingTime: Math.max(0, remainingTime),
      totalTimeBonus: game.totalTimeBonus,
      createdAt: game.createdAt,
      user: game.user,
    }
  }

  private formatTriggerResponse(trigger: DRTriggers, scramble: string) {
    return {
      id: trigger.id,
      scramble,
      rzp: trigger.rzp,
      arm: trigger.arm,
    }
  }

  /**
   * We store the current scramble in sessionHash so the server can validate
   * the submit against the correct scramble. Format: hash|scramble
   */
  private storeScrambleInHash(oldHash: string, scramble: string): string {
    const hash = oldHash.split('|')[0]
    return `${hash}|${scramble}`
  }

  private recoverScrambleFromGameState(game: DRTriggerGames): string {
    const parts = game.sessionHash.split('|')
    if (parts.length > 1) {
      return parts.slice(1).join('|')
    }
    return ''
  }
}
