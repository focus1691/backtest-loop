import { Subject } from 'rxjs'

export enum INTERVALS {
  ONE_MINUTE = '1m',
  THREE_MINUTES = '3m',
  FIVE_MINUTES = '5m',
  FIFTEEN_MINUTES = '15m',
  THIRTY_MINUTES = '30m',
  ONE_HOUR = '1h',
  TWO_HOURS = '2h',
  THREE_HOURS = '3h',
  FOUR_HOURS = '4h',
  SIX_HOURS = '6h',
  EIGHT_HOURS = '8h',
  TWELVE_HOURS = '12h',
  ONE_DAY = '1d',
  THREE_DAYS = '3d',
  ONE_WEEK = '1w',
  ONE_MONTH = '1M',
  THREE_MONTHS = '3M',
  SIX_MONTHS = '6M',
  ONE_YEAR = '1y',
  TWO_YEARS = '2y'
}

export interface ICandle {
  symbol: string
  interval: string
  openTime: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  closeTime: Date
}

export interface IFundingRateCandle {
  interval: string
  fundingRate: number
  timestamp: number
}

export interface IOpenInterestCandle {
  interval: string
  openInterest: number
  timestamp: number
}

export type SymbolIntervalData = {
  [symbol: string]: {
    [interval: string]: (IFundingRateCandle | ICandle | IOpenInterestCandle)[]
  }
}

export enum KlineIntervals {
  ONE_MIN = '1m',
  FIVE_MINS = '5m',
  FIFTHTEEN_MINS = '15m',
  THIRTY_MINS = '30m',
  ONE_HOUR = '1h',
  TWO_HOURS = '2h',
  FOUR_HOURS = '4h',
  SIX_HOURS = '6h',
  TWELVE_HOURS = '12h',
  ONE_DAY = '1d',
  ONE_WEEK = '1w',
  ONE_MONTH = '1M'
}

const ONE_MINUTE_MS = 60 * 1000
const ONE_HOUR_MS = ONE_MINUTE_MS * 60

const KlineIntervalMs: Record<KlineIntervals, number> = {
  [KlineIntervals.ONE_MIN]: ONE_MINUTE_MS,
  [KlineIntervals.FIVE_MINS]: ONE_MINUTE_MS * 5,
  [KlineIntervals.FIFTHTEEN_MINS]: ONE_MINUTE_MS * 15,
  [KlineIntervals.THIRTY_MINS]: ONE_MINUTE_MS * 30,
  [KlineIntervals.ONE_HOUR]: ONE_HOUR_MS,
  [KlineIntervals.TWO_HOURS]: ONE_HOUR_MS * 2,
  [KlineIntervals.FOUR_HOURS]: ONE_HOUR_MS * 4,
  [KlineIntervals.SIX_HOURS]: ONE_HOUR_MS * 6,
  [KlineIntervals.TWELVE_HOURS]: ONE_HOUR_MS * 12,
  [KlineIntervals.ONE_DAY]: ONE_HOUR_MS * 24,
  [KlineIntervals.ONE_WEEK]: ONE_HOUR_MS * 24 * 7,
  [KlineIntervals.ONE_MONTH]: 2591999999 + 1 // 1 month interval size used by binance 1569887999999 - 1567296000000
}

type SymbolIntervalIndexes = {
  [symbol: string]: {
    [interval: string]: { curr: number; start: number; end: number; isComplete: boolean }
  }
}

export enum Exchange {
  BINANCE = 'binance',
  BITMEX = 'bitmex',
  BYBIT = 'bybit'
}

export interface PriceUpdate {
  exchange: Exchange
  symbol: string
  price: number
}

export type PriceUpdates = PriceUpdate[]

export class Backtester {
  private symbol: string
  private symbolIntervalData: SymbolIntervalData
  private intervalBounds: SymbolIntervalIndexes
  private startTime: Date | undefined
  private endTime: Date | undefined
  private currTime: Date | undefined
  private backtestIterator: Generator<unknown, void, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/ban-types
  private acknowledgementPromiseResolve: Function | null = null
  private eventEmitted: boolean = false
  private closedCandles$: Subject<ICandle> = new Subject()
  private priceUpdates$: Subject<PriceUpdates> = new Subject()

  constructor(symbol: string, symbolIntervalData: SymbolIntervalData) {
    this.symbol = symbol
    this.symbolIntervalData = symbolIntervalData
    this.intervalBounds = this.setupIntervalBounds(symbol, symbolIntervalData)
    this.determineStartAndEndTimes(symbol)
  }

  // Find the start and end times based on the candles data
  private determineStartAndEndTimes(symbol: string) {
    const oneMinuteCandles: ICandle[] = this.symbolIntervalData[symbol][INTERVALS.ONE_MINUTE] as ICandle[]

    if (oneMinuteCandles && oneMinuteCandles.length > 0) {
      const symbolStartTime = oneMinuteCandles[0].openTime // First candle's open time
      const symbolEndTime = oneMinuteCandles[oneMinuteCandles.length - 1].openTime // Last candle's open time

      if (this.startTime === null || symbolStartTime < this.startTime) {
        this.startTime = symbolStartTime
      }

      if (this.endTime === null || symbolEndTime > this.endTime) {
        this.endTime = symbolEndTime
      }

      // Set currTime to 1 minute before startTime
      this.currTime = new Date(this.startTime.getTime() - KlineIntervalMs['1m'])
    } else {
      throw new Error('Could not determine start and end')
    }
  }

  // Initialize indexes for each symbol and interval
  private setupIntervalBounds(symbol: string, symbolIntervalData: SymbolIntervalData) {
    const bounds = { [symbol]: {} }

    for (const interval in symbolIntervalData[symbol]) {
      bounds[symbol][interval] = { curr: 0, start: 0, end: 0, isComplete: Boolean(symbolIntervalData[symbol][interval]?.length) }
    }
    return bounds
  }

  stepForward() {
    this.currTime = new Date(this.currTime.getTime() + KlineIntervalMs['1m'])

    for (const interval in this.symbolIntervalData[this.symbol]) {
      const candles = this.symbolIntervalData[this.symbol][interval]

      // Check if the current time is the time for the next candle in this interval
      if (!this.intervalBounds[this.symbol][interval].isComplete) {
        const candle: ICandle = candles[this.intervalBounds[this.symbol][interval].curr] as ICandle
        const nextCandleTime = new Date(candle.openTime)

        if (this.currTime >= nextCandleTime) {
          // One minute candles are used for price events
          if (interval === INTERVALS.ONE_MINUTE) {
            const priceUpdates: PriceUpdates = [{ symbol: this.symbol, exchange: Exchange.BINANCE, price: candle.close }]
            this.priceUpdates$.next(priceUpdates)
            this.eventEmitted = true
          } else {
            this.closedCandles$.next(candle)
            this.eventEmitted = true
          }

          this.intervalBounds[this.symbol][interval].curr++

          this.intervalBounds[this.symbol][interval].isComplete = this.intervalBounds[this.symbol][interval].curr >= candles.length
        }
      }
    }
  }

  shouldContinueBacktest(): boolean {
    for (const interval in this.symbolIntervalData[this.symbol]) {
      if (!this.intervalBounds[this.symbol][interval].isComplete) return true
    }
    return false
  }

  *backtestGenerator() {
    while (this.shouldContinueBacktest()) {
      // Wait for acknowledgement if an event was emitted in the previous step
      if (this.eventEmitted) {
        yield new Promise((resolve) => {
          this.acknowledgementPromiseResolve = resolve
        })
        this.eventEmitted = false // Reset the flag after acknowledgement
      }

      // Perform the next step forward only after the above acknowledgement is complete
      this.stepForward()

      // Yield control back after stepping forward to allow for potential acknowledgement in the next iteration
      yield
    }
  }

  acknowledgeEventHandling() {
    if (this.acknowledgementPromiseResolve) {
      this.acknowledgementPromiseResolve()
      this.acknowledgementPromiseResolve = null
    }
  }

  // Method to control the progression of the backtest
  runNextStep() {
    if (!this.backtestIterator) {
      this.backtestIterator = this.backtestGenerator()
    }
    return this.backtestIterator.next().value
  }
}
