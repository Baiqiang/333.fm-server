import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

import { LeagueDuels } from './league-duels.entity'
import { LeagueSessions } from './league-sessions.entity'
import { LeagueTiers } from './league-tiers.entity'
import { Users } from './users.entity'

@Entity('league_players')
export class LeaguePlayers {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  sessionId: number

  @Column()
  tierId: number

  @Column({ nullable: true })
  userId: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => LeagueSessions, session => session.players, {
    onDelete: 'CASCADE',
  })
  session: LeagueSessions

  @ManyToOne(() => LeagueTiers, tier => tier.players, {
    onDelete: 'CASCADE',
  })
  tier: LeagueTiers

  @ManyToOne(() => Users, {
    onDelete: 'CASCADE',
  })
  user: Users

  @OneToMany(() => LeagueDuels, duel => duel.player1)
  duelsAsPlayer1: LeagueDuels[]

  @OneToMany(() => LeagueDuels, duel => duel.player2)
  duelsAsPlayer2: LeagueDuels[]
}
