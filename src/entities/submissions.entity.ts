import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

import { CompetitionMode, Competitions } from './competitions.entity'
import { Results } from './results.entity'
import { Scrambles } from './scrambles.entity'
import { Users } from './users.entity'

@Entity()
@Index(['scrambleId', 'userId'])
@Index(['competitionId', 'moves'])
export class Submissions {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  mode: CompetitionMode

  @Column({ length: 255 })
  @Index()
  solution: string

  @Column({ length: 2048 })
  comment: string

  @Column({ default: 0 })
  moves: number

  @Column()
  competitionId: number

  @Column()
  scrambleId: number

  @Column()
  userId: number

  @Column()
  resultId: number

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
  })
  result: Results

  removeSolution() {
    this.solution = ''
    this.comment = ''
  }
}
