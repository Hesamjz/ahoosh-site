/**
 * AHoosh CMS — GitHub OAuth proxy for Decap CMS
 * Deploy as a Cloudflare Worker with route: ahoosh.ai/api/auth*
 *
 * Environment variables to set in Cloudflare Worker:
 *   GITHUB_CLIENT_ID     = 0v23liF68HR1w6a4WI90
 *   GITHUB_CLIENT_SECRET = (from MEMORY.md)
 *
 * How it works:
 *   /api/auth            → redirect to GitHub OAuth
 *   /api/auth/callback   → exchange code for token, send back to Decap CMS
 */

const ORIGIN = 'https://ahoosh.ai';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/auth') {
      return handleAuth(url, env);
    }

    if (path === '/api/auth/callback') {
      return handleCallback(url, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

function handleAuth(url, env) {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${ORIGIN}/api/auth/callback`,
    scope: 'repo,user',
    state: crypto.randomUUID(),
  });
  return Response.redirect(
    `https://github.com/login/oauth/authorize?${params}`,
    302
  );
}

async function handleCallback(url, env) {
  const code = url.searchParams.get('code');
  if (!code) {
    return new Response('Missing code', { status: 400 });
  }

  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${ORIGIN}/api/auth/callback`,
    }),
  });

  const data = await tokenRes.json();

  if (data.error || !data.access_token) {
    return new Response(`OAuth error: ${data.error_description || data.error}`, {
      status: 400,
    });
  }

  // Decap CMS expects postMessage with the token
  const html = `<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body>
<script>
  (function() {
    const token = ${JSON.stringify(data.access_token)};
    const provider = 'github';
    const message = JSON.stringify({ token, provider });
    if (window.opener) {
      window.opener.postMessage(
        'authorization:' + provider + ':success:' + message,
        '${ORIGIN}'
      );
    }
    window.close();
  })();
<\/script>
<p>Authenticated. You can close this window.</p>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
