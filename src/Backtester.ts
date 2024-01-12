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
  private config: IBacktesterConfig

  private symbol: string
  private candles: SymbolIntervalData
  private intervalBounds: SymbolIntervalIndexes
  private currTime: Date = new Date()
  private didInitCandles: boolean = false

  // Generator stuff
  private backtestIterator: Generator<unknown, void, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/ban-types
  private acknowledgementPromiseResolve: Function | null = null

  private eventEmitted: boolean = false

  // Websocket type events
  private closedCandles$: Subject<ICandle> = new Subject()
  private priceEvents$: Subject<PriceEvent> = new Subject()

  constructor(config?: IBacktesterConfig) {
    this.config = {
      intervalToFindStartAndEndTimes: INTERVALS.ONE_MINUTE,
      ...config
    }
  }

  get closedCandles(): Observable<ICandle> {
    return this.closedCandles$.asObservable()
  }

  get priceEvents(): Observable<PriceEvent> {
    return this.priceEvents$.asObservable()
  }

  init(symbol: string, candles: SymbolIntervalData) {
    if (this.didInitCandles) {
      console.warn('Backtester is running and has already been initialised with candles')
      return
    }

    if (!symbol) {
      throw new Error('Symbol required')
    }
    if (!candles) {
      throw new Error('Candles are undefined or null')
    }

    if (!(symbol in candles)) {
      throw new Error(`No data for symbol: ${this.symbol}`)
    }

    const interval = this.config.intervalToFindStartAndEndTimes
    if (!interval) {
      throw new Error('Interval is undefined')
    }

    if (!(interval in candles[symbol])) {
      throw new Error(`No data for interval: ${interval} for symbol: ${this.symbol}`)
    }

    const candleData = candles[symbol][interval]
    if (!candleData || candleData.length === 0) {
      throw new Error(`No candle data for interval: ${interval} and symbol: ${this.symbol}`)
    }

    this.symbol = symbol
    this.candles = candles

    this.didInitCandles = true

    this.intervalBounds = this.setupIntervalBounds(symbol, candles)
    this.determineStartAndEndTimes(symbol)

    return this
  }

  // Find the start and end times based on the candles data
  private determineStartAndEndTimes(symbol: string) {
    const oneMinuteCandles: ICandle[] = this.candles[symbol][this.config.intervalToFindStartAndEndTimes] as ICandle[]

    if (oneMinuteCandles && oneMinuteCandles.length > 0) {
      const symbolStartTime = new Date(oneMinuteCandles[0].openTime) // First candle's open time

      // Set currTime to 1 minute before startTime
      this.currTime = new Date(symbolStartTime.getTime() - KlineIntervalMs['1m'])
    } else {
      throw new Error('Could not determine start and end')
    }
  }

  // Initialize indexes for each symbol and interval
  private setupIntervalBounds(symbol: string, candles: SymbolIntervalData) {
    const bounds: SymbolIntervalIndexes = { [symbol]: {} }

    for (const interval in candles[symbol]) {
      bounds[symbol][interval] = { curr: 0, start: 0, end: 0, isComplete: false }
    }
    return bounds
  }

  stepForward() {
    this.currTime = new Date(this.currTime.getTime() + KlineIntervalMs['1m'])

    for (const interval in this.candles[this.symbol]) {
      const candles = this.candles[this.symbol][interval]

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
    for (const interval in this.candles[this.symbol]) {
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
    if (!this.didInitCandles) {
      console.log('Backtest not initialised with data. Call init() before calling this method.')
    }
    if (!this.backtestIterator) {
      this.backtestIterator = this.backtestGenerator()
    }
    return this.backtestIterator.next().value
  }
}
