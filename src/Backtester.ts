import { Observable, Subject } from 'rxjs'
import { IBacktesterConfig, ITimeInterval, PriceEvent } from './lib/types'
import { Exchange, INTERVALS, KlineIntervalMs } from '@tsquant/exchangeapi/dist/lib/constants'

interface ITimeseriesField {
  timestamp?: number
}

interface ITimeseriesColumn {
  type: string
  data: ITimeseriesField[]
}

interface IDataset {
  timeseries: ITimeseriesColumn[]
  prices: ITimeseriesField[]
}

export class Backtester {
  private config: IBacktesterConfig

  private typeBasedTimeIntervals: Map<string, ITimeInterval> = new Map()

  // private symbol: string
  // private candles: SymbolIntervalData
  // private typeBasedTimeIntervals: SymbolIntervalIndexes
  private currTime: Date = new Date()
  private didInitCandles: boolean = false

  // Generator stuff
  private backtestIterator: Generator<unknown, void, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/ban-types
  private acknowledgementPromiseResolve: Function | null = null

  private eventEmitted: boolean = false

  // Websocket type events
  // private closedCandles$: Subject<ICandle> = new Subject()
  // private priceEvents$: Subject<PriceEvent> = new Subject()

  // private closedCandles$: Subject<ICandle> = new Subject()
  private priceEvents$: Subject<ITimeseriesField> = new Subject()
  private dataEvent$: Subject<ITimeseriesField> = new Subject()

  constructor(config?: IBacktesterConfig) {
    this.config = {
      typeBasedTimeIntervals: new Map(),
      ...config
    }
  }

  get priceEvents(): Observable<ITimeseriesField> {
    return this.priceEvents$.asObservable()
  }

  setData(data: IDataset) {
    if (this.didInitCandles) {
      console.warn('Backtester is running and has already been initialised')
      return
    }

    if (Object.keys(data.timeseries).length <= 0) {
      throw new Error('No dataset passed')
    }

    for (const timeseries of data.timeseries) {
      console.log(timeseries)
    }

    // const interval = this.config.intervalToFindStartAndEndTimes
    // if (!interval) {
    //   throw new Error('Interval is undefined')
    // }

    if (!(interval in candles[symbol])) {
      throw new Error(`No data for interval: ${interval} for symbol: ${this.symbol}`)
    }

    const candleData = candles[symbol][interval]
    if (!candleData || candleData.length === 0) {
      throw new Error(`No candle data for interval: ${interval} and symbol: ${this.symbol}`)
    }

    this.symbol = symbol
    this.data = data

    this.didInitCandles = true

    this.typeBasedTimeIntervals = this.setupIntervalBounds(symbol, candles)
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
      if (!this.typeBasedTimeIntervals[this.symbol][interval].isComplete) {
        const candle: ICandle = candles[this.typeBasedTimeIntervals[this.symbol][interval].curr] as ICandle
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

          this.typeBasedTimeIntervals[this.symbol][interval].curr++

          this.typeBasedTimeIntervals[this.symbol][interval].isComplete = this.typeBasedTimeIntervals[this.symbol][interval].curr >= candles.length
        }
      }
    }
  }

  shouldContinueBacktest(): boolean {
    for (const interval in this.candles[this.symbol]) {
      if (!this.typeBasedTimeIntervals[this.symbol][interval].isComplete) return true
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

  releaseNextTick() {
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
