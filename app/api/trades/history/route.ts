import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: portfolios } = await supabase
      .from('portfolios')
      .select('id')
      .limit(1);

    if (!portfolios || portfolios.length === 0) {
      return NextResponse.json({ trades: [] });
    }

    const { data: trades } = await supabase
      .from('trades')
      .select('*')
      .eq('portfolio_id', portfolios[0].id)
      .order('timestamp', { ascending: false })
      .limit(100);

    return NextResponse.json({ trades: trades ?? [] });
  } catch (error) {
    console.error('Trades history error:', error);
    return NextResponse.json({ error: 'Failed to fetch trade history' }, { status: 500 });
  }
}
