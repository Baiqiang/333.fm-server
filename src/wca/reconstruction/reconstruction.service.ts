import { HttpService } from '@nestjs/axios'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IPaginationOptions, paginate } from 'nestjs-typeorm-paginate'
import { firstValueFrom } from 'rxjs'
import { Repository } from 'typeorm'

import { AttachmentService } from '@/attachment/attachment.service'
import { SubmitWcaReconstructionDto, UpdateWcaReconstructionDescriptionDto } from '@/dtos/wca-reconstruction.dto'
import {
  CompetitionFormat,
  CompetitionMode,
  Competitions,
  CompetitionStatus,
  CompetitionType,
} from '@/entities/competitions.entity'
import { DNF } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { SubmissionPhase, Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { WcaReconstructions } from '@/entities/wca-reconstructions.entity'
import { UserService } from '@/user/user.service'
import { calculateMoves, transformWCAMoves } from '@/utils'

const WCA_API_BASE = 'https://www.worldcubeassociation.org/api/v0'
const WCA_LIVE_API = 'https://live.worldcubeassociation.org/api'

interface WcaApiResult {
  id: number
  pos: number
  best: number
  average: number
  name: string
  wca_id: string
  country_iso2: string
  competition_id: string
  event_id: string
  round_type_id: string
  format_id: string
  attempts: number[]
}

interface WcaApiScramble {
  event_id: string
  round_type_id: string
  group_id: string
  is_extra: boolean
  scramble_num: number
  scramble: string
}

interface WcaApiResultsResponse {
  rounds: Array<{
    roundTypeId: string
    results: WcaApiResult[]
  }>
}

interface WcaApiScramblesResponse {
  rounds: Array<{
    roundTypeId: string
    scrambles: WcaApiScramble[]
  }>
}

interface ParsedWcaResults {
  results: WcaApiResult[]
  roundMap: Map<string, number>
}

interface ParsedWcaScrambles {
  scrambles: WcaApiScramble[]
  roundMap: Map<string, number>
}

@Injectable()
export class WcaReconstructionService {
  private readonly logger = new Logger(WcaReconstructionService.name)

  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
    @InjectRepository(WcaReconstructions)
    private readonly reconstructionsRepository: Repository<WcaReconstructions>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
    private readonly httpService: HttpService,
    private readonly attachmentService: AttachmentService,
    private readonly userService: UserService,
  ) {}

  async submit(user: Users, dto: SubmitWcaReconstructionDto) {
    const { wcaCompetitionId, roundNumber, scrambleNumber, comment } = dto
    const solution = dto.solution?.trim() ?? ''
    const competition = await this.getOrCreateCompetition(wcaCompetitionId)

    let { scramble } = dto
    let scrambleRecord = await this.scramblesRepository.findOne({
      where: { competitionId: competition.id, roundNumber, number: scrambleNumber },
    })

    // check if scramble entered manually
    if (!scramble) {
      if (!scrambleRecord) {
        await this.syncScramblesFromWca(wcaCompetitionId)
        scrambleRecord = await this.scramblesRepository.findOne({
          where: { competitionId: competition.id, roundNumber, number: scrambleNumber },
        })
      }
      if (!scrambleRecord) {
        throw new BadRequestException('Scramble not available. Please provide the scramble manually.')
      }
      scramble = scrambleRecord.scramble
    }

    const moves = calculateMoves(scramble, solution)
    const isDNFSubmission = moves === DNF
    if (scrambleRecord) {
      if (!isDNFSubmission && scrambleRecord.verified && scrambleRecord.scramble !== scramble) {
        throw new BadRequestException('Scramble does not match the verified scramble')
      }
    } else {
      scrambleRecord = this.scramblesRepository.create({
        competitionId: competition.id,
        roundNumber,
        number: scrambleNumber,
        scramble,
        submittedById: user.id,
        verified: false,
      })
      await this.scramblesRepository.save(scrambleRecord)
    }

    const isParticipant = await this.isUserParticipant(wcaCompetitionId, user.wcaId)

    let reconstruction = await this.reconstructionsRepository.findOne({
      where: { competitionId: competition.id, userId: user.id },
    })
    if (!reconstruction) {
      reconstruction = this.reconstructionsRepository.create({
        competitionId: competition.id,
        userId: user.id,
        isParticipant,
      })
      await this.reconstructionsRepository.save(reconstruction)
    } else if (reconstruction.isParticipant !== isParticipant) {
      reconstruction.isParticipant = isParticipant
      await this.reconstructionsRepository.save(reconstruction)
    }

    let submission = await this.submissionsRepository.findOne({
      where: { scrambleId: scrambleRecord.id, userId: user.id },
    })
    if (submission) {
      submission.solution = solution
      submission.comment = comment ?? ''
      submission.moves = moves
    } else {
      submission = this.submissionsRepository.create({
        competitionId: competition.id,
        scrambleId: scrambleRecord.id,
        userId: user.id,
        solution,
        comment: comment ?? '',
        moves,
        mode: CompetitionMode.REGULAR,
        phase: SubmissionPhase.FINISHED,
        inverse: false,
        cumulativeMoves: moves,
        cancelMoves: 0,
        verified: true,
      })
    }

    const wcaMoves = await this.getWcaMoves(wcaCompetitionId, user.wcaId, roundNumber, scrambleNumber)
    if (wcaMoves !== null) {
      submission.wcaMoves = wcaMoves
      if (!isDNFSubmission && wcaMoves !== DNF && moves !== wcaMoves) {
        this.logger.warn(
          `Moves mismatch for ${user.wcaId} at ${wcaCompetitionId} R${roundNumber}S${scrambleNumber}: recon=${moves} wca=${wcaMoves}`,
        )
      }
    }

    if (dto.attachments?.length) {
      submission.attachments = await this.attachmentService.findByIds(dto.attachments)
    }

    await this.submissionsRepository.save(submission)
    await this.tryVerifyScramble(scrambleRecord, wcaCompetitionId)

    return { reconstruction, submission, scramble: scrambleRecord }
  }

  async updateDescription(user: Users, wcaCompetitionId: string, dto: UpdateWcaReconstructionDescriptionDto) {
    const competition = await this.competitionsRepository.findOne({
      where: { wcaCompetitionId },
    })
    if (!competition) {
      throw new BadRequestException('Competition not found')
    }

    let reconstruction = await this.reconstructionsRepository.findOne({
      where: { competitionId: competition.id, userId: user.id },
    })
    if (!reconstruction) {
      const isParticipant = await this.isUserParticipant(wcaCompetitionId, user.wcaId)
      reconstruction = this.reconstructionsRepository.create({
        competitionId: competition.id,
        userId: user.id,
        description: dto.description,
        isParticipant,
      })
    } else {
      reconstruction.description = dto.description
    }
    await this.reconstructionsRepository.save(reconstruction)
    return reconstruction
  }

  async getLatestRecons(options: IPaginationOptions) {
    const qb = this.reconstructionsRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'u')
      .leftJoinAndSelect('r.competition', 'c')
      .orderBy('r.updatedAt', 'DESC')

    const result = await paginate(qb, options)
    const recons = result.items

    const countMap: Record<string, number> = {}
    if (recons.length > 0) {
      const submissionCounts = await this.submissionsRepository
        .createQueryBuilder('s')
        .select('s.competitionId', 'competitionId')
        .addSelect('s.userId', 'userId')
        .addSelect('COUNT(*)', 'count')
        .where('s.competitionId IN (:...ids)', { ids: [...new Set(recons.map(r => r.competitionId))] })
        .andWhere('s.userId IN (:...uids)', { uids: [...new Set(recons.map(r => r.userId))] })
        .groupBy('s.competitionId')
        .addGroupBy('s.userId')
        .getRawMany()
      for (const row of submissionCounts) {
        countMap[`${row.competitionId}-${row.userId}`] = Number(row.count)
      }
    }

    return {
      items: recons.map(r => ({
        id: r.id,
        user: r.user,
        wcaCompetitionId: r.competition?.wcaCompetitionId,
        competitionName: r.competition?.name,
        description: r.description,
        isParticipant: r.isParticipant,
        submissionCount: countMap[`${r.competitionId}-${r.userId}`] ?? 0,
        updatedAt: r.updatedAt,
      })),
      meta: result.meta,
    }
  }

  async getUserRecons(user: Users) {
    const recons = await this.reconstructionsRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.competition', 'c')
      .where('r.userId = :userId', { userId: user.id })
      .orderBy('r.updatedAt', 'DESC')
      .getMany()

    const countMap: Record<number, number> = {}
    if (recons.length > 0) {
      const submissionCounts = await this.submissionsRepository
        .createQueryBuilder('s')
        .select('s.competitionId', 'competitionId')
        .addSelect('COUNT(*)', 'count')
        .where('s.competitionId IN (:...ids)', { ids: recons.map(r => r.competitionId) })
        .andWhere('s.userId = :userId', { userId: user.id })
        .groupBy('s.competitionId')
        .getRawMany()
      for (const row of submissionCounts) {
        countMap[Number(row.competitionId)] = Number(row.count)
      }
    }

    return recons.map(r => ({
      id: r.id,
      user: r.user,
      wcaCompetitionId: r.competition?.wcaCompetitionId,
      competitionName: r.competition?.name,
      description: r.description,
      isParticipant: r.isParticipant,
      submissionCount: countMap[r.competitionId] ?? 0,
      updatedAt: r.updatedAt,
    }))
  }

  async getUserReconForCompetition(wcaCompetitionId: string, targetUser: Users, currentUser?: Users) {
    const competition = await this.competitionsRepository.findOne({
      where: { wcaCompetitionId },
    })
    if (!competition) {
      return null
    }

    const recon = await this.reconstructionsRepository.findOne({
      where: { competitionId: competition.id, userId: targetUser.id },
      relations: { user: true },
    })
    if (!recon) {
      return null
    }

    const qb = this.submissionsRepository
      .createQueryBuilder('s')
      // .leftJoinAndSelect('s.user', 'u')
      .leftJoinAndSelect('s.scramble', 'sc')
    const submissions = await Submissions.withActivityCounts(qb)
      .where('s.competition_id = :cid', { cid: competition.id })
      .andWhere('s.user_id = :uid', { uid: targetUser.id })
      .orderBy('sc.round_number', 'ASC')
      .addOrderBy('sc.number', 'ASC')
      .getMany()

    if (currentUser) {
      await this.userService.loadUserActivities(currentUser, submissions)
    }

    return { recon, submissions, competition }
  }

  async getCompetitionData(wcaCompetitionId: string, user?: Users) {
    const [officialResultsData, officialScramblesData] = await Promise.all([
      this.getWcaOfficialResults(wcaCompetitionId),
      this.getWcaOfficialScrambles(wcaCompetitionId),
    ])

    const isPublished = officialResultsData !== null
    const hasOfficialScrambles = officialScramblesData !== null

    const competition = await this.competitionsRepository.findOne({
      where: { wcaCompetitionId },
    })

    if (hasOfficialScrambles && competition) {
      await this.syncScramblesFromWca(wcaCompetitionId)
    }

    const recons = competition
      ? await this.reconstructionsRepository.find({
          where: { competitionId: competition.id },
          relations: { user: true },
          order: { createdAt: 'ASC' },
        })
      : []

    let scrambles: Scrambles[]
    if (competition) {
      scrambles = await this.scramblesRepository.find({
        where: { competitionId: competition.id },
        order: { roundNumber: 'ASC', number: 'ASC' },
      })
    } else if (officialScramblesData) {
      const { scrambles: officialScrambles, roundMap } = officialScramblesData
      scrambles = officialScrambles
        .filter(s => !s.is_extra)
        .map((s, i) => {
          const record = new Scrambles()
          record.id = -(i + 1)
          record.roundNumber = roundMap.get(s.round_type_id) ?? 1
          record.number = s.scramble_num
          record.scramble = s.scramble
          record.verified = true
          record.competitionId = 0
          return record
        })
        .sort((a, b) => a.roundNumber - b.roundNumber || a.number - b.number)
    } else {
      scrambles = []
    }

    let submissions: Submissions[] = []
    if (competition) {
      const qb = this.submissionsRepository
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.user', 'u')
        .leftJoinAndSelect('s.scramble', 'sc')
      submissions = await Submissions.withActivityCounts(qb)
        .where('s.competition_id = :id', { id: competition.id })
        .orderBy('s.moves', 'ASC')
        .getMany()
      if (user) {
        await this.userService.loadUserActivities(user, submissions)
      }
    }

    let currentUser: { isParticipant: boolean; attempts: Record<string, number> } | null = null
    if (user?.wcaId) {
      const attempts: Record<string, number> = {}
      let isParticipant = false

      if (officialResultsData) {
        const { results, roundMap } = officialResultsData
        for (const result of results) {
          if (result.wca_id === user.wcaId) {
            isParticipant = true
            const rn = roundMap.get(result.round_type_id) ?? 1
            for (let i = 0; i < result.attempts.length; i++) {
              if (result.attempts[i] !== 0) {
                attempts[`${rn}-${i + 1}`] = result.attempts[i]
              }
            }
          }
        }
      }

      if (!isParticipant) {
        const liveData = await this.getLiveUserData(wcaCompetitionId, user.wcaId)
        if (liveData) {
          isParticipant = liveData.isParticipant
          Object.assign(attempts, liveData.attempts)
        }
      }

      currentUser = { isParticipant, attempts }
    }

    return {
      competition,
      recons,
      scrambles,
      submissions,
      isPublished,
      hasOfficialScrambles,
      currentUser,
    }
  }

  async getScrambles(wcaCompetitionId: string) {
    const competition = await this.competitionsRepository.findOne({
      where: { wcaCompetitionId },
    })
    if (!competition) return []
    return this.scramblesRepository.find({
      where: { competitionId: competition.id },
      order: { roundNumber: 'ASC', number: 'ASC' },
    })
  }

  async syncScramblesFromWca(wcaCompetitionId: string) {
    const data = await this.getWcaOfficialScrambles(wcaCompetitionId)
    if (!data) return null

    const competition = await this.getOrCreateCompetition(wcaCompetitionId)

    const { scrambles: officialScrambles, roundMap } = data
    const fmScrambles = officialScrambles.filter(s => !s.is_extra)
    const synced: Scrambles[] = []

    for (const s of fmScrambles) {
      const roundNumber = roundMap.get(s.round_type_id) ?? 1
      const scrambleNumber = s.scramble_num

      let existing = await this.scramblesRepository.findOne({
        where: { competitionId: competition.id, roundNumber, number: scrambleNumber },
      })

      if (existing) {
        if (!existing.verified || existing.scramble !== s.scramble) {
          existing.scramble = s.scramble
          existing.verified = true
          await this.scramblesRepository.save(existing)
        }
      } else {
        existing = this.scramblesRepository.create({
          competitionId: competition.id,
          roundNumber,
          number: scrambleNumber,
          scramble: s.scramble,
          verified: true,
        })
        await this.scramblesRepository.save(existing)
      }
      synced.push(existing)
    }

    return synced
  }

  async isUserParticipant(wcaCompetitionId: string, wcaId: string): Promise<boolean> {
    if (!wcaId) return false

    const data = await this.getWcaOfficialResults(wcaCompetitionId)
    if (data) return data.results.some(r => r.wca_id === wcaId)

    return this.isUserInWcaLive(wcaCompetitionId, wcaId)
  }

  // region Competition management

  private async getOrCreateCompetition(wcaCompetitionId: string): Promise<Competitions> {
    let competition = await this.competitionsRepository.findOne({
      where: { wcaCompetitionId },
    })
    if (competition) return competition

    competition = this.competitionsRepository.create({
      alias: wcaCompetitionId,
      name: wcaCompetitionId,
      type: CompetitionType.WCA_RECONSTRUCTION,
      format: CompetitionFormat.MO3,
      status: CompetitionStatus.ON_GOING,
      startTime: new Date(),
      wcaCompetitionId,
      userId: 1,
    })
    await this.competitionsRepository.save(competition)
    return competition
  }

  // endregion

  // region WCA API helpers

  async getWcaOfficialResults(wcaCompetitionId: string): Promise<ParsedWcaResults | null> {
    try {
      const url = `${WCA_API_BASE}/competitions/${wcaCompetitionId}/results/333fm`
      const response = await firstValueFrom(this.httpService.get<WcaApiResultsResponse>(url))
      const rounds = response.data?.rounds
      if (!rounds?.length) return null
      const results = rounds.flatMap(r => r.results)
      if (results.length === 0) return null
      const roundMap = this.buildRoundNumberMap(rounds.map(r => r.roundTypeId))
      return { results, roundMap }
    } catch {
      return null
    }
  }

  async getWcaOfficialScrambles(wcaCompetitionId: string): Promise<ParsedWcaScrambles | null> {
    try {
      const url = `${WCA_API_BASE}/competitions/${wcaCompetitionId}/scrambles/333fm`
      const response = await firstValueFrom(this.httpService.get<WcaApiScramblesResponse>(url))
      const rounds = response.data?.rounds
      if (!rounds?.length) return null
      const scrambles = rounds.flatMap(r => r.scrambles)
      if (scrambles.length === 0) return null
      const roundMap = this.buildRoundNumberMap(rounds.map(r => r.roundTypeId))
      return { scrambles, roundMap }
    } catch {
      return null
    }
  }

  async getWcaMoves(
    wcaCompetitionId: string,
    wcaId: string,
    roundNumber: number,
    scrambleNumber: number,
  ): Promise<number | null> {
    if (!wcaId) return null

    const officialMoves = await this.getWcaMovesFromOfficial(wcaCompetitionId, wcaId, roundNumber, scrambleNumber)
    if (officialMoves !== null) return officialMoves

    return this.getWcaMovesFromLive(wcaCompetitionId, wcaId, roundNumber, scrambleNumber)
  }

  // endregion

  // region Private helpers

  private buildRoundNumberMap(roundTypeIds: string[]): Map<string, number> {
    const priority: Record<string, number> = {
      '0': 0,
      '1': 1,
      d: 1.5,
      '2': 2,
      e: 2.5,
      '3': 3,
      g: 3.5,
      f: 10,
      c: 10.5,
      b: 11,
    }
    const unique = [...new Set(roundTypeIds)]
    unique.sort((a, b) => (priority[a] ?? 5) - (priority[b] ?? 5))
    const map = new Map<string, number>()
    unique.forEach((id, i) => map.set(id, i + 1))
    return map
  }

  private async getWcaMovesFromOfficial(
    wcaCompetitionId: string,
    wcaId: string,
    roundNumber: number,
    scrambleNumber: number,
  ): Promise<number | null> {
    const data = await this.getWcaOfficialResults(wcaCompetitionId)
    if (!data) return null

    const { results, roundMap } = data
    for (const result of results) {
      if (result.wca_id === wcaId) {
        const rn = roundMap.get(result.round_type_id) ?? 1
        if (rn === roundNumber && result.attempts[scrambleNumber - 1] !== undefined) {
          const attempt = result.attempts[scrambleNumber - 1]
          return transformWCAMoves(attempt)
        }
      }
    }
    return null
  }

  private async getWcaMovesFromLive(
    wcaCompetitionId: string,
    wcaId: string,
    roundNumber: number,
    scrambleNumber: number,
  ): Promise<number | null> {
    try {
      const liveCompId = await this.findLiveCompetitionId(wcaCompetitionId)
      if (!liveCompId) return null

      const compResp = await firstValueFrom(
        this.httpService.post<{ data?: { competition?: { competitionEvents: any[] } } }>(WCA_LIVE_API, {
          query: `query($id: ID!) {
              competition(id: $id) {
                competitionEvents {
                  event { id }
                  rounds { id name number }
                }
              }
            }`,
          variables: { id: liveCompId },
        }),
      )
      const events = compResp.data?.data?.competition?.competitionEvents
      const fmEvent = events?.find((e: any) => e.event.id === '333fm')
      if (!fmEvent?.rounds?.length) return null
      const targetRound = fmEvent.rounds.find((r: any) => r.number === roundNumber) ?? fmEvent.rounds[roundNumber - 1]
      if (!targetRound) return null

      const roundResp = await firstValueFrom(
        this.httpService.post<{ data?: { round?: { results: any[] } } }>(WCA_LIVE_API, {
          query: `query($id: ID!) {
              round(id: $id) {
                results {
                  person { wcaId }
                  attempts { result }
                }
              }
            }`,
          variables: { id: targetRound.id },
        }),
      )
      const roundResults = roundResp.data?.data?.round?.results
      const personResult = roundResults?.find((r: any) => r.person?.wcaId === wcaId)
      if (!personResult?.attempts?.[scrambleNumber - 1]) return null
      const attemptResult = personResult.attempts[scrambleNumber - 1].result
      return transformWCAMoves(attemptResult, true)
    } catch (e) {
      this.logger.debug(`Failed to fetch WCA Live data: ${e}`)
      return null
    }
  }

  private async findLiveCompetitionId(wcaCompetitionId: string): Promise<string | null> {
    try {
      const resp = await firstValueFrom(
        this.httpService.post<{ data?: { competitions?: { id: string; wcaId: string }[] } }>(WCA_LIVE_API, {
          query: `query($filter: String!) { competitions(filter: $filter, limit: 5) { id wcaId } }`,
          variables: { filter: wcaCompetitionId },
        }),
      )
      const comps = resp.data?.data?.competitions
      if (!comps?.length) return null
      return comps.find(c => c.wcaId === wcaCompetitionId)?.id ?? comps[0].id
    } catch {
      return null
    }
  }

  private async isUserInWcaLive(wcaCompetitionId: string, wcaId: string): Promise<boolean> {
    try {
      const liveCompId = await this.findLiveCompetitionId(wcaCompetitionId)
      if (!liveCompId) return false

      const compResp = await firstValueFrom(
        this.httpService.post<{ data?: { competition?: { competitionEvents: any[] } } }>(WCA_LIVE_API, {
          query: `query($id: ID!) {
              competition(id: $id) {
                competitionEvents {
                  event { id }
                  rounds { id number }
                }
              }
            }`,
          variables: { id: liveCompId },
        }),
      )
      const events = compResp.data?.data?.competition?.competitionEvents
      const fmEvent = events?.find((e: any) => e.event.id === '333fm')
      if (!fmEvent?.rounds?.length) return false

      const r1 = fmEvent.rounds.find((r: any) => r.number === 1) ?? fmEvent.rounds[0]
      const roundResp = await firstValueFrom(
        this.httpService.post<{ data?: { round?: { results: any[] } } }>(WCA_LIVE_API, {
          query: `query($id: ID!) { round(id: $id) { results { person { wcaId } } } }`,
          variables: { id: r1.id },
        }),
      )
      return roundResp.data?.data?.round?.results?.some((r: any) => r.person?.wcaId === wcaId) ?? false
    } catch {
      return false
    }
  }

  private async getLiveUserData(
    wcaCompetitionId: string,
    wcaId: string,
  ): Promise<{ isParticipant: boolean; attempts: Record<string, number> } | null> {
    try {
      const liveCompId = await this.findLiveCompetitionId(wcaCompetitionId)
      if (!liveCompId) return null

      const compResp = await firstValueFrom(
        this.httpService.post<{ data?: { competition?: { competitionEvents: any[] } } }>(WCA_LIVE_API, {
          query: `query($id: ID!) {
              competition(id: $id) {
                competitionEvents {
                  event { id }
                  rounds { id number }
                }
              }
            }`,
          variables: { id: liveCompId },
        }),
      )
      const events = compResp.data?.data?.competition?.competitionEvents
      const fmEvent = events?.find((e: any) => e.event.id === '333fm')
      if (!fmEvent?.rounds?.length) return null

      let isParticipant = false
      const attempts: Record<string, number> = {}

      for (const round of fmEvent.rounds) {
        const roundResp = await firstValueFrom(
          this.httpService.post<{ data?: { round?: { results: any[] } } }>(WCA_LIVE_API, {
            query: `query($id: ID!) { round(id: $id) { results { person { wcaId } attempts { result } } } }`,
            variables: { id: round.id },
          }),
        )
        const personResult = roundResp.data?.data?.round?.results?.find((r: any) => r.person?.wcaId === wcaId)
        if (personResult) {
          isParticipant = true
          for (let i = 0; i < personResult.attempts.length; i++) {
            const result = personResult.attempts[i].result
            if (result !== 0) {
              attempts[`${round.number}-${i + 1}`] = result
            }
          }
        }
      }

      return isParticipant ? { isParticipant, attempts } : null
    } catch {
      return null
    }
  }

  private async tryVerifyScramble(scramble: Scrambles, wcaCompetitionId: string) {
    if (scramble.verified) return

    const data = await this.getWcaOfficialScrambles(wcaCompetitionId)
    if (!data) return

    const { scrambles: officialScrambles, roundMap } = data
    const matching = officialScrambles
      .filter(s => !s.is_extra)
      .filter(s => s.scramble_num === scramble.number)
      .filter(s => (roundMap.get(s.round_type_id) ?? 1) === scramble.roundNumber)

    if (matching.length > 0) {
      scramble.scramble = matching[0].scramble
      scramble.verified = true
      await this.scramblesRepository.save(scramble)
    }
  }

  // endregion
}
