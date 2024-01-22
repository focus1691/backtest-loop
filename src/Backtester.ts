import { Observable, Subject } from 'rxjs'
import { IBacktestStatus } from './lib/constants/settings'
import { IBacktestDataset, IBacktestSettings, IDataStream, IDataTypeStream, ITimeSeriesEvent } from './lib/types'
import { isValidTimeseries } from './utils/validate'
import { KlineIntervalMs } from '@tsquant/exchangeapi/dist/lib/constants'
import { v4 } from 'uuid'

export class Backtester {
  private config: IBacktestSettings

  private dataStreams: Map<string, IDataStream> = new Map()

  private testStartTimestamp
  private testEndTimestamp
  private currentSimulationTime: Date = new Date()
  private isBacktestInitialized: boolean = false

  // Generator stuff
  private backtestIterator: Generator<unknown, void, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/ban-types
  private acknowledgementPromiseResolve: Function | null = null

  private eventEmitted: boolean = false
  private timeseriesEventStream$: Subject<ITimeSeriesEvent[]> = new Subject()
  private statusEventStream$: Subject<string> = new Subject()

  constructor(config?: IBacktestSettings) {
    this.config = {
      stepSize: KlineIntervalMs['1m'],
      dataStreams: new Map(),
      ...config
    }
  }

  get dataEvents(): Observable<ITimeSeriesEvent[]> {
    return this.timeseriesEventStream$.asObservable()
  }

  get status(): Observable<string> {
    return this.statusEventStream$.asObservable()
  }

  setData(dataset: IBacktestDataset) {
    if (this.isBacktestInitialized) {
      console.warn('Backtester is running and has already been initialised')
      return
    }

    for (const timeseries of dataset?.timeseries) {
      const { tsKey, data }: IDataTypeStream = timeseries
      if (isValidTimeseries(timeseries, tsKey)) {
        const startTimestampValue = data[0][tsKey]
        const endTimestampValue = data[data.length - 1][tsKey]

        // Convert to numbers if they are date strings
        const startTimestamp = typeof startTimestampValue === 'number' ? startTimestampValue : Date.parse(startTimestampValue)
        const endTimestamp = typeof endTimestampValue === 'number' ? endTimestampValue : Date.parse(endTimestampValue)

        this.testStartTimestamp = this.testStartTimestamp === null ? startTimestamp : Math.min(this.testStartTimestamp ?? startTimestamp, startTimestamp)
        this.testEndTimestamp = this.testEndTimestamp === null ? endTimestamp : Math.max(this.testEndTimestamp ?? endTimestamp, endTimestamp)

        this.dataStreams.set(v4(), { isComplete: false, index: 0, data: timeseries.data, type: timeseries.type, tsKey })
      } else {
        this.dataStreams.clear()
        this.isBacktestInitialized = false
        throw new Error('Invalid timeseries: Missing or incorrect type/data or timestamp')
      }
    }

    this.currentSimulationTime = new Date(this.testStartTimestamp - this.config.stepSize)
    this.isBacktestInitialized = true

    this.statusEventStream$.next(IBacktestStatus.OPEN)

    return this
  }

  processNextTimeStep(): ITimeSeriesEvent[] {
    // Increment current time
    this.currentSimulationTime = new Date(this.currentSimulationTime.getTime() + this.config.stepSize)
    const dataEvents: ITimeSeriesEvent[] = []

    // Loop through each type in dataStreams
    this.dataStreams.forEach((datastream: IDataStream) => {
      if (!datastream.isComplete) {
        // Check if the current index is within the range of data array
        if (datastream.index < datastream.data.length) {
          const timeseriesField = datastream.data[datastream.index]
          const tsKey: string = datastream.tsKey
          const startTimestampValue = timeseriesField[tsKey]

          // Convert both timeseriesTimestamp and this.currentSimulationTime to milliseconds
          const timeseriesTime = typeof startTimestampValue === 'number' ? startTimestampValue : Date.parse(startTimestampValue)
          const currTimeMillis = this.currentSimulationTime.getTime()

          // Check if the timestamp matches current time
          if (timeseriesTime === currTimeMillis) {
            dataEvents.push({ timestamp: currTimeMillis, type: datastream.type, data: timeseriesField })
            // Move to the next index
            datastream.index++
          } else if (currTimeMillis > timeseriesTime) {
            // Increment the index if it's behind the current time
            datastream.index++
          }

          // Check if end of data array is reached
          if (datastream.index >= datastream.data.length) {
            datastream.isComplete = true
          }
        }
      }
    })

    // Emit event if there are matching data events
    if (dataEvents.length > 0) {
      this.timeseriesEventStream$.next(dataEvents)
      this.eventEmitted = true
    }
    return dataEvents
  }

  releaseNextTick() {
    if (this.acknowledgementPromiseResolve) {
      this.acknowledgementPromiseResolve()
      this.acknowledgementPromiseResolve = null
      this.eventEmitted = false // Reset the flag after acknowledgement
    }
    return this
  }

  hasMoreDataToProcess(): boolean {
    // Loop through each entry in dataStreams
    for (const [, datastream] of this.dataStreams) {
      // Check if the datastream is not complete
      if (!datastream.isComplete) return true
    }
    return false
  }

  *backtestGenerator() {
    while (this.hasMoreDataToProcess()) {
      // If an event was emitted in the previous step, wait for acknowledgement
      if (this.eventEmitted) {
        yield new Promise((resolve) => {
          this.acknowledgementPromiseResolve = resolve
        })
        // Don't reset the flag here; it should be reset in acknowledgeEventHandling
      }

      // Only proceed with stepForward if there's no pending event acknowledgment
      if (!this.eventEmitted) {
        yield this.processNextTimeStep()
      }
    }
    this.statusEventStream$.next(IBacktestStatus.CLOSE)
  }

  // Method to control the progression of the backtest
  runNextStep() {
    if (!this.isBacktestInitialized) {
      console.log('Backtest not initialised with data. Call init() before calling this method.')
    }
    if (!this.backtestIterator) {
      this.backtestIterator = this.backtestGenerator()
    }
    return this.backtestIterator.next().value
  }
}
