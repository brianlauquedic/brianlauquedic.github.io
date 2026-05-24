# CLAUDE.md — Quedic 项目操作手册（给 AI 助手看的）

> **读者**: Claude / 任何接手这个 repo 的 AI 助手。
> **作用**: 把"非显然的工作流 + 已踩坑 + 项目内部约定"写一次，省后续每次会话的重复探索。
> **README.md 写的是"这是什么"**；本文档写的是"**怎么操作 + 哪里坑**"。两文件互补，不重复。

---

## 🚨 5 条铁律（违反 = 出 bug）

1. **源码目录不是 git repo** —— 改完代码必须 rsync 到 `/tmp/quedic-deploy` 才能 commit + push
2. **rsync 必须用 `--filter='P .git/'`** —— 不能用 `--exclude '.git'`，那个会把部署 repo 的 .git 顶层文件删掉（HEAD / config / index 全没），repo 直接报废
3. **git 命令必须带代理** —— `-c http.proxy=http://127.0.0.1:7897`，否则连不上 GitHub
4. **push 必须双分支** —— `origin master` + `origin master:redesign`，缺一个 redesign 分支会落后
5. **任何用户可见的文案改动 = 改 3 个语言版本** —— EN / ZH-TW / JA 必须同步，少一个就是 bug

---

## 📂 两个目录的对应关系

```
源码（编辑这里）                  部署 repo（push 这里）
─────────────────────             ──────────────────────
~/Downloads/                      /tmp/quedic-deploy/
  brianlauquedic.github.io-master/  ├─ .git/      ← 真正的 git 元数据在这里
  ├─ _data/                         ├─ _data/
  ├─ _includes/                     ├─ _includes/
  ├─ zh-tw/                         ├─ zh-tw/
  ├─ ja/                            ├─ ja/
  └─ ...（无 .git）                 └─ ...
       │                                ▲
       └─────── rsync ──────────────────┘
```

部署 repo 是**临时目录**，可能被清掉或损坏。**任何时候发现 `/tmp/quedic-deploy` 不存在或 `git status` 报错，重新 clone**：

```bash
rm -rf /tmp/quedic-deploy
git -c http.proxy=http://127.0.0.1:7897 \
  clone https://github.com/brianlauquedic/brianlauquedic.github.io.git \
  /tmp/quedic-deploy
```

---

## 🚀 标准部署流程（完整、可直接 copy-paste）

```bash
# 1. 同步源码 → 部署 repo（保护 .git 不被破坏）
rsync -a --delete --filter='P .git/' --filter='P .github/' \
  --exclude '.claude' --exclude '.vscode' --exclude '_site' \
  --exclude '.jekyll-cache' --exclude '.sass-cache' --exclude 'node_modules' \
  /Users/brianlau/Downloads/brianlauquedic.github.io-master/ \
  /tmp/quedic-deploy/

# 2. 看改了什么（sanity check）
cd /tmp/quedic-deploy && git status --short
cd /tmp/quedic-deploy && git diff --stat | head -10

# 3. commit（用 heredoc 保格式，commit 信息要解释"为什么改"而不是"改了什么"）
cd /tmp/quedic-deploy && git add -A && \
  git -c http.proxy=http://127.0.0.1:7897 commit -m "$(cat <<'EOF'
vXX.Y: <一句话标题>

<2-4 段背景 + 根因 + 改法。优先说"为什么"，不只说"改了什么"。>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# 4. 双分支 push（缺一个都不行）
cd /tmp/quedic-deploy && \
  git -c http.proxy=http://127.0.0.1:7897 push origin master
cd /tmp/quedic-deploy && \
  git -c http.proxy=http://127.0.0.1:7897 push origin master:redesign

# 5. 等 GitHub Pages 部署
cd /tmp/quedic-deploy && \
  RUN_ID=$(gh run list --limit 1 --branch master --json databaseId -q '.[0].databaseId') && \
  echo "Run: $RUN_ID" && \
  until [ "$(gh run view $RUN_ID --json status -q .status 2>/dev/null)" = "completed" ]; do \
    sleep 10; \
  done && \
  gh run view $RUN_ID --json status,conclusion -q '"\(.status) \(.conclusion)"'

# 6. curl 验证生产环境真的更新了（带 ?v=$(date +%s) 绕开缓存）
curl -s "https://www.quedic.com/?v=$(date +%s)" | grep -E "<关键字>"
curl -s "https://www.quedic.com/zh-tw/?v=$(date +%s)" | grep -E "<关键字>"
curl -s "https://www.quedic.com/ja/?v=$(date +%s)" | grep -E "<关键字>"
```

---

## 🌍 三语言对称（最容易漏的纪律）

每个用户可见的页面 / 区块 / 文案，**默认有 3 个版本**：

| 内容类型 | EN（根） | ZH-TW | JA |
|---|---|---|---|
| Top-level pages | `index.md` `about.md` `shop.md` `brands.md` `contact.md` `playbook.md` `insights.md` `services.md` | `zh-tw/` 下同名 | `ja/` 下同名 |
| Industries | `_industries/*.md` | `_industries_zh/*.md` | `_industries_ja/*.md` |
| Services | `_services/*.md` | `_services_zh/*.md` | `_services_ja/*.md` |
| Section includes | `_includes/sections/*.html` | `_includes/sections-zh/*.html` | `_includes/sections-ja/*.html` |

**特殊情况** —— 这些文件是 **lang-aware**（用 Liquid 的 `page.lang` 判断渲染哪种语言），无需 3 份：
- `_includes/sections/shop-grid.html` —— Shop 主渲染
- `_includes/checkout-modal.html` —— 钱包/付款弹窗，含三语言 Liquid 分支

改了文案后**三语言抽查命令**：

```bash
for url in /shop/ /zh-tw/shop/ /ja/shop/; do
  echo "=== $url ==="
  curl -s "https://www.quedic.com${url}?v=$(date +%s)" | grep -oE "<期望出现的字串>" | head -3
done
```

---

## 🔑 关键文件清单（含职责）

| 文件 | 职责 |
|---|---|
| `_data/packages.yml` | **Shop 单一数据源** —— packages（主套餐 bundles）+ quick_buys（à la carte）+ pricing_tables（长尾按量 SKUs）。改价格 / 加包都在这里。 |
| `_includes/checkout-modal.html` | 钱包连接 + 表单 + 付款 UI。三语言 Liquid 分支（`{%- if lang == 'zh-tw' -%}` 那种）。`<script id="checkout-config" type="application/json">` 是 JS 配置桥。 |
| `assets/js/checkout.js` | 钱包连接（EIP-6963）+ ERC-20 transfer + Cloudflare Worker order relay。无外部库依赖。~1000 行。 |
| `_includes/sections/shop-grid.html` | Shop 主渲染逻辑（用 `page.lang` 切文案，一份模板服务三语言）。 |
| `_sass/_shop.scss` | Shop 样式（含 checkout modal 样式）。 |
| `_sass/_base.scss` | SCSS 变量（品牌色、字体、断点、radius 等）。 |
| `_sass/_layout.scss` | 站点级布局（.site-header / .site-footer 等）。 |
| `_sass/_sections.scss` | 首页 + about / industries / playbook 等页面区块样式。 |
| `cloudflare-worker/index.js` | 订单 endpoint 源码 —— **部署在 Cloudflare**，repo 里只是源码副本，改这里不会自动部署，需要去 Cloudflare dashboard 重新粘贴。 |
| `_data/menus.yml` | 导航菜单（main / main_zh / main_ja）。 |
| `_data/contact.yml` | 联系方式 / Telegram handles。 |

---

## 🔗 外部依赖

### Cloudflare Worker（订单 relay）
- URL: `https://quedic-orders.thatbrianlau.workers.dev`
- 作用: 接收 shop 订单 POST → 校验 + 转发到 Telegram 群
- env vars（在 Cloudflare dashboard 配）:
  - `TG_TOKEN` —— Telegram bot token
  - `TG_CHAT_ID` —— 目标群 chat_id（负数）
  - `ALLOWED_ORIGINS` —— CORS 白名单（应为 `https://www.quedic.com,https://quedic.com`）
- **改 Worker 代码后必须去 Cloudflare dashboard 手动重新部署** —— 不会自动同步 repo

### BSC（BNB Smart Chain，唯一支持的链）
- chainId: `56` (hex `0x38`)
- USDT 合约: `0x55d398326f99059fF775485246999027B3197955` （**18 decimals**, 不是 6！）
- USDC 合约: `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` （18 decimals）

### 收款钱包
- `0xa1d1eaffafda03fa1c30091e34655edea50d3bde`
- 在 `_data/packages.yml` 顶部 `receiving_wallet` 字段
- 改这个 = 把所有客户付款路由到不同地址，**慎改**

### Telegram bot
- Bot 名: Quedic Orders Bot
- Token 通过 Cloudflare env var 管，**不在 repo / 不在前端**
- 前端只 POST 到 Cloudflare Worker，Worker 才有 bot token

### 部署 / DNS
- GitHub Pages 部署 `master` 分支
- CNAME 文件指向 `www.quedic.com`
- DNS 配置在 GoDaddy（或同等注册商）—— 不在 repo 控制内

---

## ⚠️ 已知坑（按踩过频率排序）

### 1. rsync `--exclude '.git'` 破坏部署 repo
不要用 `--exclude '.git'`，会让 rsync 在 destination 端 delete .git 顶层文件。必须用：
```bash
rsync -a --delete --filter='P .git/' ...
```
`P` = protect，告诉 rsync 这个路径**不参与 delete 判定**。

### 2. Cloudflare Worker 要求 payload 字段全部 string
Worker 源码里有：
```js
if (!order[f] || typeof order[f] !== 'string') {
  return json({ error: `Missing field: ${f}` }, 400, ...);
}
```
前端 `notifyOrder()` 传数字字段（如 `amount`、`quantity`）必须 `String(...)` 转。否则 Worker 返 400，TG 群收不到订单。

### 3. 浏览器缓存 JS/CSS 10 分钟
Cloudflare 给静态资源加 `cache-control: max-age=600`。改了 JS/CSS 后：
- 用户测试要 **硬刷**（Cmd+Shift+R / Ctrl+Shift+R）
- 自己 curl 验证用 `?v=$(date +%s)` query 串绕缓存

### 4. iOS Safari 地址栏 resize 触发虚假 scroll 事件
iOS Safari 在滚动时会自动收缩地址栏 → viewport resize → 触发 `scroll` 事件。**不要写 scroll-direction-based auto-hide nav 类的逻辑**，会被这个机制干扰得忽显忽隐。

### 5. iOS notch 安全区（safe-area-inset-top）
Sticky header 如果不加 `padding-top: env(safe-area-inset-top)`，在有刘海/Dynamic Island 的 iPhone 上，page content 会从 header 上方"露馅"。`.site-header` 已经修过这个（见 v26.5 commit）。新加 sticky 元素时记得：
```scss
top: calc(<header-height>px + env(safe-area-inset-top));
```

### 6. Checkout modal 表单字段跨 modal 打开是粘性的
modal 关闭只是 `aria-hidden="true"`，DOM 不 destroy。`<input value="...">` 保留。**这是设计** —— 同一客户连续下单不用重填。但**代理 / 自由职业者帮多客户下单时会串号**。已加 v26.4 身份横幅 + "Use different contact" 一键清空。新加表单字段时考虑这个生命周期。

### 7. `<input type="url">` 严格要求 https:// 前缀
没有协议前缀（如 `t.me/yourgroup`）会被 HTML5 判 invalid → `form.checkValidity()` 返 false。`target_url` 字段就是这种 input。如果将来加新 URL 字段，要么提示用户带 `https://`，要么用 `type="text"` + 手动校验。

### 8. checkout modal 的 `$()` / `$$()` 是 scoped 到 modal
checkout.js 里的 `$()` 和 `$$()` helper 是用 modal 容器作为 root 来 querySelector 的，不是全局。要选 modal 外的元素（如 shop-grid 上的卡片）必须用 `document.querySelector(...)`。

---

## ✅ 验证命令模板

### 部署后看 master 分支 latest run 状态
```bash
cd /tmp/quedic-deploy && gh run list --limit 3 --branch master | head -5
```

### 等 latest run 跑完
```bash
cd /tmp/quedic-deploy && \
  RUN_ID=$(gh run list --limit 1 --branch master --json databaseId -q '.[0].databaseId') && \
  until [ "$(gh run view $RUN_ID --json status -q .status 2>/dev/null)" = "completed" ]; do \
    sleep 10; \
  done && \
  gh run view $RUN_ID --json status,conclusion -q '"\(.status) \(.conclusion)"'
```

### 三语言 curl 抽查
```bash
for path in / /zh-tw/ /ja/ /shop/ /zh-tw/shop/ /ja/shop/; do
  echo "=== $path ==="
  curl -s "https://www.quedic.com${path}?v=$(date +%s)" | grep -oE "<期望字串>" | head -2
done
```

### 检查 SCSS 编译结果
```bash
curl -s "https://www.quedic.com/assets/css/style.css?v=$(date +%s)" | grep -oE "<class-name>" | sort -u
```

### 检查 JS 部署
```bash
curl -s "https://www.quedic.com/assets/js/checkout.js?v=$(date +%s)" | grep -c "<新函数名>"
```

---

## ❌ 不要做的事

1. **不要 force push**（特别是 `redesign` 分支，它是历史快照保险）
2. **不要 `--no-verify` / 跳 hooks**
3. **不要单语言改文案** —— EN / ZH / JA 必须同步
4. **不要在 commit 信息里编数字** —— 没有 "tier-1 hits"、"600+ clients"、"X% conversion lift"。Quedic 是新公司，**没有真实战绩可用**，捏造 = 法务/品牌风险
5. **不要把 receiving_wallet / TG token 改到代码注释 / commit message 里**
6. **不要部署没在三语言 shop curl 验证就 declare 完成**
7. **不要漏 `master:redesign` push** —— 单 push master 会导致 redesign 落后
8. **不要直接编辑 `/tmp/quedic-deploy` 里的文件** —— 那是 rsync 目标，下次 rsync 会被覆盖。所有编辑都在源码目录做

---

## 🎨 设计常量（用品牌色时直接查这里）

| 用途 | 值 |
|---|---|
| 主背景 | `#FFFFFF` |
| 次级区块底 | `#FAFAFC` 或 `#F5F5FA`（交替条纹） |
| 强调底色（淡紫） | `#F3F0FB` |
| **品牌紫**（主 accent） | `#5B2FD9` |
| 品牌紫深（hover/pressed） | `#4520A8` |
| 品牌紫亮（accent） | `#7C4DFF` |
| 正文文字 | `#0A0A0F` |
| 次级文字 | `#5C5C6A` |
| 元数据 / 小标签 | `#9A9AAB` |
| 边框线 | `#EAEAF0` |
| 正文字体 | Inter（Google Fonts） |
| 标题字体 | Space Grotesk（Google Fonts） |
| 视觉定位 | 浅色 MarketAcross 风（白底 + 品牌紫点缀）+ Luna PR 的编号服务结构 |

SCSS 变量定义在 `_sass/_base.scss`。

---

## 🗂️ Commit 信息模板

```
vXX.Y: <一句话标题，动词开头，不超过 60 字符>

<段 1：背景 / 问题 / 用户反馈 —— 为什么要改>

<段 2：根因（如果是 bug） / 设计决策（如果是 feature）>

<段 3：具体怎么改的，逐文件 1-2 行>

<段 4（可选）：tradeoffs / 替代方案 / 后续不做的事>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

参考过往 commits（`v26.1 ~ v26.6` 都是这个格式）。**为什么 > 是什么** —— 6 个月后的自己看 diff 能看出"改了什么"，但只有 commit 信息能告诉你"为什么"。

---

## 📝 版本号约定

- `vN`（整数）= 大版本，新功能模块（v1 重设计、v6 Shop 上线、v20 Telegram bot 替代 Formspree、v24 数量下单、v26 mobile UX 重做…）
- `vN.M`（带小数）= 同版本内增量改 / bug 修 / polish（v25.1、v26.1、v26.5…）

参考 plan 文件 `/Users/brianlau/.claude/plans/dazzling-noodling-harp.md` 看完整版本历史 + 每版的 context。

---

## 🧭 拿到新任务的标准动作

1. **读这份文件** —— 30 秒过完铁律 + 流程
2. **看 plan 文件** —— `/Users/brianlau/.claude/plans/dazzling-noodling-harp.md` 有完整项目历史 + 已做决策
3. **改之前问** —— "这个改动是 user-facing 吗？" → 是 = 三语言同步；"这个改动需要部署吗？" → 是 = 走标准流程
4. **改之后必做** —— rsync → commit → 双分支 push → 等部署 → 三语言 curl 验证 → 报告结果

---

**最后**: 这份文档是活的。每次踩新坑、每次发现新约定，**回头来更新这里**。比每次重新踩坑便宜得多。
