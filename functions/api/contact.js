// Cloudflare Pages Function — handles AHoosh contact form
// Delivery: FormSubmit.co (keyless relay to hesamjafarzadeh@gmail.com).
// No API key / env var required. Restores the working pre-2026-06-13 delivery
// path after the Resend migration silently broke email (missing RESEND_API_KEY).
// Self-contained: no imports (the _guard.js helper does not exist on main).

const NOTIFY_TO = 'hesamjafarzadeh@gmail.com';
const ALLOWED_ORIGINS = new Set(['https://ahoosh.ai', 'https://www.ahoosh.ai']);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const host = new URL(origin).host;
    return host === 'ahoosh-site.pages.dev' || host.endsWith('.ahoosh-site.pages.dev');
  } catch {
    return false;
  }
}

function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin) return isAllowedOrigin(origin);
  const referer = request.headers.get('Referer');
  if (referer) {
    try { return isAllowedOrigin(new URL(referer).origin); } catch { return false; }
  }
  return false;
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length < 5 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

export async function onRequestPost({ request }) {
  // Block cross-site form posts (CSRF / spam relay).
  if (!isSameOrigin(request)) {
    return Response.redirect('https://ahoosh.ai/contact?error=1', 302);
  }

  try {
    const formData    = await request.formData();
    const name        = (formData.get('name')         || '').toString().trim();
    const email       = (formData.get('email')        || '').toString().trim();
    const company     = (formData.get('company')      || '').toString().trim();
    const message     = (formData.get('message')      || '').toString().trim();
    const requestType = (formData.get('request_type') || '').toString().trim();
    const honeypot    = (formData.get('_honey')        || '').toString().trim();

    // Honeypot: real users never fill the hidden "_honey" field. Bots do.
    if (honeypot) {
      return Response.redirect('https://ahoosh.ai/thank-you', 302);
    }

    if (!name || !message || !isValidEmail(email)) {
      return Response.redirect('https://ahoosh.ai/contact?error=1', 302);
    }

    const safeName    = name.slice(0, 120);
    const safeCompany = company.slice(0, 160);
    const safeMessage = message.slice(0, 5000);
    const firstName   = safeName.split(' ')[0] || safeName;

    const labelMap = {
      consulting:      'Consulting',
      market_research: 'Market Research',
      data_access:     'Data Access',
      ai_strategy:     'AI Strategy',
      content:         'Content & Thought Leadership',
      other:           'Something Else',
    };
    const typeLabel = labelMap[requestType] || requestType || '—';

    // ── Deliver via FormSubmit (keyless, form-encoded standard endpoint) ───────
    const body = new URLSearchParams({
      _subject:       `New contact: ${safeName}${safeCompany ? ' · ' + safeCompany : ''}`,
      _template:      'table',
      _captcha:       'false',
      _replyto:       email,
      Name:           safeName,
      Email:          email,
      Company:        safeCompany || '—',
      'Looking for':  typeLabel,
      Message:        safeMessage,
      _autoresponse:  `Hi ${firstName},\n\nThank you for reaching out to AHoosh. I received your message and will get back to you within 1-2 business days.\n\nIf your matter is urgent, just reply to this email.\n\n— Hesam Jafarzadeh\nFounder & AI Consultant, AHoosh · ahoosh.ai`,
    }).toString();

    const res = await fetch(`https://formsubmit.co/${encodeURIComponent(NOTIFY_TO)}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'text/html,application/xhtml+xml',
        'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        'Origin':       'https://ahoosh.ai',
        'Referer':      'https://ahoosh.ai/contact',
      },
      body,
    });

    let ok = res.ok;
    if (ok) {
      try {
        const text = (await res.text()).toLowerCase();
        if (text.includes('will not work in pages browsed as html') ||
            text.includes('confirm your email') ||
            text.includes('activate your form')) {
          ok = false;
        }
      } catch (e) { /* trust status */ }
    }

    if (!ok) {
      console.error('Contact: FormSubmit delivery failed, status', res.status);
      return Response.redirect('https://ahoosh.ai/contact?error=1', 302);
    }

    return Response.redirect('https://ahoosh.ai/thank-you', 302);

  } catch (err) {
    console.error('Contact function error:', err);
    return Response.redirect('https://ahoosh.ai/contact?error=1', 302);
  }
}
