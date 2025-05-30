import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

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
}
