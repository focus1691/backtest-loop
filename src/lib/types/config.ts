export interface IBacktestSettings {
  dataStreams?: Map<string, IDataStream>
  stepSize: number
}

export interface IDataStream {
  isComplete: boolean
  index: number
  data: ITimeStampedData[]
  tsKey: string
}

export interface ITimeStampedData {
  timestamp: number
}

export interface IDataTypeStream {
  type: string
  data: ITimeStampedData[]
}

export interface IBacktestDataset {
  timeseries: IDataTypeStream[]
  prices: ITimeStampedData[]
  tsKey: string
}

export interface ITimeSeriesEvent {
  timestamp: number
  type: string
  data: any
}
