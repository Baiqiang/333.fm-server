import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

import { LeagueSessions } from './league-sessions.entity'
import { Users } from './users.entity'

@Entity()
export class LeagueParticipants {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  sessionId: number

  @Column()
  userId: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => LeagueSessions, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  session: LeagueSessions

  @ManyToOne(() => Users, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  user: Users
}
