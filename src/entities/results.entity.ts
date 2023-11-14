import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

import { CompetitionMode, Competitions } from './competitions.entity'
import { Submissions } from './submissions.entity'
import { Users } from './users.entity'

export const DNF = 99999998
export const DNS = 99999999

@Entity()
@Index(['competitionId', 'best'])
@Index(['competitionId', 'average', 'best'])
export class Results {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  mode: CompetitionMode

  @Column({ default: 0 })
  rank: number

  @Column('json')
  values: number[]

  @Column()
  best: number

  @Column()
  average: number

  @Column()
  competitionId: number

  @Column()
  userId: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => Competitions, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  competition: Competitions

  @ManyToOne(() => Users, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  user: Users

  @OneToMany(() => Submissions, submission => submission.result)
  submissions: Submissions[]
}
