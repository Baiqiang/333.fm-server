import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'

import { Competitions } from './competitions.entity'
import { LeagueSessions } from './league-sessions.entity'
import { Users } from './users.entity'

@Entity()
export class LeagueElos {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  sessionId: number

  @Column()
  competitionId: number

  @Column()
  week: number

  @Column()
  userId: number

  @Column({ default: 0 })
  points: number

  @ManyToOne(() => LeagueSessions, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: LeagueSessions

  @ManyToOne(() => Competitions, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  competition: Competitions

  @ManyToOne(() => Users, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: Users
}
