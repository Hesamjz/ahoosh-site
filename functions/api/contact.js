// Cloudflare Pages Function — handles AHoosh contact form
// Env vars required (set in Cloudflare Pages → Settings → Environment variables):
//   RESEND_API_KEY  — your Resend transactional API key

export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    const name        = (formData.get('name')         || '').trim();
    const email       = (formData.get('email')        || '').trim();
    const company     = (formData.get('company')      || '').trim();
    const message     = (formData.get('message')      || '').trim();
    const requestType = (formData.get('request_type') || '').trim();

    if (!email || !name || !message) {
      return Response.redirect('https://ahoosh.ai/contact?error=1', 302);
    }

    const resendKey = env.RESEND_API_KEY;
    const labelMap = {
      consulting:      'Consulting',
      market_research: 'Market Research',
      data_access:     'Data Access',
      ai_strategy:     'AI Strategy',
      content:         'Content & Thought Leadership',
      other:           'Something Else',
    };
    const typeLabel = labelMap[requestType] || requestType || '—';

    // ── 1. Notify Hesam ──────────────────────────────────────────────────────
    await resendSend(resendKey, {
      from:    'AHoosh Contact Form <contact@ahoosh.ai>',
      to:      ['hesamjafarzadeh@gmail.com'],
      reply_to: email,
      subject: `New contact: ${name}${company ? ' · ' + company : ''}`,
      html:    notificationHtml({ name, email, company, message, typeLabel }),
    });

    // ── 2. Auto-reply to submitter ───────────────────────────────────────────
    await resendSend(resendKey, {
      from:    'Hesam Jafarzadeh · AHoosh <contact@ahoosh.ai>',
      to:      [email],
      subject: 'Thank you for reaching out to AHoosh',
      html:    thankYouHtml(name),
    });

    return Response.redirect('https://ahoosh.ai/thank-you', 302);

  } catch (err) {
    console.error('Contact function error:', err);
    return Response.redirect('https://ahoosh.ai/thank-you', 302);
  }
}

// ── Resend helper ─────────────────────────────────────────────────────────────
async function resendSend(apiKey, payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Notification email to Hesam ───────────────────────────────────────────────
function notificationHtml({ name, email, company, message, typeLabel }) {
  const row = (label, value) => `
    <tr>
      <td style="padding:8px 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#8A9BB0;white-space:nowrap;border-bottom:1px solid #E8ECF0;width:140px;">${label}</td>
      <td style="padding:8px 12px;font-size:14px;color:#0A1628;border-bottom:1px solid #E8ECF0;">${value || '—'}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F5;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr>
    <td style="background:#0A1628;border-radius:8px 8px 0 0;padding:24px 32px;text-align:center;">
      <img src="https://ahoosh.ai/assets/logo-dark.png" alt="AHoosh" width="64" style="display:block;margin:0 auto 12px;">
      <p style="color:#D4AF37;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0;">New Contact Form Submission</p>
    </td>
  </tr>
  <tr>
    <td style="background:#FFFFFF;padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${row('Name', name)}
        ${row('Email', `<a href="mailto:${email}" style="color:#D4AF37;">${email}</a>`)}
        ${row('Company', company)}
        ${row('Looking for', typeLabel)}
        <tr>
          <td colspan="2" style="padding:16px 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#8A9BB0;">Message</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:0 12px 16px;font-size:14px;color:#0A1628;line-height:1.7;white-space:pre-wrap;">${message}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="background:#F8F9FA;border-radius:0 0 8px 8px;padding:16px 32px;text-align:center;border-top:1px solid #E8ECF0;">
      <a href="mailto:${email}?subject=Re: Your inquiry to AHoosh" style="display:inline-block;background:#D4AF37;color:#0A1628;font-size:13px;font-weight:700;text-decoration:none;padding:10px 24px;border-radius:4px;">Reply to ${name}</a>
    </td>
  </tr>
</table>
</td></tr></table>
</body></html>`;
}

// ── Auto-reply thank-you email to the submitter ───────────────────────────────
function thankYouHtml(name) {
  const firstName = name.split(' ')[0] || name;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F2F5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F2F5;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="background:#0A1628;border-radius:8px 8px 0 0;padding:36px 40px;text-align:center;">
      <img src="https://ahoosh.ai/assets/logo-dark.png" alt="AHoosh" width="80" style="display:block;margin:0 auto 20px;">
      <div style="width:48px;height:2px;background:#D4AF37;margin:0 auto;"></div>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="background:#FFFFFF;padding:40px 40px 32px;">
      <h1 style="color:#0A1628;font-size:22px;font-weight:700;margin:0 0 20px;line-height:1.3;">Thank you, ${firstName}.</h1>
      <p style="color:#444;font-size:15px;line-height:1.75;margin:0 0 16px;">
        I received your message and will get back to you within 1–2 business days.
      </p>
      <p style="color:#444;font-size:15px;line-height:1.75;margin:0 0 24px;">
        In the meantime, feel free to have a look at what AHoosh does — from
        AI strategy and market intelligence to brand building and digital marketing.
      </p>

      <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td style="background:#F8F6EE;border-left:3px solid #D4AF37;padding:16px 20px;border-radius:0 4px 4px 0;">
            <p style="color:#0A1628;font-size:13px;line-height:1.7;margin:0;font-style:italic;">
              "AHoosh helps founders and executives make better decisions with AI — from reading markets to building the systems that keep them ahead."
            </p>
          </td>
        </tr>
      </table>

      <p style="color:#444;font-size:15px;line-height:1.75;margin:0 0 8px;">
        If your matter is urgent, you can reply directly to this email.
      </p>

      <div style="border-top:1px solid #E8E8E8;margin:28px 0 24px;"></div>

      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:14px;border-right:2px solid #D4AF37;vertical-align:middle;">
            <img src="https://ahoosh.ai/assets/logo-dark.png" alt="AHoosh" width="56" style="display:block;border-radius:4px;">
          </td>
          <td style="padding-left:16px;vertical-align:middle;">
            <p style="color:#0A1628;font-size:15px;font-weight:700;margin:0 0 2px;">Hesam Jafarzadeh</p>
            <p style="color:#8A9BB0;font-size:12px;margin:0 0 6px;">Founder & AI Consultant · AHoosh</p>
            <p style="margin:0;">
              <a href="mailto:contact@ahoosh.ai" style="color:#D4AF37;font-size:12px;text-decoration:none;">contact@ahoosh.ai</a>
              <span style="color:#CBD5E0;font-size:12px;margin:0 6px;">·</span>
              <a href="https://ahoosh.ai" style="color:#D4AF37;font-size:12px;text-decoration:none;">ahoosh.ai</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- CTA -->
  <tr>
    <td style="background:#0A1628;padding:24px 40px;text-align:center;">
      <a href="https://ahoosh.ai/consulting" style="display:inline-block;border:1px solid #D4AF37;color:#D4AF37;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:10px 28px;border-radius:4px;">See What We Do</a>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#F8F9FA;border-radius:0 0 8px 8px;padding:16px 40px;text-align:center;border-top:1px solid #E8ECF0;">
      <p style="color:#AAB4C0;font-size:11px;margin:0;line-height:1.6;">
        AHoosh · AI-Augmented Consulting<br>
        <a href="https://ahoosh.ai" style="color:#AAB4C0;text-decoration:none;">ahoosh.ai</a>
        &nbsp;·&nbsp;
        <a href="https://ahoosh.ai/contact" style="color:#AAB4C0;text-decoration:none;">Unsubscribe</a>
      </p>
    </td>
  </tr>

</table>
</td></tr></table>
</body></html>`;
}
