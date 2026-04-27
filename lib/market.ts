import type { StockQuote, OHLCVBar } from '@/types';

const AV_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// In-memory cache
const quoteCache = new Map<string, CacheEntry<StockQuote>>();
const historyCache = new Map<string, CacheEntry<OHLCVBar[]>>();

function isCacheValid<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Alpha Vantage quote fetch
async function fetchAVQuote(symbol: string): Promise<StockQuote | null> {
  if (!AV_API_KEY) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV_API_KEY}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
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

// Yahoo Finance fallback
async function fetchYahooQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const yahooFinance = await import('yahoo-finance2');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote = await yahooFinance.default.quote(symbol) as any;
    if (!quote || !quote.regularMarketPrice) return null;

    return {
      symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
      volume: quote.regularMarketVolume ?? 0,
      high: quote.regularMarketDayHigh ?? quote.regularMarketPrice,
      low: quote.regularMarketDayLow ?? quote.regularMarketPrice,
      open: quote.regularMarketOpen ?? quote.regularMarketPrice,
      previousClose: quote.regularMarketPreviousClose ?? quote.regularMarketPrice,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getQuote(symbol: string): Promise<StockQuote | null> {
  const cached = quoteCache.get(symbol);
  if (cached && isCacheValid(cached)) return cached.data;

  let quote = await fetchAVQuote(symbol);
  if (!quote) {
    quote = await fetchYahooQuote(symbol);
  }

  if (quote) {
    quoteCache.set(symbol, { data: quote, timestamp: Date.now() });
  }

  return quote;
}

export async function getQuotesBatched(symbols: string[]): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();

  // Check cache first
  const toFetch: string[] = [];
  for (const symbol of symbols) {
    const cached = quoteCache.get(symbol);
    if (cached && isCacheValid(cached)) {
      results.set(symbol, cached.data);
    } else {
      toFetch.push(symbol);
    }
  }

  // Batch fetch with rate limiting (5 req/min for AV free tier = 15s delay)
  for (let i = 0; i < toFetch.length; i++) {
    const symbol = toFetch[i];
    const quote = await getQuote(symbol);
    if (quote) results.set(symbol, quote);

    // Rate limit: delay between requests if using Alpha Vantage
    if (AV_API_KEY && i < toFetch.length - 1) {
      await delay(15000);
    }
  }

  return results;
}

// Alpha Vantage historical data
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

// Yahoo Finance historical fallback
async function fetchYahooHistory(symbol: string, days: number): Promise<OHLCVBar[] | null> {
  try {
    const yahooFinance = await import('yahoo-finance2');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = await yahooFinance.default.historical(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return result.map((bar: any) => ({
      date: bar.date.toISOString().split('T')[0],
      open: bar.open ?? bar.close,
      high: bar.high ?? bar.close,
      low: bar.low ?? bar.close,
      close: bar.close,
      volume: bar.volume ?? 0,
    }));
  } catch {
    return null;
  }
}

export async function getHistory(symbol: string, days: number = 90): Promise<OHLCVBar[]> {
  const cacheKey = `${symbol}-${days}`;
  const cached = historyCache.get(cacheKey);
  if (cached && isCacheValid(cached)) return cached.data;

  let history = await fetchAVHistory(symbol);
  if (!history) {
    history = await fetchYahooHistory(symbol, days);
  }

  if (!history) return [];

  // Return only the requested number of days
  const trimmed = history.slice(-days);
  historyCache.set(cacheKey, { data: trimmed, timestamp: Date.now() });

  return trimmed;
}

export { DEFAULT_WATCHLIST } from './constants';
