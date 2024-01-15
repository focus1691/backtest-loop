import { INTERVALS } from '@tsquant/exchangeapi/dist/lib/constants'

export interface IBacktesterConfig {
  typeBasedTimeIntervals: Map<string, ITimeInterval>
}

export interface ITimeInterval {
  start: number
  end: number
}
