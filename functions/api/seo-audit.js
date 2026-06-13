// functions/api/seo-audit.js
// Free Google PageSpeed Insights v5 proxy. No API key needed for basic use.
export async function onRequest(context) {
  const { request } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
  }

  const url = new URL(request.url);
  let targetUrl = url.searchParams.get('url') || '';
  if (!targetUrl) return Response.json({ error: 'url parameter required' }, { status: 400 });
  if (!/^https?:\/\//.test(targetUrl)) targetUrl = 'https://' + targetUrl;

  try {
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=mobile&category=performance&category=seo&category=accessibility&category=best-practices`;
    const psiRes = await fetch(psiUrl, { headers: { 'User-Agent': 'AHoosh-SEO-Tool/1.0' } });
    const psi = await psiRes.json();

    if (psi.error) {
      return Response.json({ error: 'Could not analyze this URL. Make sure it is publicly accessible.' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const cats = psi.lighthouseResult?.categories || {};
    const audits = psi.lighthouseResult?.audits || {};

    const scores = {
      performance: Math.round((cats.performance?.score ?? 0) * 100),
      seo: Math.round((cats.seo?.score ?? 0) * 100),
      accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((cats['best-practices']?.score ?? 0) * 100),
    };

    const vitals = {
      lcp: audits['largest-contentful-paint']?.displayValue || '–',
      lcp_score: Math.round((audits['largest-contentful-paint']?.score ?? 0) * 100),
      cls: audits['cumulative-layout-shift']?.displayValue || '–',
      cls_score: Math.round((audits['cumulative-layout-shift']?.score ?? 0) * 100),
      fcp: audits['first-contentful-paint']?.displayValue || '–',
      fcp_score: Math.round((audits['first-contentful-paint']?.score ?? 0) * 100),
      tbt: audits['total-blocking-time']?.displayValue || '–',
      tbt_score: Math.round((audits['total-blocking-time']?.score ?? 0) * 100),
      si: audits['speed-index']?.displayValue || '–',
      ttfb: audits['server-response-time']?.displayValue || '–',
    };

    // SEO issues (failed audits only)
    const seoIssues = (cats.seo?.auditRefs || [])
      .map(r => audits[r.id])
      .filter(a => a && a.score !== null && a.score < 1 && a.score !== undefined)
      .slice(0, 6)
      .map(a => ({ title: a.title, score: Math.round((a.score ?? 0) * 100), desc: (a.description || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').slice(0, 100) }));

    // Performance opportunities
    const perfOps = (cats.performance?.auditRefs || [])
      .map(r => audits[r.id])
      .filter(a => a && a.score !== null && a.score < 0.9 && (a.details?.type === 'opportunity' || a.details?.type === 'table'))
      .slice(0, 4)
      .map(a => ({ title: a.title, savings: a.details?.overallSavingsMs ? Math.round(a.details.overallSavingsMs) + 'ms' : null }));

    // Basic meta
    const meta = {
      title: audits['document-title']?.title || '',
      description: audits['meta-description']?.score === 1 ? '✓ Present' : '✗ Missing',
      viewport: audits['viewport']?.score === 1 ? '✓ Set' : '✗ Missing',
      https: targetUrl.startsWith('https') ? '✓ HTTPS' : '✗ HTTP only',
      robots: audits['robots-txt']?.score === 1 ? '✓ OK' : (audits['robots-txt']?.score === 0 ? '✗ Issue' : '? Not checked'),
    };

    return Response.json({ url: targetUrl, scores, vitals, seoIssues, perfOps, meta, analyzedAt: new Date().toISOString() }, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }
    });

  } catch (err) {
    return Response.json({ error: 'Analysis failed: ' + err.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}
