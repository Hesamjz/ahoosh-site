// Cloudflare Pages Function — /api/auth/callback
// Exchanges GitHub OAuth code for access token, sends to Decap CMS via postMessage
// Env vars needed (set in Cloudflare Pages → Settings → Environment variables):
//   GITHUB_CLIENT_ID
//   GITHUB_CLIENT_SECRET

const ORIGIN = 'https://ahoosh.ai';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const cookieState = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1];

  if (!code) {
    return new Response('Missing code', { status: 400 });
  }

  // CSRF protection: the state GitHub echoes back must match the cookie set in
  // /api/auth. Without this, an attacker could complete the OAuth flow for the
  // victim (login CSRF).
  if (!returnedState || !cookieState || returnedState !== cookieState) {
    return new Response('Invalid OAuth state', { status: 400 });
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
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      // One-time state — clear it now that it's been used.
      'Set-Cookie': 'oauth_state=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  });
}
