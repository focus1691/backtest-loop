import { IDataTypeStream } from '../lib/types'

export function isValidTimeseries(timeseries: IDataTypeStream, tsKey: string): boolean {
  if (typeof timeseries?.type !== 'string' || !Array.isArray(timeseries?.data) || timeseries.data.length === 0) {
    return false
  }

  return timeseries.data.every((item) => {
    const tsValue = item[tsKey]
    // Check if tsValue is a number or a valid date string
    return typeof tsValue === 'number' || !isNaN(Date.parse(tsValue))
  })
}
