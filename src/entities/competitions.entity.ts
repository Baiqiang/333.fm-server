import { Exclude, Expose } from 'class-transformer'
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

import { Challenges } from './challenges.entity'
import { EndlessKickoffs } from './endless-kickoffs.entity'
import { Results } from './results.entity'
import { Scrambles } from './scrambles.entity'
import { Submissions } from './submissions.entity'
import { Users } from './users.entity'

export enum CompetitionType {
  WEEKLY,
  RANDOM,
  ENDLESS,
  FMC_CHAIN,
  PERSONAL_PRACTICE,
  DAILY,
}

export enum CompetitionSubType {
  REGULAR,
  BOSS_CHALLENGE,
  EO_PRACTICE,
  DR_PRACTICE,
  HTR_PRACTICE,
  HIDDEN_SCRAMBLE,
  JZP_PRACTICE,
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

  @Column({ default: CompetitionSubType.REGULAR })
  subType: CompetitionSubType

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

  @OneToMany(() => Scrambles, scramble => scramble.competition, {
    cascade: true,
  })
  scrambles: Scrambles[]

  @OneToMany(() => Submissions, submission => submission.competition)
  submissions: Submissions[]

  @OneToMany(() => Results, result => result.competition)
  results: Promise<Results[]>

  winners: Results[]
  prevCompetition?: Competitions
  nextCompetition?: Competitions

  levels: Level[]

  @OneToMany(() => Challenges, challenge => challenge.competition, {
    cascade: true,
  })
  challenges?: Challenges[]

  attendees: number
  ownerResult: Results
  prevIndex?: number
  nextIndex?: number

  get hasEnded() {
    return this.status === CompetitionStatus.ENDED || (this.endTime !== null && this.endTime <= new Date())
  }

  @Expose()
  get url() {
    const { alias, type, user } = this
    switch (type) {
      case CompetitionType.WEEKLY:
        return `/weekly/${alias}`
      case CompetitionType.DAILY:
        return `/daily/${alias}`
      case CompetitionType.ENDLESS:
        return `/endless/${alias}`
      case CompetitionType.FMC_CHAIN:
        return `/chain`
      case CompetitionType.PERSONAL_PRACTICE:
        if (!user) return '/practice'
        return `/practice/${user.wcaId || user.id}/${alias.split('-').pop()}`
      default:
        return ''
    }
  }
}
