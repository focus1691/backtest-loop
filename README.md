# @focus1691/backtest-loop

[![npm version](https://badge.fury.io/js/%40focus1691%2Fbacktest-loop.svg)](https://www.npmjs.com/package/@focus1691/backtest-loop)
[![GitHub license](https://img.shields.io/github/license/focus1691/backtest-loop.svg)](https://github.com/focus1691/backtest-loop/blob/master/LICENSE)

A simple backtesting loop to replay data.

## Installation

Install this package by running the following command:

```bash
npm install @focus1691/backtest-loop
```

```ts
import { Backtester, ITimeseries, ITimeSeriesEvent } from '@focus1691/backtest-loop';

const ONE_MINUTE = 86000; // The value in MS the test will increment until finishing
const bt = new Backtester({ stepSize: ONE_MINUTE });
bt.setStartTime(1677196860000);
bt.setEndTime(1677197400000);

bt.timeseriesEvents.subscribe((dataEvents: ITimeSeriesEvent[]) => {
  console.log('Received new data:', dataEvents);
});

bt.status.subscribe((status: string) => {
  console.log('Received status:', status);
});

bt.setData({
  timeseries: [
    { tsKey: 'openTime', data: oneMin, type: 'candle_1m', requestMoreData: false, isComplete: false },
    { tsKey: 'openTime', data: footprintOneMin, type: 'footprint_1m', requestMoreData: false, isComplete: false },
  ]
}).start();

while (bt.hasMoreDataToProcess()) {
  const dataEvents: ITimeSeriesEvent[] = bt.runNextStep();
  console.log(dataEvents);
}

```
