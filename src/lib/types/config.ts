export interface IBacktestConfig {
  startTime?: number
  endTime?: number
  timeseries?: Map<string, ITimeseries>
  stepSize?: number
}

export interface ITimeseries {
  isComplete: boolean
  type: string
  data: IFlexibleTimeData[]
  tsKey: string
  requestMoreData: boolean
  cursor?: number
}

export interface IFlexibleTimeData {
  [key: string]: number | string | Date // Dynamic key, can be a number or an ISO string or Date
}

export interface IBacktestDataset {
  timeseries: ITimeseries[]
}

export interface ITimeSeriesEvent {
  timestamp: number
  type: string
  data: any
}
