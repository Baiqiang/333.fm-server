import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export interface DRTriggerSolution {
  length: number
  eoBreaking: boolean
  trigger: number
  solution: string
}

@Entity()
@Index(['rzp'])
export class DRTriggers {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  @Index()
  caseId: number

  @Column({ length: 20 })
  rzp: string

  @Column({ length: 20 })
  arm: string

  @Column({ default: 0 })
  pairs: number

  @Column({ length: 50, nullable: true, default: null })
  tetrad: string | null

  @Column({ length: 50, nullable: true, default: null })
  corners: string | null

  @Column({ default: 0 })
  @Index()
  optimalMoves: number

  @Column({ type: 'json' })
  solutions: DRTriggerSolution[]

  @CreateDateColumn()
  createdAt: Date
}
