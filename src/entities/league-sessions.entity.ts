import { Expose } from 'class-transformer'
import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

import { Competitions } from './competitions.entity'
import { LeaguePlayers } from './league-players.entity'
import { LeagueStandings } from './league-standings.entity'
import { LeagueTiers } from './league-tiers.entity'

export enum LeagueSessionStatus {
  NOT_STARTED,
  ON_GOING,
  ENDED,
}

@Entity()
export class LeagueSessions {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  @Index({ unique: true })
  number: number // e.g. 6

  @Column()
  startTime: Date

  @Column()
  endTime: Date

  @Column()
  status: LeagueSessionStatus

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @OneToMany(() => LeagueTiers, (tier: LeagueTiers) => tier.session)
  tiers: LeagueTiers[]

  @OneToMany(() => Competitions, competition => competition.leagueSession, {
    onDelete: 'CASCADE',
  })
  competitions: Competitions[]

  @OneToMany(() => LeagueStandings, standings => standings.session)
  standings: LeagueStandings[]

  @OneToMany(() => LeaguePlayers, player => player.session)
  players: LeaguePlayers[]

  @Expose()
  get title() {
    return `FMC League S${this.number}`
  }
}
