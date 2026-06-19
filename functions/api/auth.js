// Cloudflare Pages Function — /api/auth
// Starts the GitHub OAuth flow for Decap CMS.
// Env vars needed (set in Cloudflare Pages → Settings → Environment variables):
//   GITHUB_CLIENT_ID
//   GITHUB_CLIENT_SECRET

const ORIGIN = 'https://ahoosh.ai';

export async function onRequest(context) {
  const { env } = context;

  // CSRF protection: generate a state value, send it to GitHub, and bind it to
  // this browser via an HttpOnly cookie. /api/auth/callback verifies the value
  // GitHub returns matches the cookie before exchanging the code.
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${ORIGIN}/api/auth/callback`,
    // Least privilege: ahoosh-site is a PUBLIC repo, so public_repo is enough
    // for Decap CMS to read/write content. (Full "repo" would grant access to
    // every private repo on the account — avoid.)
    scope: 'public_repo',
    state,
  });

  const headers = new Headers({
    Location: `https://github.com/login/oauth/authorize?${params}`,
    // SameSite=Lax so the cookie is still sent on the top-level redirect back
    // from GitHub. Scoped to /api/auth so it isn't sent site-wide. 10 min TTL.
    'Set-Cookie': `oauth_state=${state}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  });

  return new Response(null, { status: 302, headers });
}
