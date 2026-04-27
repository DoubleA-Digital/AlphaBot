'use client';

import { useState, useEffect, useCallback } from 'react';
import MiniChart from './charts/MiniChart';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { StockQuote, OHLCVBar } from '@/types';
import { DEFAULT_WATCHLIST } from '@/lib/constants';
import { clsx } from 'clsx';

interface StockCardData {
  quote: StockQuote;
  history: OHLCVBar[];
}

interface Props {
  compact?: boolean;
}

export default function MarketOverview({ compact = false }: Props) {
  const [stocks, setStocks] = useState<Map<string, StockCardData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Fetch all quotes at once
      const quotesRes = await fetch(`/api/market/quotes?symbols=${DEFAULT_WATCHLIST.join(',')}`);
      const quotesData = await quotesRes.json();

      const newMap = new Map<string, StockCardData>();

      // Fetch history for each in parallel (up to 6 at a time to be gentle)
      const batchSize = 6;
      const symbols = DEFAULT_WATCHLIST.slice(0, compact ? 10 : 20);

      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const histPromises = batch.map(sym =>
          fetch(`/api/market/history?symbol=${sym}&days=30`)
            .then(r => r.json())
            .catch(() => ({ history: [] }))
        );
        const histResults = await Promise.all(histPromises);
        batch.forEach((sym, idx) => {
          const quote = quotesData.quotes?.[sym];
          const history = histResults[idx]?.history ?? [];
          if (quote) {
            newMap.set(sym, { quote, history });
          }
        });
      }

      setStocks(newMap);
    } catch (err) {
      console.error('MarketOverview fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [compact]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className={clsx('grid gap-3', compact ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5')}>
        {Array.from({ length: compact ? 10 : 20 }).map((_, i) => (
          <div key={i} className="bg-[#111] border border-white/10 rounded-lg p-3 animate-pulse">
            <div className="h-4 bg-white/10 rounded w-12 mb-2" />
            <div className="h-6 bg-white/10 rounded w-20 mb-1" />
            <div className="h-3 bg-white/10 rounded w-16 mb-3" />
            <div className="h-12 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const entries = Array.from(stocks.entries());

  return (
    <div
      className={clsx(
        'grid gap-3',
        compact
          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
      )}
    >
      {entries.map(([symbol, { quote, history }]) => {
        const positive = quote.changePercent >= 0;
        const isSelected = selectedSymbol === symbol;

        return (
          <div
            key={symbol}
            onClick={() => setSelectedSymbol(isSelected ? null : symbol)}
            className={clsx(
              'bg-[#111] border rounded-lg p-3 cursor-pointer transition-all hover:border-white/20 group',
              isSelected ? 'border-[#AAFF00]/40 bg-[#AAFF00]/5' : 'border-white/10'
            )}
          >
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="font-mono font-bold text-white text-sm">{symbol}</div>
                <div className="text-white/30 text-[10px] font-mono truncate max-w-[80px]">
                  {getCompanyName(symbol)}
                </div>
              </div>
              <div className={clsx('flex items-center gap-0.5 text-[10px] font-mono', positive ? 'text-[#AAFF00]' : 'text-red-400')}>
                {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {positive ? '+' : ''}{quote.changePercent.toFixed(2)}%
              </div>
            </div>

            <div className="font-mono font-bold text-white text-lg leading-none mb-0.5">
              ${quote.price.toFixed(2)}
            </div>
            <div className={clsx('text-[10px] font-mono mb-2', positive ? 'text-[#AAFF00]' : 'text-red-400')}>
              {positive ? '+' : ''}${quote.change.toFixed(2)}
            </div>

            {history.length > 0 && (
              <MiniChart data={history} positive={positive} height={48} />
            )}

            <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-[10px] font-mono text-white/30">
              <span>H: ${quote.high.toFixed(0)}</span>
              <span>L: ${quote.low.toFixed(0)}</span>
              <span>{(quote.volume / 1e6).toFixed(0)}M</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getCompanyName(symbol: string): string {
  const names: Record<string, string> = {
    AAPL: 'Apple', MSFT: 'Microsoft', GOOGL: 'Alphabet', AMZN: 'Amazon',
    NVDA: 'NVIDIA', META: 'Meta', TSLA: 'Tesla', AMD: 'AMD',
    JPM: 'JPMorgan', BAC: 'Bank of America', SPY: 'S&P 500 ETF',
    QQQ: 'Nasdaq ETF', PLTR: 'Palantir', SOFI: 'SoFi', RIVN: 'Rivian',
    CRWD: 'CrowdStrike', PYPL: 'PayPal', ROKU: 'Roku',
    NFLX: 'Netflix', DIS: 'Disney',
  };
  return names[symbol] ?? symbol;
}
