import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Tree,
  TreeChildren,
  TreeParent,
  UpdateDateColumn,
} from 'typeorm'

import { Attachments } from './attachment.entity'
import { CompetitionMode, Competitions } from './competitions.entity'
import { Results } from './results.entity'
import { Scrambles } from './scrambles.entity'
import { UserActivities } from './user-activities.entity'
import { Users } from './users.entity'

export enum SubmissionPhase {
  FINISHED,
  SCRAMBLED,
  EO,
  DR,
  HTR,
  SKELETON,
  INSERTIONS,
}

export enum SolutionMode {
  REGULAR,
  INSERTIONS,
}

export interface Insertion {
  skeleton: string
  insertion: string
  insertPlace: number
}

@Entity()
@Tree('closure-table')
@Index(['scrambleId', 'userId'])
@Index(['competitionId', 'moves'])
@Index(['scrambleId', 'phase', 'cumulativeMoves'])
export class Submissions {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  mode: CompetitionMode

  @Column({ length: 255 })
  @Index()
  solution: string

  @Column({ type: 'json', default: null })
  insertions: Insertion[] | null

  @Column({ default: false })
  inverse: boolean

  @Column({ default: SubmissionPhase.FINISHED })
  phase: SubmissionPhase

  @Column({ length: 2048 })
  comment: string

  @Column({ default: 0 })
  moves: number

  @Column({ default: 0 })
  cumulativeMoves: number

  @Column({ default: 0 })
  cancelMoves: number

  @Column({ default: true })
  verified: boolean

  @Column()
  competitionId: number

  @Column()
  scrambleId: number

  @Column()
  userId: number

  @Column({ nullable: true })
  resultId: number

  @Column({ nullable: true })
  parentId: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => Competitions, competition => competition.scrambles, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  competition: Competitions

  @ManyToOne(() => Scrambles, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  scramble: Scrambles

  @ManyToOne(() => Users, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  user: Users

  @ManyToOne(() => Results, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
    nullable: true,
  })
  result: Results

  @OneToMany(() => UserActivities, userActivities => userActivities.submission)
  userActivities: UserActivities[]

  @ManyToMany(() => Attachments, {
    eager: true,
  })
  @JoinTable()
  attachments: Attachments[]

  @TreeChildren()
  children: Submissions[]

  @TreeParent()
  parent: Submissions

  removeSolution() {
    this.moves = 0
    this.solution = ''
    this.comment = ''
  }

  likes: number
  liked: boolean
  favorites: number
  favorited: boolean

  viewed: boolean
  declined: boolean
  notification: boolean
  latestSubmitted: boolean

  hideSolution: boolean

  continuances: number
  finishes: number
  best: number
}
