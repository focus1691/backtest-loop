import { getTime, parseISO } from 'date-fns'

export function convertToTimestamp(dateInput: string | number): number {
  if (typeof dateInput === 'number') {
    return dateInput
  } else {
    return getTime(parseISO(dateInput))
  }
}
