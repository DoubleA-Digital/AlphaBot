'use client';

import { useState, useEffect } from 'react';
import { DEFAULT_WATCHLIST } from '@/lib/constants';
import type { StockQuote } from '@/types';

export default function TickerTape() {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        const res = await fetch(`/api/market/quotes?symbols=${DEFAULT_WATCHLIST.join(',')}`);
        const data = await res.json();
        if (data.quotes) {
          setQuotes(Object.values(data.quotes) as StockQuote[]);
        }
      } catch { /* silent */ }
    };
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60000);
    return () => clearInterval(interval);
  }, []);

  if (quotes.length === 0) return null;

  // Duplicate for seamless loop
  const items = [...quotes, ...quotes];

  return (
    <div className="bg-[#0d0d0d] border-b border-white/10 overflow-hidden h-8 flex items-center">
      <div className="flex items-center gap-0 whitespace-nowrap ticker-scroll">
        {items.map((q, i) => {
          const positive = q.changePercent >= 0;
          return (
            <span key={i} className="flex items-center gap-1.5 px-4 text-xs font-mono border-r border-white/10 h-8 leading-8">
              <span className="text-white/60 font-bold">{q.symbol}</span>
              <span className="text-white">${q.price.toFixed(2)}</span>
              <span className={positive ? 'text-[#AAFF00]' : 'text-red-400'}>
                {positive ? '+' : ''}{q.changePercent.toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
