import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SnakeNamingStrategy } from 'typeorm-naming-strategies'

import configuration from '@/config/configuration'
import { Algs } from '@/entities/algs.entity'
import { Attachments } from '@/entities/attachment.entity'
import { Competitions } from '@/entities/competitions.entity'
import { EndlessKickoffs } from '@/entities/endless-kickoffs.entity'
import { InsertionFinders } from '@/entities/insertion-finders.entity'
import { LeagueDuels } from '@/entities/league-duels.entity'
import { LeagueEloHistories } from '@/entities/league-elo-histories.entity'
import { LeagueElos } from '@/entities/league-elos.entity'
import { LeagueParticipants } from '@/entities/league-participants.entity'
import { LeaguePlayers } from '@/entities/league-players.entity'
import { LeagueResults } from '@/entities/league-results.entity'
import { LeagueSeasons } from '@/entities/league-seasons.entity'
import { LeagueStandings } from '@/entities/league-standings.entity'
import { LeagueTiers } from '@/entities/league-tiers.entity'
import { RealInsertionFinders } from '@/entities/real-insertion-finders.entity'
import { Results } from '@/entities/results.entity'
import { Scrambles } from '@/entities/scrambles.entity'
import { Submissions } from '@/entities/submissions.entity'
import { UserActivities } from '@/entities/user-activities.entity'
import { UserInsertionFinders } from '@/entities/user-insertion-finders.entity'
import { UserRoles } from '@/entities/user-roles.entity'
import { Users } from '@/entities/users.entity'

import { CmdService } from './cmd.service'
import { LeagueCommand } from './league/league.command'
import { LeagueService } from './league/league.service'
import { PointCommand } from './point/point.command'
import { PointService } from './point/point.service'
import { UserCommand } from './user/user.command'
import { UserService } from './user/user.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: '333.fm',
      password: '',
      database: '333fm',
      synchronize: true,
      autoLoadEntities: true,
      namingStrategy: new SnakeNamingStrategy(),
      // logging: true,
    }),
    TypeOrmModule.forFeature([
      Algs,
      Competitions,
      EndlessKickoffs,
      InsertionFinders,
      RealInsertionFinders,
      Results,
      Scrambles,
      Submissions,
      Attachments,
      Users,
      UserActivities,
      UserInsertionFinders,
      UserRoles,
      LeagueSeasons,
      LeagueTiers,
      LeaguePlayers,
      LeagueDuels,
      LeagueStandings,
      LeagueResults,
      LeagueParticipants,
      LeagueElos,
      LeagueEloHistories,
    ]),
  ],
  providers: [CmdService, PointService, PointCommand, UserService, UserCommand, LeagueService, LeagueCommand],
})
export class CmdModule {}
