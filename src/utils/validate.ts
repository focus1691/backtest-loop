import { ITimeseriesColumn } from '../lib/types'

export function isValidTimeseries(timeseries: ITimeseriesColumn): boolean {
  if (typeof timeseries?.type !== 'string' || !Array.isArray(timeseries?.data) || timeseries.data.length === 0) {
    return false
  }

  return timeseries.data.every((item) => typeof item.timestamp === 'number')
}
