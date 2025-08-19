import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Competitions } from '@/entities/competitions.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'

import { ReconstructionController } from './reconstruction.controller'
import { ReconstructionService } from './reconstruction.service'

@Module({
  imports: [TypeOrmModule.forFeature([Competitions, Scrambles, Submissions, Users])],
  controllers: [ReconstructionController],
  providers: [ReconstructionService],
  exports: [ReconstructionService],
})
export class ReconstructionModule {}
