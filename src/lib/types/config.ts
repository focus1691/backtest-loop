export interface IBacktestSettings {
  startTime?: number
  endTime?: number
  dataStreams?: Map<string, IDataStream>
  stepSize?: number
}

export interface IDataStream {
  isComplete: boolean
  type: string
  data: IFlexibleTimeData[]
  tsKey: string
  requestMoreData: boolean
}

export interface IFlexibleTimeData {
  [key: string]: number | string // Dynamic key, can be a number or an ISO string
}

export interface IDataTypeStream {
  type: string
  tsKey: string
  data: IFlexibleTimeData[]
  requestMoreData: boolean
}

export interface IBacktestDataset {
  timeseries: IDataTypeStream[]
}

export interface ITimeSeriesEvent {
  timestamp: number
  type: string
  data: any
}
