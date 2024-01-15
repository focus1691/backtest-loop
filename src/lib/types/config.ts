export interface IBacktesterConfig {
  typeBasedTimeIntervals: Map<string, ITimeInterval>
}

export interface ITimeInterval {
  start: number
  end: number
  isComplete: boolean
  data: ITimeseriesField[]
}

export interface ITimeseriesField {
  timestamp: number
}

export interface ITimeseriesColumn {
  type: string
  data: ITimeseriesField[]
}

export interface IDataset {
  timeseries: ITimeseriesColumn[]
  prices: ITimeseriesField[]
}
