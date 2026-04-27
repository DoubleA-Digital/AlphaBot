import type { OHLCVBar, TechnicalIndicators } from '@/types';

export function computeIndicators(symbol: string, history: OHLCVBar[]): TechnicalIndicators {
  if (history.length < 2) {
    return {
      symbol,
      price: 0,
      rsi14: null,
      macd: null,
      sma20: null,
      sma50: null,
      bollingerBands: null,
      volumeRatio: null,
      weekHigh52: null,
      weekLow52: null,
      weekHighProximity52: null,
      weekLowProximity52: null,
    };
  }

  const closes = history.map(b => b.close);
  const volumes = history.map(b => b.volume);
  const highs = history.map(b => b.high);
  const lows = history.map(b => b.low);
  const currentPrice = closes[closes.length - 1];

  // RSI 14
  const rsi14 = calculateRSI(closes, 14);

  // MACD (12, 26, 9)
  const macd = calculateMACD(closes, 12, 26, 9);

  // SMAs
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);

  // Bollinger Bands (20, 2)
  const bollingerBands = calculateBollingerBands(closes, 20, 2);

  // Volume ratio (current / 20-day avg)
  const currentVolume = volumes[volumes.length - 1];
  const avgVolume20 = calculateSMAFromArray(volumes.slice(-20));
  const volumeRatio = avgVolume20 > 0 ? currentVolume / avgVolume20 : null;

  // 52-week high/low
  const year = history.slice(-252);
  const weekHigh52 = year.length > 0 ? Math.max(...year.map(b => b.high)) : null;
  const weekLow52 = year.length > 0 ? Math.min(...year.map(b => b.low)) : null;

  const weekHighProximity52 =
    weekHigh52 && weekHigh52 > 0
      ? ((currentPrice - weekHigh52) / weekHigh52) * 100
      : null;

  const weekLowProximity52 =
    weekLow52 && weekLow52 > 0
      ? ((currentPrice - weekLow52) / weekLow52) * 100
      : null;

  // Suppress unused variable warnings
  void highs;

  return {
    symbol,
    price: currentPrice,
    rsi14,
    macd,
    sma20,
    sma50,
    bollingerBands,
    volumeRatio,
    weekHigh52,
    weekLow52,
    weekHighProximity52,
    weekLowProximity52,
  };
}

function calculateSMAFromArray(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return calculateSMAFromArray(slice);
}

function calculateEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const emas: number[] = [];

  // Seed with SMA
  if (closes.length < period) return [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emas.push(ema);

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    emas.push(ema);
  }
  return emas;
}

function calculateRSI(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMACD(
  closes: number[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number
): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < slowPeriod + signalPeriod) return null;

  const fastEMAs = calculateEMA(closes, fastPeriod);
  const slowEMAs = calculateEMA(closes, slowPeriod);

  // Align: slowEMA starts at index (slowPeriod - 1), fastEMA at (fastPeriod - 1)
  // The offset between them
  const offset = slowPeriod - fastPeriod;
  const macdLine: number[] = [];

  for (let i = 0; i < slowEMAs.length; i++) {
    const fastIdx = i + offset;
    if (fastIdx < fastEMAs.length) {
      macdLine.push(fastEMAs[fastIdx] - slowEMAs[i]);
    }
  }

  if (macdLine.length < signalPeriod) return null;

  const signalEMAs = calculateEMA(macdLine, signalPeriod);
  if (signalEMAs.length === 0) return null;

  const macdVal = macdLine[macdLine.length - 1];
  const signalVal = signalEMAs[signalEMAs.length - 1];

  return {
    macd: macdVal,
    signal: signalVal,
    histogram: macdVal - signalVal,
  };
}

function calculateBollingerBands(
  closes: number[],
  period: number,
  stdDevMultiplier: number
): { upper: number; middle: number; lower: number } | null {
  if (closes.length < period) return null;

  const slice = closes.slice(-period);
  const sma = calculateSMAFromArray(slice);

  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: sma + stdDevMultiplier * stdDev,
    middle: sma,
    lower: sma - stdDevMultiplier * stdDev,
  };
}
