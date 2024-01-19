export interface IBacktestSettings {
  dataStreams?: Map<string, IDataStream>
  stepSize: number
}

export interface IDataStream {
  isComplete: boolean
  type: string
  index: number
  data: IFlexibleTimeData[]
  tsKey: string
}

export interface IFlexibleTimeData {
  [key: string]: number | string // Dynamic key, can be a number or an ISO string
}

export interface IDataTypeStream {
  type: string
  tsKey: string
  data: IFlexibleTimeData[]
}

export interface IBacktestDataset {
  timeseries: IDataTypeStream[]
}

export interface ITimeSeriesEvent {
  timestamp: number
  type: string
  data: any
}
