// Client-side localStorage portfolio persistence

export interface StoredPosition {
  symbol: string;
  shares: number;
  avg_cost_basis: number;
  bought_at: string; // ISO timestamp
}

export interface StoredTrade {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  shares: number;
  price: number;
  totalCost: number;
  reasoning: string;
  confidence: number;
  timestamp: string;
  sell_target: number;
  stop_loss: number;
}

export interface StoredSnapshot {
  timestamp: string;
  totalValue: number;
}

export interface PortfolioStore {
  cash: number;
  positions: StoredPosition[];
  trades: StoredTrade[];
  snapshots: StoredSnapshot[];
  lastUpdated: string;
}

const KEY = 'alphabot_portfolio_v2';
const STARTING_CASH = 4000;

export function loadPortfolio(): PortfolioStore {
  if (typeof window === 'undefined') return defaultStore();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultStore();
    return JSON.parse(raw) as PortfolioStore;
  } catch {
    return defaultStore();
  }
}

export function savePortfolio(store: PortfolioStore): void {
  if (typeof window === 'undefined') return;
  store.lastUpdated = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function defaultStore(): PortfolioStore {
  return {
    cash: STARTING_CASH,
    positions: [],
    trades: [],
    snapshots: [{ timestamp: new Date().toISOString(), totalValue: STARTING_CASH }],
    lastUpdated: new Date().toISOString(),
  };
}

export function applyBuy(
  store: PortfolioStore,
  symbol: string,
  shares: number,
  price: number,
  reasoning: string,
  confidence: number,
  sellTarget: number,
  stopLoss: number
): { store: PortfolioStore; error?: string } {
  const totalCost = shares * price;
  const posValue = store.positions.reduce((s, p) => s + p.shares * p.avg_cost_basis, 0);
  const totalValue = store.cash + posValue;

  if (store.cash < totalCost) return { store, error: 'Insufficient cash' };
  if (totalCost > totalValue * 0.25) return { store, error: 'Exceeds 25% position limit' };

  const newStore = { ...store, positions: [...store.positions], trades: [...store.trades] };
  const existing = newStore.positions.find(p => p.symbol === symbol);
  if (existing) {
    const newShares = existing.shares + shares;
    existing.avg_cost_basis = (existing.shares * existing.avg_cost_basis + totalCost) / newShares;
    existing.shares = newShares;
  } else {
    newStore.positions.push({ symbol, shares, avg_cost_basis: price, bought_at: new Date().toISOString() });
  }
  newStore.cash = parseFloat((store.cash - totalCost).toFixed(2));
  newStore.trades.unshift({
    id: crypto.randomUUID(),
    symbol, action: 'BUY', shares, price, totalCost,
    reasoning, confidence, timestamp: new Date().toISOString(),
    sell_target: sellTarget, stop_loss: stopLoss,
  });

  return { store: newStore };
}

export function applySell(
  store: PortfolioStore,
  symbol: string,
  shares: number,
  price: number,
  reasoning: string,
  confidence: number
): { store: PortfolioStore; error?: string } {
  const newStore = { ...store, positions: [...store.positions], trades: [...store.trades] };
  const idx = newStore.positions.findIndex(p => p.symbol === symbol);
  if (idx === -1 || newStore.positions[idx].shares < shares) return { store, error: 'Insufficient shares' };

  const totalValue = shares * price;
  newStore.positions[idx].shares -= shares;
  if (newStore.positions[idx].shares < 0.0001) newStore.positions.splice(idx, 1);
  newStore.cash = parseFloat((store.cash + totalValue).toFixed(2));
  newStore.trades.unshift({
    id: crypto.randomUUID(),
    symbol, action: 'SELL', shares, price, totalCost: totalValue,
    reasoning, confidence, timestamp: new Date().toISOString(),
    sell_target: 0, stop_loss: 0,
  });

  return { store: newStore };
}

export function addSnapshot(store: PortfolioStore, totalValue: number): PortfolioStore {
  const snap = { timestamp: new Date().toISOString(), totalValue };
  return { ...store, snapshots: [...store.snapshots, snap].slice(-90) };
}

export function computeTotalValue(store: PortfolioStore, livePrices: Record<string, number>): number {
  const posValue = store.positions.reduce((s, p) => {
    const livePrice = livePrices[p.symbol] ?? p.avg_cost_basis;
    return s + p.shares * livePrice;
  }, 0);
  return store.cash + posValue;
}
