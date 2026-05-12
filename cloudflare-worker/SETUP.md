# Quedic Order Relay — Cloudflare Worker Setup

This Worker sits between the public Quedic shop site and the
Telegram Bot API. It keeps your Telegram bot token off the frontend
so nobody can copy-paste it out of view-source and abuse your bot.

**Estimated time: 30 minutes one-time setup.**

---

## Step 1 — Create your Telegram bot (5 min)

1. Open Telegram, search for **@BotFather**.
2. Send `/newbot`.
3. Pick a name (e.g. `Quedic Orders`) and a username ending in `bot`
   (e.g. `quedic_orders_bot`).
4. BotFather replies with a token like:
   ```
   8123456789:AAHbcDefGhIjKlMnOpQrStUvWxYz_aBcDeFgH
   ```
   **Save this** — it's your `TG_TOKEN`.

## Step 2 — Create the internal Quedic order group (3 min)

1. In Telegram, **create a new group** named e.g. `Quedic Orders`.
   Add your team members.
2. Add the bot you just created to the group.
3. Send any message in the group (e.g. `hi`) so the bot has at least
   one update to report on.
4. In your browser, open:
   ```
   https://api.telegram.org/bot<TG_TOKEN>/getUpdates
   ```
   (Replace `<TG_TOKEN>` with the token from Step 1.)
5. In the JSON response, find `"chat":{"id": -1234567890`. Copy that
   **negative number** — it's your `TG_CHAT_ID`.

## Step 3 — Deploy the Worker (15 min)

### Option A — Cloudflare dashboard (no CLI needed)

1. Sign up / log in at https://dash.cloudflare.com (free tier is
   enough — 100,000 requests / day).
2. **Workers & Pages → Create application → Create Worker**.
3. Name it `quedic-orders`. Click **Deploy** to get the default
   placeholder Worker live.
4. Click **Edit code**. Replace the placeholder with the entire
   contents of [`index.js`](./index.js). Click **Deploy**.
5. Back on the Worker page, **Settings → Variables → Add variable**.
   Add three variables (mark TG_TOKEN and TG_CHAT_ID as
   **Encrypted**):

   | Variable name      | Value                                | Encrypted? |
   |--------------------|--------------------------------------|------------|
   | `TG_TOKEN`         | `8123…aBcDeFgH` (from Step 1)        | ✅ Yes     |
   | `TG_CHAT_ID`       | `-1234567890` (from Step 2)          | ✅ Yes     |
   | `ALLOWED_ORIGINS`  | `https://www.quedic.com,https://quedic.com` | No  |

6. **Settings → Triggers**. Note the default URL like:
   ```
   https://quedic-orders.<your-account>.workers.dev
   ```
   That's your Worker endpoint. (See Step 4 for an optional custom
   domain.)

### Option B — Wrangler CLI

```bash
npm install -g wrangler
wrangler login
cd cloudflare-worker
wrangler secret put TG_TOKEN          # paste the token
wrangler secret put TG_CHAT_ID        # paste the chat id
wrangler deploy                       # uses wrangler.toml
```

## Step 4 (Optional) — Custom subdomain like `orders.quedic.com`

1. In Cloudflare dashboard, **Workers & Pages → quedic-orders →
   Settings → Triggers → Add Custom Domain**.
2. Enter `orders.quedic.com` and click **Add**.
3. Cloudflare auto-creates a CNAME record for you (if your domain is
   already on Cloudflare DNS — if it's on GoDaddy/Namecheap/etc.,
   you'll need to add a CNAME manually pointing
   `orders → quedic-orders.<your-account>.workers.dev`).

## Step 5 — Tell the website where to send orders

In the repo, edit `_data/packages.yml`:

```yaml
# ⚠️ MUST be a real Worker endpoint before orders can flow.
order_endpoint: "https://quedic-orders.<your-account>.workers.dev"
# OR with custom domain:
# order_endpoint: "https://orders.quedic.com"
```

Commit and push. GitHub Pages redeploys in ~1 minute.

## Step 6 — End-to-end test

1. Open https://www.quedic.com/shop/
2. Click the **TEST** card (1 USDT, top-left dashed grey card).
3. Connect your wallet, fill in email, click **Pay**.
4. Sign the 1 USDT transfer in your wallet.
5. Wait for the BSC confirmation (usually < 5 seconds).
6. Check your Quedic order Telegram group — you should see a
   formatted message with package, amount, tx hash, BscScan link,
   wallet, email, etc.

If you don't see a message:
- Open DevTools → Network tab → look for the request to your
  Worker URL. Check the response body for the error message.
- Common errors:
  - `403 Forbidden origin` — `ALLOWED_ORIGINS` doesn't include the
    site you're testing from.
  - `500 Server not configured` — `TG_TOKEN` or `TG_CHAT_ID` env
    vars not set in the Worker.
  - `502 Notification delivery failed` — Telegram rejected the
    message; check Worker logs (Cloudflare dashboard → Workers →
    quedic-orders → Logs) for the actual Telegram error.

---

## Worker monitoring

Cloudflare gives you a free dashboard showing:
- Request count
- Error rate
- p50 / p95 / p99 latency
- Real-time logs (Tail)

At Workers & Pages → quedic-orders → **Metrics** / **Logs**.

## Updating the Worker

Just paste new `index.js` contents into the dashboard editor (or run
`wrangler deploy` again). Cloudflare propagates the new version
globally within seconds.

## Costs

Free tier: **100,000 requests / day**, plenty for Quedic. If you
ever exceed it, the paid plan is $5 / month for 10 million requests.

---

## Security model recap

- ✅ Telegram bot token NEVER touches the browser — stays as
  encrypted Worker env var
- ✅ Only requests from `quedic.com` are accepted (origin check)
- ✅ Per-IP rate limiting drops obvious spam (with KV namespace)
- ✅ Payload shape validated before forwarding
- ⚠️ Worker URL itself is public — but with origin allow-list, an
  attacker can't usefully POST to it from a different domain
- ⚠️ If someone clones your site to a different domain AND adds your
  domain to the allow-list bypass, they could spam your group.
  Mitigation: monitor logs; rotate the bot token if you see abuse
  (recreate via @BotFather, update Worker env, redeploy — 5 min).
