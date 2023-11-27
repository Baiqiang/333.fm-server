import { Exclude } from 'class-transformer'
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

import { EndlessKickoffs } from './endless-kickoffs.entity'
import { Results } from './results.entity'
import { Scrambles } from './scrambles.entity'
import { Submissions } from './submissions.entity'
import { Users } from './users.entity'

export enum CompetitionType {
  WEEKLY,
  RANDOM,
  ENDLESS,
}

export enum CompetitionFormat {
  MO3,
  BO1,
  BO2,
}

export enum CompetitionStatus {
  NOT_STARTED,
  ON_GOING,
  ENDED,
}

export enum CompetitionMode {
  REGULAR,
  UNLIMITED,
}

export interface Level {
  level: number
  competitors: number
  bestSubmissions: Submissions[]
  kickedOffs: EndlessKickoffs[]
}

@Entity()
@Index(['type', 'startTime', 'endTime'])
@Index(['type', 'endTime'])
export class Competitions {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  @Index({ unique: true })
  alias: string

  @Column()
  type: CompetitionType

  @Column()
  format: CompetitionFormat

  @Column({ length: 255 })
  @Index()
  name: string

  @Column()
  startTime: Date

  @Column({ nullable: true, default: null })
  endTime: Date | null

  @Column()
  @Index()
  status: CompetitionStatus

  @Column()
  userId: number

  @CreateDateColumn()
  @Exclude()
  createdAt: Date

  @UpdateDateColumn()
  @Exclude()
  updatedAt: Date

  @ManyToOne(() => Users, users => users.roles, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  user: Users

  @OneToMany(() => Scrambles, scramble => scramble.competition)
  scrambles: Scrambles[]

  @OneToMany(() => Results, result => result.competition)
  results: Promise<Results[]>

  winner: Results

  levels: Level[]

  get hasEnded() {
    return this.status === CompetitionStatus.ENDED || (this.endTime !== null && this.endTime <= new Date())
  }
}
