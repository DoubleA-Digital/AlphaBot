import type { StockQuote, OHLCVBar } from '@/types';

const BASE_PRICES: Record<string, number> = {
  AAPL: 213.5, MSFT: 418.2, GOOGL: 178.4, AMZN: 196.8, NVDA: 138.7,
  META: 592.3, TSLA: 248.1, AMD: 164.2, JPM: 238.4, BAC: 43.2,
  SPY: 558.9, QQQ: 480.2, PLTR: 42.8, SOFI: 14.3, RIVN: 11.7,
  CRWD: 418.6, PYPL: 78.4, ROKU: 68.2, NFLX: 1012.4, DIS: 112.6,
};

const DAILY_CHANGES: Record<string, number> = {
  AAPL: 1.24, MSFT: -0.87, GOOGL: 2.13, AMZN: 0.54, NVDA: 3.82,
  META: -1.23, TSLA: 4.51, AMD: 2.87, JPM: 0.34, BAC: -0.21,
  SPY: 0.61, QQQ: 1.12, PLTR: 5.43, SOFI: 3.21, RIVN: -2.14,
  CRWD: 1.87, PYPL: -0.93, ROKU: 2.56, NFLX: 0.78, DIS: -0.44,
};

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function generateMockHistory(symbol: string, days: number = 90): OHLCVBar[] {
  const basePrice = BASE_PRICES[symbol] ?? 100;
  const bars: OHLCVBar[] = [];
  let price = basePrice * (0.85 + seededRandom(symbol.charCodeAt(0)) * 0.1);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const seed = symbol.charCodeAt(0) * 100 + i;
    const dailyReturn = (seededRandom(seed) - 0.48) * 0.035;
    const open = price;
    const close = open * (1 + dailyReturn);
    const high = Math.max(open, close) * (1 + seededRandom(seed + 1) * 0.015);
    const low = Math.min(open, close) * (1 - seededRandom(seed + 2) * 0.015);
    const volume = Math.floor(20000000 + seededRandom(seed + 3) * 80000000);

    bars.push({
      date: date.toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    });

    price = close;
  }

  // Nudge last close toward real base price
  if (bars.length > 0) {
    const last = bars[bars.length - 1];
    const change = DAILY_CHANGES[symbol] ?? 0;
    last.close = parseFloat((basePrice).toFixed(2));
    last.open = parseFloat((basePrice - change).toFixed(2));
    last.high = parseFloat((basePrice + Math.abs(change) * 0.5).toFixed(2));
    last.low = parseFloat((basePrice - Math.abs(change) * 0.5).toFixed(2));
  }

  return bars;
}

export function generateMockQuote(symbol: string): StockQuote {
  const price = BASE_PRICES[symbol] ?? 100;
  const change = DAILY_CHANGES[symbol] ?? 0;
  const changePercent = (change / (price - change)) * 100;

  return {
    symbol,
    price,
    change,
    changePercent,
    volume: Math.floor(30000000 + Math.random() * 50000000),
    high: parseFloat((price + Math.abs(change) * 0.7).toFixed(2)),
    low: parseFloat((price - Math.abs(change) * 0.7).toFixed(2)),
    open: parseFloat((price - change * 0.3).toFixed(2)),
    previousClose: parseFloat((price - change).toFixed(2)),
    timestamp: new Date().toISOString().split('T')[0],
    isMock: true,
  } as StockQuote & { isMock: boolean };
}
