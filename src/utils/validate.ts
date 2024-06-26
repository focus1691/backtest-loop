import { convertToTimestamp } from './normalise'
import { IFlexibleTimeData } from '../lib/types'

export function isValidTimeseries(timeseries: IFlexibleTimeData[], tsKey: string): boolean {
  if (!Array.isArray(timeseries) || timeseries.length === 0) {
    return false
  }

  return timeseries.every((item) => {
    const tsValue = item[tsKey]
    // Check if tsValue is a number or a valid date string or a Date
    return typeof tsValue === 'number' || tsValue instanceof Date || !isNaN(Date.parse(tsValue))
  })
}

export function validateCandleIntegrity(data: IFlexibleTimeData[], intervalMS: number, tsKey: string): boolean {
  for (let i = 1; i < data.length; i++) {
    const previousTimestamp = convertToTimestamp(data[i - 1][tsKey])
    const currentTimestamp = convertToTimestamp(data[i][tsKey])

    // Check if the difference between the current and previous timestamps matches the interval
    if (currentTimestamp - previousTimestamp !== intervalMS) {
      return false // Integrity check failed
    }
  }
  return true // All candles are correctly spaced
}
