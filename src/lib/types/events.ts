import { Exchange } from '@tsquant/exchangeapi/dist/lib/constants'
import { ICandle } from '@tsquant/exchangeapi/dist/lib/types'

export type PriceEvent = {
  symbol: string
  exchange: Exchange
  price: number
}

export type CandleEvent = ICandle
