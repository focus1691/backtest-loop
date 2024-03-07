import { Observable, Subject } from 'rxjs'
import { IBacktestStatus } from './lib/constants/settings'
import { IBacktestDataset, IBacktestSettings, IDataStream, IDataTypeStream, ITimeSeriesEvent } from './lib/types'
import { isValidTimeseries } from './utils/validate'
import { v4 } from 'uuid'

export class Backtester {
  private config: IBacktestSettings

  private dataStreams: Map<string, IDataStream> = new Map()

  private testStartTimestamp
  private testEndTimestamp
  private currentSimulationTime: number = new Date().getTime()
  private isBacktestInitialized: boolean = false

  // Generator stuff
  private backtestIterator: Generator<unknown, void, unknown> | undefined

  private timeseriesEventStream$: Subject<ITimeSeriesEvent[]> = new Subject()
  private statusEventStream$: Subject<string> = new Subject()

  constructor(config?: IBacktestSettings) {
    this.config = {
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

  start() {
    if (this.isBacktestInitialized) {
      console.warn('Backtester has already started')
      return
    }

    for (const [, dataStream] of this.dataStreams) {
      if (!isValidTimeseries(dataStream.data, dataStream.tsKey)) {
        return
      }
    }

    this.statusEventStream$.next(IBacktestStatus.OPEN)
    this.isBacktestInitialized = true
  }

  setData(dataset: IBacktestDataset) {
    if (this.isBacktestInitialized) {
      console.warn('Backtester is running and has already been initialised')
      return this
    }

    for (const timeseries of dataset?.timeseries) {
      const { tsKey, data }: IDataTypeStream = timeseries
      if (isValidTimeseries(timeseries?.data, tsKey)) {
        this.determineStartAndEndTimes(data[0][tsKey], data[data.length - 1][tsKey])
        this.dataStreams.set(v4(), { isComplete: false, index: 0, data: timeseries.data, type: timeseries.type, tsKey })
      } else {
        throw new Error('Invalid timeseries: Missing or incorrect type/data or timestamp')
      }
    }
    return this
  }

  private determineStartAndEndTimes(start: string | number, end: string | number): void {
    if (this.config.stepSize) {
      // Convert to numbers if they are date strings
      const startTimestamp = typeof start === 'number' ? start : new Date(start).getTime()
      const endTimestamp = typeof end === 'number' ? end : new Date(end).getTime()

      this.testStartTimestamp = Math.min(this.testStartTimestamp ?? startTimestamp)
      this.testEndTimestamp = Math.max(this.testEndTimestamp ?? endTimestamp)

      this.currentSimulationTime = this.testStartTimestamp - this.config.stepSize
      console.log(start, new Date(start).getTime())
    }
  }

  processNextTimeStep(): ITimeSeriesEvent[] {
    const dataEvents: ITimeSeriesEvent[] = []

    // Increment current time
    if (this.config.stepSize) {
      this.currentSimulationTime += this.config.stepSize
    }

    // Loop through each type in dataStreams
    this.dataStreams.forEach((datastream: IDataStream) => {
      if (!datastream.isComplete && datastream.index < datastream.data.length) {
        const timeseriesField = datastream.data[datastream.index]
        const tsKey: string = datastream.tsKey
        const startTimestampValue = timeseriesField[tsKey]
        const type: string = datastream.type ?? (timeseriesField?.type as string) ?? 'unknown'

        // Convert both timeseriesTimestamp and this.currentSimulationTime to milliseconds
        const timeseriesTime = typeof startTimestampValue === 'number' ? startTimestampValue : new Date(startTimestampValue).getTime()

        if (this.config.stepSize) {
          // Check if the timestamp matches current time
          if (timeseriesTime === this.currentSimulationTime) {
            dataEvents.push({ timestamp: this.currentSimulationTime, type, data: timeseriesField })
            // Move to the next index
            datastream.index++
          } else if (this.currentSimulationTime > timeseriesTime) {
            // Increment the index if it's behind the current time
            datastream.index++
          }
        } else {
          // For non-time-bound backtesting, add the next data item
          dataEvents.push({ timestamp: timeseriesTime, type, data: timeseriesField })
          datastream.index++

          // Also include adjacent data with the same timestamp
          while (datastream.index < datastream.data.length) {
            const nextItem = datastream.data[datastream.index]
            const nextTimestamp = typeof nextItem[tsKey] === 'number' ? nextItem[tsKey] : new Date(nextItem[tsKey] as string).getTime()
            const type: string = datastream.type ?? (nextItem?.type as string) ?? 'unknown'
            if (nextTimestamp !== timeseriesTime) {
              break
            }
            dataEvents.push({ timestamp: nextTimestamp, type, data: nextItem })
            datastream.index++
          }
        }

        // Check if end of data array is reached
        if (datastream.index >= datastream.data.length) {
          datastream.isComplete = true
        }
      }
    })

    if (dataEvents.length > 0) {
      this.timeseriesEventStream$.next(dataEvents)
    }

    return dataEvents
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
      yield this.processNextTimeStep()
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
