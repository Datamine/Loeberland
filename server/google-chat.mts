import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CHARACTER_IDENTITY_COOKIE } from '../src/multiplayer-protocol.ts';
import { isRecord } from '../src/types/json.ts';

const ROOT = '/auth/google/chat';
const CALLBACK = ROOT + '/callback';
const FLOW_COOKIE = 'sf-google-chat';
const EXPIRY_SECONDS = 600;
const randomToken = () => randomBytes(32).toString('base64url');

export function readGoogleChatConfig(env = process.env) {
  const clientId = env.GOOGLE_CHAT_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CHAT_CLIENT_SECRET?.trim();
  const uri = env.GOOGLE_CHAT_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !uri || !URL.canParse(uri)) return null;
  const redirect = new URL(uri);
  const localHttp =
    redirect.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname);
  if (
    (redirect.protocol !== 'https:' && !localHttp) ||
    redirect.pathname !== CALLBACK ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash
  )
    return null;
  return { clientId, clientSecret, redirect };
}

type Config = NonNullable<ReturnType<typeof readGoogleChatConfig>>;
type Flow = { token: string; state: string; verifier: string; nonce: string; expires: number };

function readCookie(req: IncomingMessage, key: string) {
  const prefix = key + '=';
  return req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

async function verifiedGoogleAccount(
  config: Config,
  flow: Flow,
  code: string,
  request: typeof fetch,
) {
  const response = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirect.href,
      grant_type: 'authorization_code',
      code,
      code_verifier: flow.verifier,
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const tokens: unknown = await response.json();
  if (!isRecord(tokens) || typeof tokens.id_token !== 'string') return null;
  const parts = tokens.id_token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  // This ID token comes directly from Google's HTTPS token endpoint (OIDC Core 3.1.3.7).
  const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (
    !isRecord(claims) ||
    (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') ||
    claims.aud !== config.clientId ||
    (claims.azp !== undefined && claims.azp !== config.clientId) ||
    claims.nonce !== flow.nonce ||
    typeof claims.exp !== 'number' ||
    !(claims.exp * 1000 > Date.now()) ||
    typeof claims.sub !== 'string' ||
    !/^[\x21-\x7e]{1,255}$/.test(claims.sub)
  )
    return null;
  const email =
    claims.email_verified === true && typeof claims.email === 'string' && claims.email.length <= 254
      ? /^([^@\s])[^@\s]*(@[^@\s]+)$/.exec(claims.email)
      : null;
  return { subject: claims.sub, label: email ? email[1] + '•••' + email[2] : undefined };
}

const resultMessages = {
  unlocked: 'Chat is unlocked. Return to your game tab to start typing.',
  cancelled: 'Sign-in was cancelled. Return to your game tab to try again.',
  failed: 'Chat could not be unlocked. Return to your game tab to try again.',
  linked:
    'That Google account is already linked to another character. Return to your game tab to try again.',
  unavailable: 'Google sign-in is unavailable. You can still use Yo, Ok, and No in the game.',
} as const;

export function createGoogleChatRoutes(
  config: Config | null,
  game: {
    canStartChatUnlock(token: string): Promise<boolean>;
    grantChatUnlock(
      token: string,
      googleSubject: string,
      accountLabel?: string,
    ): Promise<boolean | 'google-already-linked'>;
  },
  request = fetch,
) {
  const pending = new Map<string, Flow>();
  function redirect(res: ServerResponse, path: string) {
    res.writeHead(303, { Location: path });
    res.end();
  }
  return async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (![ROOT + '/start', CALLBACK, ROOT + '/result'].includes(url.pathname)) return false;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const result = (status: keyof typeof resultMessages) =>
      redirect(res, ROOT + '/result?status=' + status);
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' });
      res.end();
    } else if (url.pathname === ROOT + '/result') {
      const status = url.searchParams.get('status');
      const message =
        status && Object.hasOwn(resultMessages, status)
          ? resultMessages[status as keyof typeof resultMessages]
          : resultMessages.failed;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Loeberland chat</title><p>' +
          message +
          '</p></html>',
      );
    } else if (!config || req.headers.host?.toLowerCase() !== config.redirect.host.toLowerCase()) {
      result('unavailable');
    } else {
      const flowCookie = readCookie(req, FLOW_COOKIE);
      const setCookie = (value: string, age: number) =>
        res.setHeader(
          'Set-Cookie',
          FLOW_COOKIE +
            '=' +
            value +
            '; Path=' +
            ROOT +
            '; Max-Age=' +
            age +
            '; HttpOnly; SameSite=Lax' +
            (config.redirect.protocol === 'https:' ? '; Secure' : ''),
        );
      if (url.pathname === ROOT + '/start') {
        const token = readCookie(req, CHARACTER_IDENTITY_COOKIE);
        if (!token || !(await game.canStartChatUnlock(token))) {
          result('failed');
          return true;
        }
        const time = Date.now();
        for (const [key, flow] of pending) if (flow.expires <= time) pending.delete(key);
        if (flowCookie) pending.delete(flowCookie);
        if (pending.size >= 500) {
          result('unavailable');
          return true;
        }
        const key = randomToken();
        const flow = {
          token,
          state: randomToken(),
          verifier: randomToken(),
          nonce: randomToken(),
          expires: time + EXPIRY_SECONDS * 1000,
        };
        pending.set(key, flow);
        setCookie(key, EXPIRY_SECONDS);
        const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        google.search = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: config.redirect.href,
          scope: 'openid email',
          response_type: 'code',
          state: flow.state,
          nonce: flow.nonce,
          code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'),
          code_challenge_method: 'S256',
          prompt: 'select_account',
        }).toString();
        redirect(res, google.href);
      } else {
        const flow = flowCookie ? pending.get(flowCookie) : undefined;
        if (!flow || flow.expires <= Date.now() || flow.state !== url.searchParams.get('state')) {
          result('failed');
          return true;
        }
        pending.delete(flowCookie!);
        setCookie('', 0);
        const code = url.searchParams.get('code');
        if (url.searchParams.has('error')) result('cancelled');
        else if (!code) result('failed');
        else {
          let status: Awaited<ReturnType<typeof game.grantChatUnlock>> = false;
          try {
            const account = await verifiedGoogleAccount(config, flow, code, request);
            if (account)
              status = await game.grantChatUnlock(flow.token, account.subject, account.label);
          } catch {
            // Google or the game store may be temporarily unavailable.
          }
          result(status === 'google-already-linked' ? 'linked' : status ? 'unlocked' : 'failed');
        }
      }
    }
    return true;
  };
}
