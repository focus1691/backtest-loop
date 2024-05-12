import { Observable, Subject } from 'rxjs'
import { IBacktestStatus } from './lib/constants/settings'
import { IBacktestConfig, IBacktestDataset, ITimeseries, ITimeSeriesEvent } from './lib/types'
import { convertToTimestamp } from './utils/normalise'
import { isValidTimeseries } from './utils/validate'

export class BacktestLoop {
  private config: IBacktestConfig

  private timeseries: Map<string, ITimeseries> = new Map()

  private testStartTimestamp
  private testEndTimestamp
  private currentSimulationTime: number = new Date().getTime()
  private isBacktestInitialised: boolean = false

  private backtestIterator: Generator<unknown, void, unknown> | undefined

  private timeseriesEventStream$: Subject<ITimeSeriesEvent[]> = new Subject()
  private statusEventStream$: Subject<string> = new Subject()

  public isActive: boolean = false

  constructor(config?: IBacktestConfig) {
    this.config = {
      timeseries: new Map(),
      ...config
    }
  }

  get timeseriesEvents(): Observable<ITimeSeriesEvent[]> {
    return this.timeseriesEventStream$.asObservable()
  }

  get status(): Observable<string> {
    return this.statusEventStream$.asObservable()
  }

  start() {
    if (this.isBacktestInitialised) {
      console.warn('Backtester has already started')
      return
    }

    for (const [, timeseries] of this.timeseries) {
      if (!isValidTimeseries(timeseries.data, timeseries.tsKey)) {
        return
      }
    }

    this.statusEventStream$.next(IBacktestStatus.OPEN)
    this.isBacktestInitialised = true
    this.isActive = true
  }

  terminate() {
    this.clearState()
    this.statusEventStream$.next(IBacktestStatus.CLOSE)
  }

  private clearState() {
    this.timeseries.clear()
    this.isBacktestInitialised = false
    this.testStartTimestamp = null
    this.testEndTimestamp = null
    this.isActive = false
  }

  setData(dataset: IBacktestDataset) {
    for (const timeseries of dataset?.timeseries) {
      const { tsKey, type, data, requestMoreData, cursor }: ITimeseries = timeseries
      if (isValidTimeseries(timeseries?.data, tsKey)) {
        this.determineStartAndEndTimes(data[0][tsKey], data[data.length - 1][tsKey])
        this.timeseries.set(type, { isComplete: false, data, type, tsKey, requestMoreData, cursor })
      } else {
        throw new Error('Invalid timeseries: Missing or incorrect type/data or timestamp')
      }
    }
    return this
  }

  setStartTime(timestamp: number): void {
    if (!this.testStartTimestamp || timestamp < this.testStartTimestamp) {
      this.testStartTimestamp = timestamp
    }
  }

  setEndTime(timestamp: number): void {
    if (!this.testEndTimestamp || timestamp < this.testEndTimestamp) {
      this.testEndTimestamp = timestamp
    }
  }

  private determineStartAndEndTimes(start: string | number | Date, end: string | number | Date): void {
    if (this.config.stepSize) {
      this.setStartTime(convertToTimestamp(start))
      this.setEndTime(convertToTimestamp(end))

      this.currentSimulationTime = this.testStartTimestamp - this.config.stepSize
    }
  }

  processNextTimeStep(): ITimeSeriesEvent[] {
    const timeseriesEvents: ITimeSeriesEvent[] = []

    // Increment current time
    if (this.config.stepSize) {
      this.currentSimulationTime += this.config.stepSize
    }

    // Loop through each type in timeseries
    this.timeseries.forEach((timeseries: ITimeseries) => {
      if (!timeseries.isComplete && timeseries.data.length) {
        const timeseriesField = timeseries.data[0]
        const tsKey: string = timeseries.tsKey
        const startTimestampValue = timeseriesField[tsKey]
        const type: string = timeseries.type ?? (timeseriesField?.type as string) ?? 'unknown'

        // Convert both timeseriesTimestamp and this.currentSimulationTime to milliseconds
        const timeseriesTime = typeof startTimestampValue === 'number' ? startTimestampValue : new Date(startTimestampValue).getTime()

        if (this.config.stepSize) {
          // Check if the timestamp matches current time
          if (timeseriesTime === this.currentSimulationTime) {
            timeseriesEvents.push({ timestamp: this.currentSimulationTime, type, data: timeseriesField })
            timeseries.data.shift()
          } else if (this.currentSimulationTime > timeseriesTime) {
            timeseries.data.shift()
          }
        } else {
          // For non-time-bound backtesting, add the next data item
          timeseriesEvents.push({ timestamp: timeseriesTime, type, data: timeseriesField })

          // Also include adjacent data with the same timestamp
          while (timeseries.data.length) {
            const nextItem = timeseries.data[0]
            const nextTimestamp = typeof nextItem[tsKey] === 'number' ? nextItem[tsKey] : new Date(nextItem[tsKey] as string).getTime()
            const type: string = timeseries.type ?? (nextItem?.type as string) ?? 'unknown'
            if (nextTimestamp !== timeseriesTime) {
              break
            }
            timeseriesEvents.push({ timestamp: nextTimestamp, type, data: nextItem })
            timeseries.data.shift()
          }
        }

        // Check if end of data array is reached
        if (timeseries.data.length === 0 && !timeseries.requestMoreData) {
          timeseries.isComplete = true
        }
      }
    })

    if (timeseriesEvents.length > 0) {
      this.timeseriesEventStream$.next(timeseriesEvents)
    }

    return timeseriesEvents
  }

  updateTimeseriesProperty(type: string, fieldName: string, value: any): void {
    const timeseries = this.timeseries.get(type)

    if (timeseries) {
      timeseries[fieldName] = value
    }
  }

  hasMoreDataToProcess(): boolean {
    for (const [, timeseries] of this.timeseries) {
      if (!timeseries.isComplete) return true
    }
    return false
  }

  getTimeseries(type: string): ITimeseries | undefined {
    return this.timeseries.get(type)
  }

  private *backtestGenerator() {
    while (this.hasMoreDataToProcess()) {
      yield this.processNextTimeStep()
    }
    this.isActive = false
    this.statusEventStream$.next(IBacktestStatus.CLOSE)
  }

  runNextStep() {
    if (!this.isBacktestInitialised) {
      return null
    }
    if (!this.backtestIterator) {
      this.backtestIterator = this.backtestGenerator()
    }
    return this.backtestIterator.next().value
  }
}
