import { getTime, parseISO } from 'date-fns';

export function convertToTimestamp(dateInput: string | number | Date): number {
  if (typeof dateInput === 'number') {
    return dateInput;
  } else if (dateInput instanceof Date) {
    return dateInput.getTime();
  } else {
    return getTime(parseISO(dateInput));
  }
}
