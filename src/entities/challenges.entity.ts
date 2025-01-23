import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

import { Competitions } from './competitions.entity'

@Entity()
export class Challenges {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  competitionId: number

  @Column({ nullable: true })
  startLevel?: number

  @Column({ nullable: true })
  endLevel?: number

  @Column({ nullable: true, type: 'json' })
  levels?: number[]

  @Column()
  single: number

  @Column({ type: 'json' })
  team: [number, number]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => Competitions, competition => competition.challenges, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  competition: Competitions
}

export const defaultChallenge = new Challenges()
defaultChallenge.single = 8000
defaultChallenge.team = [8000, 1]
