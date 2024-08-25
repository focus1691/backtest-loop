import { Observable, Subject } from 'rxjs';
import { IBacktestStatus } from './lib/constants/settings';
import { IBacktestConfig, IBacktestDataset, ITimeseries, ITimeSeriesEvent } from './lib/types';
import { convertToTimestamp } from './utils/normalise';
import { isValidTimeseries } from './utils/validate';

export class BacktestLoop {
  // Configuration and State
  private config: IBacktestConfig;
  public isActive: boolean = false;
  private isBacktestInitialised: boolean = false;

  // Time Management
  private startTimestamp: number;
  private endTimestamp: number;
  private currentTime: number = new Date().getTime();

  // Timeseries Management
  private timeseries: Map<string, ITimeseries> = new Map();
  private timeseriesIterators: Map<string, IterableIterator<ITimeSeriesEvent>> = new Map();
  private nextEvents: Map<string, ITimeSeriesEvent | null> = new Map();

  // Event Streams
  private timeseriesEventStream$: Subject<ITimeSeriesEvent[]> = new Subject();
  private statusEventStream$: Subject<string> = new Subject();

  constructor(config?: IBacktestConfig) {
    this.config = {
      timeseries: new Map(),
      ...config
    };
  }

  get timeseriesEvents(): Observable<ITimeSeriesEvent[]> {
    return this.timeseriesEventStream$.asObservable();
  }

  get status(): Observable<string> {
    return this.statusEventStream$.asObservable();
  }

  start() {
    if (this.isBacktestInitialised) {
      console.warn('Backtester has already started');
      return;
    }

    for (const [, timeseries] of this.timeseries) {
      if (!isValidTimeseries(timeseries.data, timeseries.tsKey)) {
        return;
      }
    }

    this.initialiseIterators();
    this.statusEventStream$.next(IBacktestStatus.OPEN);
    this.isBacktestInitialised = true;
    this.isActive = true;
  }

  terminate() {
    this.clearState();
    this.statusEventStream$.next(IBacktestStatus.CLOSE);
  }

  private clearState() {
    this.timeseries.clear();
    this.timeseriesIterators.clear();
    this.nextEvents.clear();
    this.isBacktestInitialised = false;
    this.startTimestamp = 0;
    this.endTimestamp = 0;
    this.isActive = false;
  }

  setData(dataset: IBacktestDataset) {
    for (const timeseries of dataset?.timeseries) {
      const { tsKey, type, data, requestMoreData, cursor }: ITimeseries = timeseries;
      if (isValidTimeseries(data, tsKey)) {
        this.determineStartAndEndTimes(data[0][tsKey], data[data.length - 1][tsKey]);
        this.timeseries.set(type, { isComplete: false, data, type, tsKey, requestMoreData, cursor });
      } else {
        throw new Error('Invalid timeseries: Missing or incorrect type/data or timestamp');
      }
    }
    return this;
  }

  setStartTime(timestamp: number): void {
    if (!this.startTimestamp || timestamp < this.startTimestamp) {
      this.startTimestamp = timestamp;
    }
  }

  setEndTime(timestamp: number): void {
    if (!this.endTimestamp || timestamp > this.endTimestamp) {
      this.endTimestamp = timestamp;
    }
  }

  private determineStartAndEndTimes(start: string | number | Date, end: string | number | Date): void {
    if (this.config.stepSize) {
      this.setStartTime(convertToTimestamp(start));
      this.setEndTime(convertToTimestamp(end));
      this.currentTime = this.startTimestamp - this.config.stepSize;
    }
  }

  private *timeseriesGenerator(timeseries: ITimeseries): IterableIterator<ITimeSeriesEvent> {
    const { data, tsKey, type } = timeseries;
    for (const item of data) {
      const timestamp = convertToTimestamp(item[tsKey]);
      yield { timestamp, type, data: item };
    }
  }

  private initialiseIterators() {
    for (const [type, timeseries] of this.timeseries) {
      this.resetIterator(type, timeseries);
    }
  }

  private resetIterator(type: string, timeseries: ITimeseries) {
    const iterator = this.timeseriesGenerator(timeseries);
    this.timeseriesIterators.set(type, iterator);
    const nextValue = iterator.next();
    this.nextEvents.set(type, nextValue.done ? null : nextValue.value);
  }

  processNextTimeStep(): ITimeSeriesEvent[] {
    const timeseriesEvents: ITimeSeriesEvent[] = [];

    if (this.config.stepSize) {
      this.currentTime += this.config.stepSize;
    }

    for (const [type, nextEvent] of this.nextEvents) {
      if (nextEvent) {
        const timeseries = this.timeseries.get(type);
        if (this.config.stepSize) {
          if (nextEvent.timestamp === this.currentTime) {
            timeseriesEvents.push(nextEvent);
            this.advanceIterator(type);
          } else if (this.currentTime > nextEvent.timestamp) {
            this.advanceIterator(type);
          }
        } else {
          // For non-time-bound backtesting
          timeseriesEvents.push(nextEvent);
          this.advanceIterator(type);

          // Include adjacent data with the same timestamp
          let adjacentEvent = this.nextEvents.get(type);
          while (adjacentEvent && adjacentEvent.timestamp === nextEvent.timestamp) {
            timeseriesEvents.push(adjacentEvent);
            this.advanceIterator(type);
            adjacentEvent = this.nextEvents.get(type);
          }
        }

        // Check for completion
        if (this.nextEvents.get(type) === null && timeseries && !timeseries.requestMoreData) {
          timeseries.isComplete = true;
        }
      }
    }

    if (timeseriesEvents.length > 0) {
      this.timeseriesEventStream$.next(timeseriesEvents);
    }

    return timeseriesEvents;
  }

  private advanceIterator(type: string) {
    const iterator = this.timeseriesIterators.get(type);
    if (!iterator) {
      console.debug(`No iterator found for type: ${type}`);
      this.nextEvents.set(type, null);
      return;
    }

    const nextValue = iterator.next();
    this.nextEvents.set(type, nextValue.done ? null : nextValue.value);
  }

  updateTimeseriesProperty(type: string, fieldName: string, value: any): void {
    const timeseries = this.timeseries.get(type);
    if (timeseries) {
      timeseries[fieldName] = value;
      if (fieldName === 'data') {
        this.resetIterator(type, timeseries);
      }
    }
  }

  hasMoreDataToProcess(): boolean {
    for (const [, timeseries] of this.timeseries) {
      if (!timeseries.isComplete) return true;
    }
    return false;
  }

  getTimeseries(type: string): ITimeseries | undefined {
    return this.timeseries.get(type);
  }

  isTimeseriesIteratorComplete(type: string): boolean {
    const nextEvent = this.nextEvents.get(type);
    return nextEvent === null;
  }

  runNextStep() {
    if (!this.isBacktestInitialised) {
      return null;
    }
    if (this.hasMoreDataToProcess()) {
      return this.processNextTimeStep();
    }
    this.isActive = false;
    this.statusEventStream$.next(IBacktestStatus.CLOSE);
    return [];
  }
}
