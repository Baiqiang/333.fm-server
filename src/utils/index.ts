import { createHash } from 'crypto'
import dayjs from 'dayjs'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import weekOfYear from 'dayjs/plugin/weekOfYear'
import { Algorithm, Cube } from 'insertionfinder'

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

export function getCubieCube(scramble: string) {
  const cube = new Cube()
  cube.twist(new Algorithm(scramble))
  return {
    corners: cube.getRawCorners(),
    edges: cube.getRawEdges(),
    placement: cube.placement,
  }
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
    if (bestCube.isSolved()) {
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
    // check if moves > 80
    if (moves > 8000) {
      moves = DNF
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

export function setRanksOnly<T extends Rankable>(results: T[], rankKeys: string[] = ['average', 'best']): T[] {
  results.forEach((result, index) => {
    const previous = results[index - 1]
    result.rank = index + 1
    if (previous && rankKeys.every(key => result[key] === previous[key])) {
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

export function groupBy<T>(array: T[], key: string): T[] {
  const map: Record<string, boolean> = {}
  const grouped = []
  for (const item of array) {
    if (map[item[key]]) {
      continue
    }
    map[item[key]] = true
    grouped.push(item)
  }
  return grouped
}

export function getTopN<T extends Rankable>(results: T[], n: number, rankKeys: string[] = ['average', 'best']): T[] {
  setRanksOnly(results, rankKeys)
  if (results.length <= n) {
    return results
  }
  return results.filter(result => result.rank <= n)
}

export function getTopDistinctN<T extends Rankable>(
  results: T[] | Record<string, T>,
  n: number,
  rankKeys: string[] = ['average', 'best'],
  sortDesc: boolean = false,
  groupKey = 'userId',
): T[] {
  if (!Array.isArray(results)) {
    results = Object.values(results)
  }
  results.sort((a, b) => {
    for (const key of rankKeys) {
      if (a[key] > b[key]) {
        return 1
      } else if (a[key] < b[key]) {
        return -1
      }
    }
    return 0
  })
  if (sortDesc) {
    results.reverse()
  }
  const ret = groupBy(results, groupKey)
  return getTopN(ret, n, rankKeys)
}

export interface Rankable {
  rank: number
}
