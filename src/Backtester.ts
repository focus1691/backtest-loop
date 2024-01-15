import { Observable, Subject } from 'rxjs'
import { IBacktesterConfig, IDataset, ITimeInterval, ITimeseriesField, PriceEvent } from './lib/types'
import { isValidTimeseries } from './utils/validate'
import { Exchange, INTERVALS, KlineIntervalMs } from '@tsquant/exchangeapi/dist/lib/constants'
import { ICandle } from '@tsquant/exchangeapi/dist/lib/types'

export class Backtester {
  private config: IBacktesterConfig

  private typeBasedTimeIntervals: Map<string, ITimeInterval> = new Map()

  private currTime: Date = new Date()
  private didInitCandles: boolean = false

  // Generator stuff
  private backtestIterator: Generator<unknown, void, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/ban-types
  private acknowledgementPromiseResolve: Function | null = null

  private eventEmitted: boolean = false

  // Websocket type events
  private priceEvents$: Subject<ITimeseriesField> = new Subject()
  private dataEvent$: Subject<ITimeseriesField> = new Subject()

  constructor(config?: IBacktesterConfig) {
    this.config = {
      typeBasedTimeIntervals: new Map(),
      ...config
    }
  }

  get dataEvents(): Observable<ITimeseriesField> {
    return this.dataEvent$.asObservable()
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
      if (typeof timeseries?.type !== 'string' || !timeseries?.data?.length) {
        if (isValidTimeseries(timeseries)) {
          const start: number = timeseries.data[0].timestamp
          const end: number = timeseries.data[timeseries.data.length - 1].timestamp
          this.typeBasedTimeIntervals.set(timeseries.type, { start, end, isComplete: false, data: timeseries.data })
        } else {
          this.typeBasedTimeIntervals.clear()
          this.didInitCandles = false
          throw new Error('Invalid timeseries: Missing or incorrect type/data or timestamp')
        }
      }
    }

    this.didInitCandles = true

    return this
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
