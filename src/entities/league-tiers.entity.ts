import { Expose } from 'class-transformer'
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
import { LeaguePlayers } from './league-players.entity'
import { LeagueSessions } from './league-sessions.entity'
import { LeagueStandings } from './league-standings.entity'

@Entity()
export class LeagueTiers {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  level: number

  @Column()
  sessionId: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => LeagueSessions, session => session.tiers, {
    onDelete: 'CASCADE',
  })
  session: LeagueSessions

  @OneToMany(() => LeaguePlayers, player => player.tier)
  players: LeaguePlayers[]

  @OneToMany(() => LeagueDuels, duel => duel.tier)
  duels: LeagueDuels[]

  @OneToMany(() => LeagueStandings, standings => standings.tier)
  standings: LeagueStandings[]

  @Expose()
  get name() {
    return `Tier ${this.level}`
  }
}
