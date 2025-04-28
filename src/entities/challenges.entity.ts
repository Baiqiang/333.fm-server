import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

import { Competitions } from './competitions.entity'

export enum ChallengeType {
  REGULAR,
  BOSS,
}

export interface RegularChallenge {
  single: number
  team: [number, number]
}

export interface BossChallenge {
  instantKill: number
  minHitPoints: number
  maxHitPoints: number
}

@Entity()
export class Challenges {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  competitionId: number

  @Column()
  type: ChallengeType

  @Column({ nullable: true })
  startLevel?: number

  @Column({ nullable: true })
  endLevel?: number

  @Column({ nullable: true, type: 'json' })
  levels?: number[]

  @Column({ type: 'json' })
  challenge: RegularChallenge | BossChallenge

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => Competitions, competition => competition.challenges, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  competition: Competitions

  get isBoss(): boolean {
    return this.type === ChallengeType.BOSS
  }

  get isRegular(): boolean {
    return this.type === ChallengeType.REGULAR
  }
}

export const defaultChallenge = new Challenges()
defaultChallenge.type = ChallengeType.REGULAR
defaultChallenge.challenge = { single: 8000, team: [8000, 1] }

export function getDamage(moves: number) {
  if (moves > 30) {
    return 0
  }
  const n = 30 - moves
  return 5 * ((n * (n + 1)) / 2)
}
