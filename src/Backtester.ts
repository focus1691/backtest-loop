import { Observable, Subject } from 'rxjs'
import { IBacktesterConfig, PriceEvent } from './lib/types'
import { Exchange, INTERVALS, KlineIntervalMs } from '@tsquant/exchangeapi/dist/lib/constants'
import { ICandle, IFundingRateValue, IOpenInterestValue } from '@tsquant/exchangeapi/dist/lib/types'

export type SymbolIntervalData = {
  [symbol: string]: {
    [interval: string]: (IFundingRateValue | ICandle | IOpenInterestValue)[]
  }
}

type SymbolIntervalIndexes = {
  [symbol: string]: {
    [interval: string]: { curr: number; start: number; end: number; isComplete: boolean }
  }
}

export class Backtester {
  private symbol: string
  private symbolIntervalData: SymbolIntervalData
  private intervalBounds: SymbolIntervalIndexes
  private currTime: Date = new Date()
  private backtestIterator: Generator<unknown, void, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/ban-types
  private acknowledgementPromiseResolve: Function | null = null
  private eventEmitted: boolean = false
  private closedCandles$: Subject<ICandle> = new Subject()
  private priceEvents$: Subject<PriceEvent> = new Subject()

  constructor(config: IBacktesterConfig) {
    this.symbol = config.symbol
    this.symbolIntervalData = config.data
    this.intervalBounds = this.setupIntervalBounds(config.symbol, config.data)
    this.determineStartAndEndTimes(config.symbol)
  }

  get closedCandles(): Observable<ICandle> {
    return this.closedCandles$.asObservable()
  }

  get priceEvents(): Observable<PriceEvent> {
    return this.priceEvents$.asObservable()
  }

  // Find the start and end times based on the candles data
  private determineStartAndEndTimes(symbol: string) {
    const oneMinuteCandles: ICandle[] = this.symbolIntervalData[symbol][INTERVALS.ONE_MINUTE] as ICandle[]

    if (oneMinuteCandles && oneMinuteCandles.length > 0) {
      const symbolStartTime = new Date(oneMinuteCandles[0].openTime) // First candle's open time

      // Set currTime to 1 minute before startTime
      this.currTime = new Date(symbolStartTime.getTime() - KlineIntervalMs['1m'])
    } else {
      throw new Error('Could not determine start and end')
    }
  }

  // Initialize indexes for each symbol and interval
  private setupIntervalBounds(symbol: string, symbolIntervalData: SymbolIntervalData) {
    const bounds: SymbolIntervalIndexes = { [symbol]: {} }

    for (const interval in symbolIntervalData[symbol]) {
      bounds[symbol][interval] = { curr: 0, start: 0, end: 0, isComplete: false }
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
            const priceEvent: PriceEvent = { symbol: this.symbol, exchange: Exchange.BINANCE, price: candle.close }
            this.priceEvents$.next(priceEvent)
          } else {
            this.closedCandles$.next(candle)
          }

          this.eventEmitted = true

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
      // If an event was emitted in the previous step, wait for acknowledgement
      if (this.eventEmitted) {
        yield new Promise((resolve) => {
          this.acknowledgementPromiseResolve = resolve
        })
        // Don't reset the flag here; it should be reset in acknowledgeEventHandling
      }

      // Only proceed with stepForward if there's no pending event acknowledgment
      if (!this.eventEmitted) {
        this.stepForward()

        // Yield control back after stepping forward to allow for potential acknowledgement in the next iteration
        yield
      }
    }
  }

  acknowledgeEventHandling() {
    if (this.acknowledgementPromiseResolve) {
      this.acknowledgementPromiseResolve()
      this.acknowledgementPromiseResolve = null
      this.eventEmitted = false // Reset the flag after acknowledgement
    }
    return this
  }

  // Method to control the progression of the backtest
  runNextStep() {
    if (!this.backtestIterator) {
      this.backtestIterator = this.backtestGenerator()
    }
    return this.backtestIterator.next().value
  }
}
