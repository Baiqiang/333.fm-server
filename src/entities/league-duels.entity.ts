import { Expose } from 'class-transformer'
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

import { Competitions } from './competitions.entity'
import { LeaguePlayers } from './league-players.entity'
import { LeagueTiers } from './league-tiers.entity'
import { Results } from './results.entity'

@Entity()
export class LeagueDuels {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  competitionId: number

  @Column()
  tierId: number

  @Column({ nullable: true })
  player1Id: number

  // for odd number of players, the last player will be the bye player
  @Column({ nullable: true })
  player2Id: number

  @Column({ default: 0 })
  player1Points: number

  @Column({ default: 0 })
  player2Points: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => Competitions, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({})
  competition: Competitions

  @ManyToOne(() => LeagueTiers, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  tier: LeagueTiers

  @ManyToOne(() => LeaguePlayers, {
    onDelete: 'SET NULL',
  })
  player1?: LeaguePlayers

  @ManyToOne(() => LeaguePlayers, {
    onDelete: 'SET NULL',
  })
  player2?: LeaguePlayers

  player1Result?: Results
  player2Result?: Results

  @Expose()
  get ended() {
    return this.player1Points + this.player2Points > 0
  }

  getOpponent(player: LeaguePlayers) {
    return this.player1Id === player.id ? this.player2 : this.player1
  }
}
