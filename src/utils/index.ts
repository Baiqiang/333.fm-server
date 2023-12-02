import { createHash } from 'crypto'
import dayjs from 'dayjs'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import weekOfYear from 'dayjs/plugin/weekOfYear'
import { Algorithm, Cube } from 'insertionfinder'
import { fmcScramble } from 'twisty_puzzle_solver'

import { DNF, Results } from '@/entities/results.entity'

dayjs.extend(advancedFormat)
dayjs.extend(weekOfYear)

export function replaceQuote(string: string): string {
  return string.replace(/[‘’`]/g, "'")
}

export function removeComment(string: string | string[]): string {
  if (Array.isArray(string)) {
    string = string.join(' ')
  }
  // supports various types of quotes
  string = replaceQuote(string)
  return string
    .split('\n')
    .map(s => s.split('//')[0])
    .join('')
}

export function formatAlgorithm(string: string, placement: number = 0): string {
  string = removeComment(string)
  const algorithm = new Algorithm(string)
  algorithm.clearFlags(placement)
  algorithm.normalize()
  return algorithm.toString()
}

export function formatSkeleton(scramble: string, skeleton: string): { formattedSkeleton: string; bestCube: Cube } {
  const cube = new Cube()
  cube.twist(new Algorithm(scramble))
  cube.twist(new Algorithm(removeComment(skeleton)))
  const bestCube = cube.getBestPlacement()
  const formattedSkeleton = formatAlgorithm(skeleton, bestCube.placement)
  return { formattedSkeleton, bestCube }
}

export function centerLength(centerCycles: number, placement: number): number {
  return centerCycles === 3 ? 6 : centerCycles === 2 ? 4 : [2, 8, 10].includes(placement) ? 4 : 6
}

export function calculateHash(obj: any) {
  return createHash('md5').update(JSON.stringify(obj)).digest('hex')
}

export function calculateMoves(scramble: string, solution: string, allowNISS = false): number {
  let moves: number
  try {
    const { bestCube } = formatSkeleton(scramble, solution)
    // check if solved
    if (
      bestCube.getCornerCycles() === 0 &&
      bestCube.getEdgeCycles() === 0 &&
      bestCube.getCenterCycles() === 0 &&
      !bestCube.hasParity()
    ) {
      const solutionAlg = new Algorithm(replaceQuote(solution))
      moves = (solutionAlg.twists.length + solutionAlg.inverseTwists.length) * 100
    } else {
      // DNF
      moves = DNF
    }
    if (!allowNISS) {
      // check NISS and ()
      if (solution.includes('NISS') || solution.includes('(')) {
        moves = DNF
      }
    }
  } catch (e) {
    moves = DNF
  }
  return moves
}

export function parseWeek(week: string): dayjs.Dayjs {
  const matches = week.match(/^(\d{4})-(\d\d)$/)
  if (!matches) {
    return null
  }
  return dayjs(matches[1]).week(parseInt(matches[2])).day(1)
}

export function generateScrambles(number: number): string[] {
  const scrambles: string[] = []
  for (let i = 0; i < number; i++) {
    scrambles.push(fmcScramble())
  }
  return scrambles
}

export function sortResult(a: Results, b: Results): number {
  if (a.average === b.average) {
    return a.best - b.best
  }
  return a.average - b.average
}

export function setRanks(results: Results[]): Results[] {
  results.sort(sortResult)
  return setRanksOnly(results)
}

export function setRanksOnly(results: Results[]): Results[] {
  results.forEach((result, index) => {
    const previous = results[index - 1]
    result.rank = index + 1
    if (previous && previous.average === result.average && previous.best === result.best) {
      result.rank = previous.rank
    }
  })
  return results
}

export function calculateMean(values: number[]): number {
  const dnfResults = values.filter(v => v === DNF)
  if (dnfResults.length > 0) {
    return DNF
  }
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function calculateAverage(values: number[]): number {
  const dnfResults = values.filter(v => v === DNF)
  if (dnfResults.length > 1) {
    return DNF
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  return (values.reduce((a, b) => a + b, 0) - max - min) / (values.length - 2)
}

export function getTopN<T extends Results>(results: T[], n: number): T[] {
  const map: Record<number, boolean> = {}
  const topN = []
  for (const result of results) {
    if (map[result.userId]) {
      continue
    }
    map[result.userId] = true
    topN.push(result)
  }
  setRanksOnly(topN)
  if (topN.length <= n) {
    return topN
  }
  const nth = topN[n - 1]
  const nthAverage = nth.average
  const nthBest = nth.best
  const nthIndex = topN.findIndex(r => r.average > nthAverage || (r.average === nthAverage && r.best > nthBest))
  return topN.slice(0, nthIndex)
}
