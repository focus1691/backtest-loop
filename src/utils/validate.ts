import { convertToTimestamp } from './normalise';
import { IFlexibleTimeData } from '../lib/types';

export function isValidTimeseries(timeseries: IFlexibleTimeData[], tsKey: string): boolean {
  if (!Array.isArray(timeseries) || timeseries.length === 0) {
    return false;
  }

  return timeseries.every((item) => {
    const tsValue = item[tsKey];
    return typeof tsValue === 'number' || tsValue instanceof Date || !isNaN(Date.parse(tsValue));
  });
}

export function validateCandleIntegrity(data: IFlexibleTimeData[], intervalMS: number, tsKey: string): boolean {
  for (let i = 1; i < data.length; i++) {
    const previousTimestamp = convertToTimestamp(data[i - 1][tsKey]);
    const currentTimestamp = convertToTimestamp(data[i][tsKey]);

    if (currentTimestamp - previousTimestamp !== intervalMS) {
      return false;
    }
  }
  return true;
}
