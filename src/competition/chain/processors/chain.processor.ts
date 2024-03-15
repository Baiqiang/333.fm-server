import { Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Job } from 'bull'
import { In, Not, Repository, TreeRepository } from 'typeorm'

import { Submissions } from '@/entities/submissions.entity'
import { UserActivities } from '@/entities/user-activities.entity'

import { ChainJob } from '../chain.service'

@Processor('chain')
export class ChainProcessor {
  private readonly logger = new Logger(ChainProcessor.name)

  constructor(
    @InjectRepository(Submissions)
    private readonly submissionsRepository: TreeRepository<Submissions>,
    @InjectRepository(UserActivities)
    private readonly userActivitiesRepository: Repository<UserActivities>,
  ) {}

  @Process()
  async process(job: Job<ChainJob>) {
    this.logger.log('Processing chain job', job.data)
    const { userId, submissionId } = job.data
    const submission = await this.submissionsRepository.findOne({
      where: {
        id: submissionId,
      },
    })
    const ancestors = await this.submissionsRepository.findAncestors(submission)
    const userActivities = await this.userActivitiesRepository.find({
      where: {
        submissionId: In(ancestors.map(submission => submission.id)),
        userId: Not(userId),
      },
    })
    for (const userActivity of userActivities) {
      userActivity.notify = true
    }
    await this.userActivitiesRepository.save(userActivities)
    // create notifications
    // const newUserActivities: UserActivities[] = []
    // for (const { userId } of userActivities) {
    //   const userActivity = new UserActivities()
    //   userActivity.userId = userId
    //   userActivity.submissionId = submission.id
    //   userActivity.notify = true
    //   userActivity.favorite = false
    //   userActivity.like = false
    //   userActivity.decline = false
    //   userActivity.view = false
    //   newUserActivities.push(userActivity)
    // }
    // await this.userActivitiesRepository.save(newUserActivities)
  }
}
