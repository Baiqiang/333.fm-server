import { Challenge } from '@/competition/endless/endless.service'

export const UPLOAD_CONFIG = {
  BASE_URL: '',
}

function makeBossChallenge(): Challenge[] {
  const challenges: Challenge[] = []
  // 1-40
  challenges.push({
    startLevel: 1,
    endLevel: 9,
    single: 2400,
    team: [2800, 3],
  })
  challenges.push({
    startLevel: 11,
    endLevel: 19,
    single: 2400,
    team: [2800, 4],
  })
  challenges.push({
    startLevel: 21,
    endLevel: 29,
    single: 2400,
    team: [2800, 5],
  })
  challenges.push({
    levels: [10, 20, 30],
    single: 2300,
    team: [2600, 5],
  })
  // 41-70
  challenges.push({
    startLevel: 31,
    endLevel: 39,
    single: 2300,
    team: [2700, 3],
  })
  challenges.push({
    startLevel: 41,
    endLevel: 49,
    single: 2300,
    team: [2700, 4],
  })
  challenges.push({
    startLevel: 51,
    endLevel: 59,
    single: 2300,
    team: [2700, 5],
  })
  challenges.push({
    levels: [40, 50, 60],
    single: 2200,
    team: [2500, 5],
  })
  // 71-90
  challenges.push({
    startLevel: 61,
    endLevel: 69,
    single: 2200,
    team: [2600, 3],
  })
  challenges.push({
    startLevel: 71,
    endLevel: 79,
    single: 2200,
    team: [2600, 4],
  })
  challenges.push({
    startLevel: 81,
    endLevel: 89,
    single: 2200,
    team: [2600, 5],
  })
  challenges.push({
    levels: [70, 80, 90],
    single: 2100,
    team: [2400, 5],
  })
  // 91-100
  challenges.push({
    startLevel: 91,
    endLevel: 99,
    single: 2100,
    team: [2500, 3],
  })
  challenges.push({
    levels: [100],
    single: 2000,
    team: [2300, 5],
  })
  return challenges
}

export default () => ({
  jwt: {
    secret: process.env.JWT_SECRET ?? '333.fm test secret',
  },
  bot: {
    secret: process.env.BOT_SECRET ?? '333.fm test bot secret',
  },
  oauth: {
    wca: {
      clientID: 'BHRDKfu7CguB9D9ijTtoZV67A46m2mQ0VMEZhe-h1ak',
      clientSecret: process.env.WCA_CLIENT_SECRET ?? '',
      scope: ['public', 'email'],
      callbackURL: process.env.WCA_CALLBACK_URL ?? 'http://localhost:3000/auth/callback',
      profileURL: 'https://www.worldcubeassociation.org/api/v0/me',
      tokenURL: 'https://www.worldcubeassociation.org/oauth/token',
      authorizationURL: 'https://www.worldcubeassociation.org/oauth/authorize',
    },
  },
  if: {
    maxCycles: 10,
    perPage: 60,
    maxScrambleLength: 50,
    maxSkeletonLength: 50,
    maxGreedy: 6,
    version: ['0.5.4', '0.5.4'],
  },
  endless: {
    kickoffMoves: {
      single: 2400,
      team: [3000, 3],
    },
    bossChallenges: makeBossChallenge(),
  },
  upload: {
    dest: process.env.UPLOAD_DEST || './uploads',
    baseURL: (UPLOAD_CONFIG.BASE_URL = process.env.UPLOAD_BASE_URL || 'http://localhost:3001/uploads'),
  },
})
