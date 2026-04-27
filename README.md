# AlphaBot — AI-Powered Stock Trading Simulator

**Live Demo: [https://alphabot-lime.vercel.app](https://alphabot-lime.vercel.app)**

An educational paper trading platform powered by Claude AI, Next.js 14, Supabase, and real market data.

> DISCLAIMER: This platform is for educational and simulation purposes only. No real money is invested. All trades are paper trades.

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes (serverless)
- **Database**: Supabase (Postgres)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Market Data**: Alpha Vantage API + yahoo-finance2 fallback
- **Charts**: Recharts

## Setup

### 1. Install dependencies

```bash
cd AlphaBot
npm install
```

### 2. Configure environment variables

Copy `.env.local` and fill in your API keys:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Get your API keys:
- **Supabase**: https://supabase.com (create a project, get keys from Settings > API)
- **Anthropic**: https://console.anthropic.com
- **Alpha Vantage**: https://www.alphavantage.co/support/#api-key (free tier: 5 req/min, 500/day)

### 3. Set up Supabase database

1. Create a new Supabase project
2. Go to SQL Editor
3. Run the contents of `schema.sql`

### 4. Run the development server

```bash
npm run dev
```

Open http://localhost:3000

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Portfolio overview, P&L stats, holdings table, 30-day chart |
| AlphaBot | `/bot` | AI agent control panel, 5-step pipeline, decision log |
| Portfolio | `/portfolio` | Holdings pie chart, trade history, performance metrics |
| Research | `/research` | Stock lookup, technical indicators, Claude analysis |
| Settings | `/settings` | Watchlist, risk tolerance, API configuration |

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/portfolio` | GET | Portfolio stats + positions |
| `/api/bot/run` | POST | Run one full AlphaBot loop |
| `/api/market/quotes` | GET | Live stock quotes |
| `/api/market/history` | GET | OHLCV history |
| `/api/research/[symbol]` | GET | Full technical + AI analysis |
| `/api/trades/execute` | POST | Execute a paper trade |
| `/api/trades/history` | GET | Trade history |

## AlphaBot Agent Pipeline

1. Fetch live market data for watchlist stocks
2. Compute technical indicators (RSI-14, MACD 12/26/9, SMA 20/50, Bollinger Bands, Volume ratio, 52W H/L)
3. Send indicators + portfolio state to Claude API
4. Validate trade against risk rules (max 20% position, max 15% drawdown)
5. Execute paper trade in Supabase + take portfolio snapshot

## Deploying to Vercel

```bash
npm run build  # verify build succeeds locally first
vercel --prod
```

Add all environment variables in Vercel project settings.

Note: Alpha Vantage free tier (5 req/min) may cause bot runs to be slow for large watchlists. Consider upgrading or using yahoo-finance2 fallback exclusively.
