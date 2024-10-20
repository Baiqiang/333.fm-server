import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Attachments } from '@/entities/attachment.entity'
import { Competitions } from '@/entities/competitions.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { UserModule } from '@/user/user.module'

import { ProfileController } from './profile.controller'
import { ProfileService } from './profile.service'

@Module({
  imports: [TypeOrmModule.forFeature([Competitions, Results, Scrambles, Submissions, Users, Attachments]), UserModule],
  providers: [ProfileService],
  controllers: [ProfileController],
})
export class ProfileModule {}
