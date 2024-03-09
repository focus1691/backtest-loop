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
  [key: string]: number | string // Dynamic key, can be a number or an ISO string
}

export interface IBacktestDataset {
  timeseries: ITimeseries[]
}

export interface ITimeSeriesEvent {
  timestamp: number
  type: string
  data: any
}
