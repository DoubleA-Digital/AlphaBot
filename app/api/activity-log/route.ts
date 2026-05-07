import { NextResponse } from 'next/server';

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '100');

  if (!hasSupabase) {
    return NextResponse.json({ logs: [] });
  }

  try {
    const { createAdminClient } = await import('@/lib/supabase');
    const supabase = createAdminClient();
    const { data: portfolios } = await supabase.from('portfolios').select('id').limit(1);
    const portfolioId = portfolios?.[0]?.id;
    if (!portfolioId) return NextResponse.json({ logs: [] });

    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    return NextResponse.json({ logs: (data ?? []).reverse() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
