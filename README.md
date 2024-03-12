# @focus1691/backtest-loop

[![npm version](https://badge.fury.io/js/%40focus1691%2Fbacktest-loop.svg)](https://www.npmjs.com/package/@focus1691/backtest-loop)
[![GitHub license](https://img.shields.io/github/license/focus1691/backtest-loop.svg)](https://github.com/focus1691/backtest-loop/blob/master/LICENSE)

A simple backtesting loop to replay data.

## Installation

Install this package by running the following command:

```bash
npm install @focus1691/backtest-loop
```

## Usage

```ts
import { Backtester, ITimeseries, ITimeSeriesEvent } from '@focus1691/backtest-loop';

const ONE_MINUTE = 60000; // Time step size in milliseconds
const bt = new Backtester({ stepSize: ONE_MINUTE });
bt.setStartTime(1677196860000); // Set the start time for the backtest
bt.setEndTime(1677197400000);   // Set the end time for the backtest

// Subscribe to timeseries events to process new data points
bt.timeseriesEvents.subscribe((dataEvents: ITimeSeriesEvent[]) => {
  console.log('Received new data:', dataEvents);
});

// Subscribe to status updates
bt.status.subscribe((status: string) => {
  console.log('Received status:', status);
});

// Set the time series data for the backtest
bt.setData({
  timeseries: [
    { tsKey: 'openTime', data: dataset1, type: 'candle_1m', requestMoreData: false, isComplete: false },
    { tsKey: 'openTime', data: dataset2, type: 'candle_5m', requestMoreData: false, isComplete: false },
  ]
}).start();

// Continuously run the backtest steps until all data has been processed
while (bt.hasMoreDataToProcess()) {
  const dataEvents: ITimeSeriesEvent[] = bt.runNextStep();
  console.log(dataEvents);
}

```
