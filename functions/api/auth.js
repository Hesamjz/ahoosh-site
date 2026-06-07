// Cloudflare Pages Function — /api/auth
// Redirects to GitHub OAuth authorization page
// Env vars needed (set in Cloudflare Pages → Settings → Environment variables):
//   GITHUB_CLIENT_ID
//   GITHUB_CLIENT_SECRET

const ORIGIN = 'https://ahoosh.ai';

export async function onRequest(context) {
  const { env } = context;
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
