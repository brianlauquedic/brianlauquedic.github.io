/* =====================================================================
 * Quedic Shop — Order Relay Worker
 *
 * Cloudflare Worker that sits between the Quedic shop frontend and
 * the Telegram Bot API. Receives orders from the website, validates
 * them, and forwards a formatted message to the internal Telegram
 * group.
 *
 * Why a Worker (vs. browser → Telegram direct):
 *   - Telegram bot token stays in Worker env vars, NEVER exposed to
 *     the browser (anyone can view-source on the static site).
 *   - Origin allow-list — only requests from quedic.com can call us,
 *     so the endpoint can't be abused from someone else's site.
 *   - In-memory rate-limit per IP — drops obvious spam attempts.
 *   - Payload shape validation — drops malformed requests early.
 *
 * Env vars to set in Cloudflare dashboard (Settings → Variables →
 * Environment variables, mark as "encrypted"):
 *   TG_TOKEN     The bot token from @BotFather (1234567890:ABC...)
 *   TG_CHAT_ID   The numeric chat id of the internal Quedic group
 *                (negative number, e.g. -4123456789)
 *
 * Optional env vars:
 *   ALLOWED_ORIGINS   Comma-separated list. Default:
 *                     "https://www.quedic.com,https://quedic.com"
 *
 * Deploy: paste the contents of this file into a new Worker at
 * https://dash.cloudflare.com/?to=/:account/workers — or use the
 * wrangler CLI (`wrangler deploy`).
 * ===================================================================== */

export default {
  async fetch(request, env, ctx) {
    // ---- CORS preflight ----------------------------------------------
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    // ---- Method gate -------------------------------------------------
    if (request.method !== 'POST') {
      return json({ error: 'Only POST is supported' }, 405, request, env);
    }

    // ---- Origin allow-list ------------------------------------------
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://www.quedic.com,https://quedic.com')
      .split(',')
      .map(s => s.trim());
    if (!allowed.includes(origin)) {
      return json({ error: 'Forbidden origin' }, 403, request, env);
    }

    // ---- Simple in-memory rate limit (per-IP, 6/min) ----------------
    // Uses the Cloudflare-provided `cf-connecting-ip` header. This
    // resets on Worker cold start, but for our scale that's fine —
    // legit customers won't hit it.
    if (env.RATE_LIMIT_KV) {
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      const key = `rl:${ip}`;
      const count = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0', 10);
      if (count >= 6) {
        return json({ error: 'Too many orders — please retry in 1 minute' }, 429, request, env);
      }
      // bump counter, 60-second TTL
      ctx.waitUntil(env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 60 }));
    }

    // ---- Parse + validate payload ----------------------------------
    let order;
    try {
      order = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON body' }, 400, request, env);
    }

    const requiredFields = ['package_id', 'amount', 'tx_hash', 'wallet', 'email'];
    for (const f of requiredFields) {
      if (!order[f] || typeof order[f] !== 'string') {
        return json({ error: `Missing field: ${f}` }, 400, request, env);
      }
    }

    // Cheap sanity check on tx_hash + wallet shape (BSC addresses are
    // 0x + 40 hex; tx hashes are 0x + 64 hex)
    if (!/^0x[a-fA-F0-9]{64}$/.test(order.tx_hash)) {
      return json({ error: 'tx_hash does not look like a transaction hash' }, 400, request, env);
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(order.wallet)) {
      return json({ error: 'wallet does not look like an address' }, 400, request, env);
    }

    // ---- Format Telegram message -----------------------------------
    const text = formatOrderMessage(order);

    // ---- Forward to Telegram ---------------------------------------
    if (!env.TG_TOKEN || !env.TG_CHAT_ID) {
      console.error('[order-relay] TG_TOKEN or TG_CHAT_ID not set in Worker env');
      return json({ error: 'Server not configured' }, 500, request, env);
    }

    const tgUrl = `https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`;
    const tgRes = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TG_CHAT_ID,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    if (!tgRes.ok) {
      const errBody = await tgRes.text();
      console.error('[order-relay] telegram api failed', tgRes.status, errBody);
      return json({ error: 'Notification delivery failed' }, 502, request, env);
    }

    return json({ ok: true }, 200, request, env);
  },
};

// ---- Helpers -------------------------------------------------------

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://www.quedic.com,https://quedic.com')
    .split(',')
    .map(s => s.trim());
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
    },
  });
}

function escapeMd(s) {
  // Telegram Markdown (legacy) — escape characters that would break parsing.
  // We use the v1 parser, not MarkdownV2, because v1 is more forgiving.
  if (typeof s !== 'string') return '';
  return s.replace(/([_*`\[])/g, '\\$1');
}

function truncate(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function formatOrderMessage(o) {
  const lines = [];
  lines.push('🛒 *Quedic Shop Order*');
  lines.push('');
  lines.push(`📦 *Package:* ${escapeMd(truncate(o.package_title || o.package_id, 120))}`);
  lines.push(`💳 *Amount:* ${escapeMd(String(o.amount))} ${escapeMd(o.token || 'USDT')}`);
  lines.push(`🔗 *Tx:* \`${o.tx_hash}\``);
  lines.push(`🌐 *Chain:* ${escapeMd(o.chain || 'BNB Smart Chain')}`);
  lines.push('');
  if (o.project_name) lines.push(`👤 *Project:* ${escapeMd(truncate(o.project_name, 80))}`);
  lines.push(`📧 *Email:* ${escapeMd(o.email)}`);
  if (o.telegram) lines.push(`💬 *Telegram:* ${escapeMd(o.telegram)}`);
  if (o.target_url) lines.push(`🎯 *Target URL:* ${escapeMd(truncate(o.target_url, 200))}`);
  if (o.notes) lines.push(`📝 *Notes:* ${escapeMd(truncate(o.notes, 400))}`);
  lines.push('');
  const explorer = o.block_explorer || (`https://bscscan.com/tx/${o.tx_hash}`);
  lines.push(`🔍 [View on BscScan](${explorer})`);
  if (o.wallet) lines.push(`💼 *Wallet:* \`${o.wallet}\``);
  if (o.lang) lines.push(`🌍 *Lang:* ${escapeMd(o.lang)}`);
  return lines.join('\n');
}
