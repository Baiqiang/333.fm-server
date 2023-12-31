export default () => ({
  jwt: {
    secret: process.env.JWT_SECRET ?? '333.fm test secret',
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
  },
})
