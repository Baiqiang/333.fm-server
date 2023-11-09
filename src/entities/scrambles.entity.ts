import { Exclude } from 'class-transformer'
import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

import { Competitions } from './competitions.entity'

@Entity()
export class Scrambles {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  number: number

  @Column({ length: 255 })
  @Index()
  scramble: string

  @Column()
  competitionId: number

  @CreateDateColumn()
  @Exclude()
  createdAt: Date

  @UpdateDateColumn()
  @Exclude()
  updatedAt: Date

  @ManyToOne(() => Competitions, competition => competition.scrambles, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  competition: Competitions
}
