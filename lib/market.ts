import type { StockQuote, OHLCVBar } from '@/types';

const AV_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const CACHE_TTL = 60 * 1000; // 1 minute — keeps prices fresh

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const quoteCache = new Map<string, CacheEntry<StockQuote>>();
const historyCache = new Map<string, CacheEntry<OHLCVBar[]>>();

function isCacheValid<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

// ─── Yahoo Finance direct HTTP API (no API key, no npm package) ───────────────
// Uses Yahoo's public chart endpoint — same data that powers finance.yahoo.com

async function fetchYahooQuoteDirect(symbol: string): Promise<StockQuote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) return null;

    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = price - prevClose;

    return {
      symbol,
      price: parseFloat(price.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(((change / prevClose) * 100).toFixed(4)),
      volume: meta.regularMarketVolume ?? 0,
      high: meta.regularMarketDayHigh ?? price,
      low: meta.regularMarketDayLow ?? price,
      open: meta.regularMarketOpen ?? price,
      previousClose: parseFloat(prevClose.toFixed(2)),
      timestamp: new Date(meta.regularMarketTime * 1000).toISOString().split('T')[0],
    };
  } catch {
    return null;
  }
}

// Historical OHLCV via Yahoo Finance chart endpoint
async function fetchYahooHistoryDirect(symbol: string, days: number): Promise<OHLCVBar[] | null> {
  try {
    const range = days <= 7 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : '1y';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();

    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const ohlcv = result.indicators?.quote?.[0];
    if (!ohlcv || timestamps.length === 0) return null;

    const bars: OHLCVBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = ohlcv.close?.[i];
      if (close == null) continue;
      bars.push({
        date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
        open: parseFloat((ohlcv.open?.[i] ?? close).toFixed(2)),
        high: parseFloat((ohlcv.high?.[i] ?? close).toFixed(2)),
        low: parseFloat((ohlcv.low?.[i] ?? close).toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: ohlcv.volume?.[i] ?? 0,
      });
    }

    return bars.slice(-days);
  } catch {
    return null;
  }
}

// ─── Alpha Vantage (if API key is configured) ─────────────────────────────────

async function fetchAVQuote(symbol: string): Promise<StockQuote | null> {
  if (!AV_API_KEY) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const q = data['Global Quote'];
    if (!q || !q['05. price']) return null;

    return {
      symbol,
      price: parseFloat(q['05. price']),
      change: parseFloat(q['09. change']),
      changePercent: parseFloat(q['10. change percent']?.replace('%', '') ?? '0'),
      volume: parseInt(q['06. volume'] ?? '0'),
      high: parseFloat(q['03. high']),
      low: parseFloat(q['04. low']),
      open: parseFloat(q['02. open']),
      previousClose: parseFloat(q['08. previous close']),
      timestamp: q['07. latest trading day'],
    };
  } catch {
    return null;
  }
}

async function fetchAVHistory(symbol: string): Promise<OHLCVBar[] | null> {
  if (!AV_API_KEY) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${AV_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const series = data['Time Series (Daily)'];
    if (!series) return null;

    return Object.entries(series)
      .map(([date, values]) => {
        const v = values as Record<string, string>;
        return {
          date,
          open: parseFloat(v['1. open']),
          high: parseFloat(v['2. high']),
          low: parseFloat(v['3. low']),
          close: parseFloat(v['4. close']),
          volume: parseInt(v['5. volume']),
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } catch {
    return null;
  }
}

// ─── Public exports ───────────────────────────────────────────────────────────

export async function getQuote(symbol: string): Promise<StockQuote | null> {
  const cached = quoteCache.get(symbol);
  if (cached && isCacheValid(cached)) return cached.data;

  // Try Yahoo Finance first (real-time, no API key) then Alpha Vantage
  let quote = await fetchYahooQuoteDirect(symbol);
  if (!quote) quote = await fetchAVQuote(symbol);

  if (quote) {
    quoteCache.set(symbol, { data: quote, timestamp: Date.now() });
  }
  return quote;
}

export async function getQuotesBatched(symbols: string[]): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();
  await Promise.all(
    symbols.map(async (symbol) => {
      const quote = await getQuote(symbol);
      if (quote) results.set(symbol, quote);
    })
  );
  return results;
}

export async function getHistory(symbol: string, days: number = 90): Promise<OHLCVBar[]> {
  const cacheKey = `${symbol}-${days}`;
  const cached = historyCache.get(cacheKey);
  if (cached && isCacheValid(cached)) return cached.data;

  let history = await fetchYahooHistoryDirect(symbol, days);
  if (!history || history.length < 5) history = await fetchAVHistory(symbol);

  if (!history || history.length === 0) return [];

  const trimmed = history.slice(-days);
  historyCache.set(cacheKey, { data: trimmed, timestamp: Date.now() });
  return trimmed;
}

export { DEFAULT_WATCHLIST } from './constants';
