import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IPaginationOptions, paginate, Pagination } from 'nestjs-typeorm-paginate'
import { In, Repository } from 'typeorm'

import { ReconstructionCompetitionDto, ScrambleDto } from '@/dtos/reconstruction.dto'
import { SubmitSolutionDto } from '@/dtos/submit-solution.dto'
import { Competitions, CompetitionStatus, CompetitionType } from '@/entities/competitions.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { Users } from '@/entities/users.entity'
import { calculateMoves } from '@/utils'

@Injectable()
export class ReconstructionService {
  constructor(
    @InjectRepository(Competitions)
    private readonly competitionsRepository: Repository<Competitions>,
    @InjectRepository(Scrambles)
    private readonly scramblesRepository: Repository<Scrambles>,
    @InjectRepository(Submissions)
    private readonly submissionsRepository: Repository<Submissions>,
  ) {}

  async createCompetition(user: Users, dto: ReconstructionCompetitionDto): Promise<Competitions> {
    const competition = this.competitionsRepository.create({
      name: dto.name,
      format: dto.format,
      startTime: dto.startTime,
      endTime: dto.endTime || null,
      alias: `reconstruction-${dto.name}`,
      type: CompetitionType.RECONSTRUCTION,
      userId: user.id,
      user,
      status: CompetitionStatus.NOT_STARTED,
    })

    const savedCompetition = await this.competitionsRepository.save(competition)

    if (dto.scrambles && dto.scrambles.length > 0) {
      const scrambles = dto.scrambles.map(scrambleDto =>
        this.scramblesRepository.create({
          number: scrambleDto.number,
          scramble: scrambleDto.scramble,
          round: scrambleDto.round || 1,
          competitionId: savedCompetition.id,
          competition: savedCompetition,
        }),
      )

      const savedScrambles = await this.scramblesRepository.save(scrambles)
      savedCompetition.scrambles = savedScrambles
    }

    return savedCompetition
  }

  async getCompetitions(options: IPaginationOptions): Promise<Pagination<Competitions>> {
    const queryBuilder = this.competitionsRepository
      .createQueryBuilder('competition')
      .where('competition.type = :type', { type: CompetitionType.RECONSTRUCTION })
      .leftJoinAndSelect('competition.user', 'user')
      .leftJoinAndSelect('competition.scrambles', 'scrambles')
      .orderBy('competition.createdAt', 'DESC')

    return paginate<Competitions>(queryBuilder, options)
  }

  async getCompetitionById(id: number): Promise<Competitions | null> {
    const competition = await this.competitionsRepository.findOne({
      where: { id, type: CompetitionType.RECONSTRUCTION },
      relations: ['user', 'scrambles'],
    })

    if (!competition) {
      return null
    }

    if (competition.scrambles.length > 0) {
      const scrambleIds = competition.scrambles.map(s => s.id)
      const submissions = await this.submissionsRepository.find({
        where: { scrambleId: In(scrambleIds) },
        relations: ['user'],
      })

      const submissionsByScrambleId = submissions.reduce(
        (acc, submission) => {
          if (!acc[submission.scrambleId]) {
            acc[submission.scrambleId] = []
          }
          acc[submission.scrambleId].push(submission)
          return acc
        },
        {} as Record<number, Submissions[]>,
      )

      competition.scrambles.forEach(scramble => {
        Object.assign(scramble, {
          submissions: submissionsByScrambleId[scramble.id] || [],
        })
      })
    }

    return competition
  }

  async updateCompetition(id: number, user: Users, dto: ReconstructionCompetitionDto): Promise<Competitions> {
    const competition = await this.competitionsRepository.findOne({
      where: { id, userId: user.id, type: CompetitionType.RECONSTRUCTION },
      relations: ['scrambles'],
    })

    if (!competition) {
      throw new NotFoundException()
    }

    const allowedFields = ['name', 'format', 'startTime', 'endTime']
    const updateData = Object.keys(dto)
      .filter(key => allowedFields.includes(key) && dto[key] !== undefined)
      .reduce((obj, key) => {
        obj[key] = dto[key]
        return obj
      }, {})

    Object.assign(competition, updateData)
    const savedCompetition = await this.competitionsRepository.save(competition)

    if (dto.scrambles && dto.scrambles.length > 0) {
      const newScrambles = dto.scrambles.map(scrambleDto =>
        this.scramblesRepository.create({
          number: scrambleDto.number,
          scramble: scrambleDto.scramble,
          round: scrambleDto.round || 1,
          competitionId: savedCompetition.id,
          competition: savedCompetition,
        }),
      )

      const savedScrambles = await this.scramblesRepository.save(newScrambles)

      savedCompetition.scrambles = [...(savedCompetition.scrambles || []), ...savedScrambles]
    }

    return savedCompetition
  }

  async addScramblesToCompetition(competitionId: number, user: Users, scrambles: ScrambleDto[]): Promise<Competitions> {
    const competition = await this.competitionsRepository.findOne({
      where: { id: competitionId, userId: user.id, type: CompetitionType.RECONSTRUCTION },
      relations: ['scrambles'],
    })

    if (!competition) {
      throw new NotFoundException()
    }

    const maxNumber = competition.scrambles.length > 0 ? Math.max(...competition.scrambles.map(s => s.number)) : 0

    const newScrambles = scrambles.map((scrambleDto, index) =>
      this.scramblesRepository.create({
        number: scrambleDto.number || maxNumber + index + 1,
        scramble: scrambleDto.scramble,
        round: scrambleDto.round || 1,
        competitionId: competition.id,
        competition,
      }),
    )

    const savedScrambles = await this.scramblesRepository.save(newScrambles)

    competition.scrambles = [...competition.scrambles, ...savedScrambles]

    return competition
  }

  async submitSolution(user: Users, dto: SubmitSolutionDto): Promise<Submissions> {
    const scramble = await this.scramblesRepository.findOne({
      where: { id: dto.scrambleId },
      relations: ['competition'],
    })

    if (!scramble) {
      throw new NotFoundException()
    }

    const existingSolution = await this.submissionsRepository.findOne({
      where: { scrambleId: dto.scrambleId, userId: user.id },
    })

    if (existingSolution) {
      throw new BadRequestException()
    }

    const moves = calculateMoves(scramble.scramble, dto.solution)

    const solution = this.submissionsRepository.create({
      scrambleId: dto.scrambleId,
      solution: dto.solution,
      comment: dto.comment,
      mode: dto.mode,
      competitionId: scramble.competitionId,
      userId: user.id,
      moves,
      insertions: dto.insertions || null,
      inverse: dto.inverse || false,
      parentId: dto.parentId || null,
      user,
      scramble,
      competition: scramble.competition,
    })

    return await this.submissionsRepository.save(solution)
  }

  async getSubmissionById(id: number): Promise<Submissions | null> {
    return await this.submissionsRepository.findOne({
      where: { id },
      relations: ['user', 'scramble', 'scramble.competition'],
    })
  }

  async updateSubmission(id: number, user: Users, dto: SubmitSolutionDto): Promise<Submissions> {
    const submission = await this.submissionsRepository.findOne({
      where: { id, userId: user.id },
      relations: ['scramble', 'scramble.competition'],
    })

    if (!submission) {
      throw new NotFoundException()
    }

    if (dto.solution !== undefined && dto.solution.trim() !== '') {
      submission.solution = dto.solution.trim()
      submission.moves = calculateMoves(submission.scramble.scramble, submission.solution)
    }
    if (dto.comment !== undefined) {
      submission.comment = dto.comment
    }

    return await this.submissionsRepository.save(submission)
  }
}
