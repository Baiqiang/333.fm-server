import * as XLSX from 'xlsx'

interface MetaData {
  [key: string]: unknown
  ELO: number[]
}

interface MatchResult {
  player1Score: number
  player2Score: number
}

export class EloCalculator {
  private metaData: MetaData
  private weeks: number[][][]

  constructor(inputFile: string) {
    const { metaData, weeks } = this.readData(inputFile)
    this.metaData = metaData
    this.weeks = weeks
  }

  private readData(inputFile: string): { metaData: MetaData; weeks: number[][][] } {
    // Read Excel file
    const workbook = XLSX.readFile(inputFile)
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][]

    // Separate metadata and match data
    const metaData = {
      ...data.slice(0, 3).reduce(
        (acc, row) => {
          row.forEach((cell, index) => {
            if (!acc[index]) acc[index] = []
            acc[index].push(cell)
          })
          return acc
        },
        {} as { [key: string]: unknown[] },
      ),
      ELO: data.slice(0, 3).map(row => (row[2] as number) || 1500), // Default ELO is 1500
    }

    // Process match data
    const dataColumns = data.slice(3)
    const numCols = dataColumns[0].length
    const weeks = []

    for (let i = 0; i < numCols; i += 3) {
      const weekData = dataColumns.map(row => [row[i], row[i + 1], row[i + 2]])
      weeks.push(weekData)
    }

    return { metaData, weeks }
  }

  private calculateMatch(player1: number[], player2: number[]): MatchResult {
    let score1 = 0
    for (let i = 0; i < 3; i++) {
      if (player1[i] < player2[i]) {
        score1 += 1
      } else if (player1[i] === player2[i]) {
        score1 += 0.5
      }
    }

    if (score1 > 1.5) {
      return { player1Score: 1, player2Score: 0 }
    } else if (score1 === 1.5) {
      return { player1Score: 0.5, player2Score: 0.5 }
    } else {
      return { player1Score: 0, player2Score: 1 }
    }
  }

  private calculateScores(solvesList: number[][]): number[] {
    const scoreList = new Array(solvesList.length).fill(0)

    for (let i = 0; i < solvesList.length; i++) {
      for (let j = i + 1; j < solvesList.length; j++) {
        const { player1Score, player2Score } = this.calculateMatch(solvesList[i], solvesList[j])
        scoreList[i] += player1Score
        scoreList[j] += player2Score
      }
    }

    const coeff = 1 / (solvesList.length - 1)
    return scoreList.map(score => coeff * score)
  }

  private updateElo(eloList: number[], scoreList: number[], k: number = 10): number[] {
    const newEloList: number[] = []
    const sumElos = eloList.reduce((a, b) => a + b, 0)
    const numberOfOpponents = eloList.length - 1

    for (let i = 0; i < eloList.length; i++) {
      const playerElo = eloList[i]
      const avgOpponentElo = (sumElos - playerElo) / numberOfOpponents
      const expectedScore = 1 / (1 + Math.pow(10, (avgOpponentElo - playerElo) / 400))
      const newElo = Math.round(playerElo + k * (scoreList[i] - expectedScore) * numberOfOpponents)
      newEloList.push(newElo)
    }

    return newEloList
  }

  public updateWeeks(numberOfWeeks: number): number[] {
    let currentEloList = [...this.metaData.ELO]

    for (let i = 0; i < numberOfWeeks; i++) {
      const currentWeek = this.weeks[i]

      const scoreList = this.calculateScores(currentWeek)
      currentEloList = this.updateElo(currentEloList, scoreList)
    }

    return currentEloList
  }
}

// 使用示例
// const calculator = new EloCalculator('S5 Week 8.ods')
// calculator.updateWeeks(1, 'S5 Week 9.ods')
