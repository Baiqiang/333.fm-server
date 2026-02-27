import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AttachmentModule } from '@/attachment/attachment.module'
import { AuthModule } from '@/auth/auth.module'
import { Competitions } from '@/entities/competitions.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { WcaReconstructions } from '@/entities/wca-reconstructions.entity'
import { UserModule } from '@/user/user.module'

import { WcaReconstructionController } from './reconstruction.controller'
import { WcaReconstructionService } from './reconstruction.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([Competitions, Scrambles, Submissions, WcaReconstructions, Users]),
    HttpModule,
    AuthModule,
    AttachmentModule,
    UserModule,
  ],
  providers: [WcaReconstructionService],
  controllers: [WcaReconstructionController],
  exports: [WcaReconstructionService],
})
export class WcaReconstructionModule {}
