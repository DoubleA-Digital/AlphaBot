import { NextResponse } from 'next/server';

const hasSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http');

// In-memory fallback
const memAlerts: Array<{
  id: string; type: string; title: string; body: string;
  is_read: boolean; created_at: string; related_symbol: string | null;
}> = [];

async function getSupabase() {
  const { createAdminClient } = await import('@/lib/supabase');
  return createAdminClient();
}

async function getPortfolioId() {
  const supabase = await getSupabase();
  const { data } = await supabase.from('portfolios').select('id').limit(1).single();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '50');
  const unreadOnly = url.searchParams.get('unread') === 'true';

  if (!hasSupabase) {
    let alerts = [...memAlerts].reverse();
    if (unreadOnly) alerts = alerts.filter(a => !a.is_read);
    return NextResponse.json({ alerts: alerts.slice(0, limit), unreadCount: memAlerts.filter(a => !a.is_read).length });
  }

  try {
    const supabase = await getSupabase();
    const portfolioId = await getPortfolioId();
    if (!portfolioId) return NextResponse.json({ alerts: [], unreadCount: 0 });

    let query = supabase
      .from('alerts')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.eq('is_read', false);

    const { data } = await query;
    const { count } = await supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('portfolio_id', portfolioId)
      .eq('is_read', false);

    return NextResponse.json({ alerts: data ?? [], unreadCount: count ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  // Mark alerts as read
  const body = await req.json();
  const alertIds: string[] = body.ids ?? [];
  const markAll: boolean = body.markAll ?? false;

  if (!hasSupabase) {
    memAlerts.forEach(a => {
      if (markAll || alertIds.includes(a.id)) a.is_read = true;
    });
    return NextResponse.json({ ok: true });
  }

  try {
    const supabase = await getSupabase();
    const portfolioId = await getPortfolioId();
    if (!portfolioId) return NextResponse.json({ ok: false });

    if (markAll) {
      await supabase.from('alerts').update({ is_read: true }).eq('portfolio_id', portfolioId);
    } else {
      await supabase.from('alerts').update({ is_read: true }).in('id', alertIds);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
