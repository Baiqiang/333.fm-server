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
import { LeagueSessions } from './league-sessions.entity'
import { LeagueTiers } from './league-tiers.entity'
import { Results } from './results.entity'
import { Users } from './users.entity'

@Entity()
export class LeagueDuels {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  sessionId: number

  @Column()
  competitionId: number

  @Column()
  tierId: number

  @Column()
  user1Id: number

  // for odd number of players, the last player will be the bye player
  @Column()
  user2Id: number

  @Column({ default: 0 })
  user1Points: number

  @Column({ default: 0 })
  user2Points: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => LeagueSessions, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  session: LeagueSessions

  @ManyToOne(() => Competitions, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'competition_id',
  })
  competition: Competitions

  @ManyToOne(() => LeagueTiers, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  tier: LeagueTiers

  @ManyToOne(() => Users, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  user1: Users

  @ManyToOne(() => Users, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  user2: Users

  user1Result?: Results
  user2Result?: Results

  @Expose()
  get ended() {
    return this.user1Points + this.user2Points > 0
  }

  getOpponent(user: Users) {
    return this.user1Id === user.id ? this.user2 : this.user1
  }

  getUserResult(user: Users) {
    return this.user1Id === user.id ? this.user1Result : this.user2Result
  }
}
