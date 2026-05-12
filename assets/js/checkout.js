/* =====================================================================
 * Quedic Shop — on-chain checkout (BSC, USDT/USDC)
 *
 * Pure vanilla JS. No external libs. Reads config from the inline
 * <script id="checkout-config"> block emitted by the Liquid include.
 * ===================================================================== */
(function () {
  'use strict';

  // ---- 0. Bail if Shop modal not present on this page ------------------
  var modal = document.getElementById('checkout-modal');
  var configEl = document.getElementById('checkout-config');
  if (!modal || !configEl) return;

  var CONFIG;
  try { CONFIG = JSON.parse(configEl.textContent); }
  catch (e) { console.error('[checkout] bad config json', e); return; }

  // ---- 1. State --------------------------------------------------------
  var state = {
    provider: null,        // EIP-1193 provider currently in use
    providerLabel: null,   // human-readable wallet name
    account: null,         // 0x... lower-case
    chainId: null,         // hex string
    detectedProviders: [], // EIP-6963 announcements
    pkg: null,             // currently-selected package (data attrs from card)
    token: 'USDT'          // currency selection
  };

  // ---- 2. Tiny DOM helpers --------------------------------------------
  var $  = function (sel, root) { return (root || modal).querySelector(sel); };
  var $$ = function (sel, root) { return Array.from((root || modal).querySelectorAll(sel)); };

  function show(el) { if (el) el.removeAttribute('hidden'); }
  function hide(el) { if (el) el.setAttribute('hidden', ''); }
  function setText(sel, txt) { var el = $(sel); if (el) el.textContent = txt; }
  function shortAddr(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }

  // ---- 3. Wallet discovery (EIP-6963 + legacy fallbacks) ---------------
  // Promise-based core. Returns when discovery is complete (300ms
  // after dispatching the EIP-6963 request event, enough time for
  // synchronous announcements + late-injected window.ethereum).
  // Used both at startup and on-demand (when Connect / Switch wallet
  // is clicked) — late-injected wallets in mobile in-app browsers
  // are the main reason we re-run on demand.
  function reDiscover() {
    return new Promise(function (resolve) {
      state.detectedProviders = [];
      window.addEventListener('eip6963:announceProvider', function (event) {
        if (!event.detail) return;
        var info = event.detail.info || {};
        // Avoid double-adding the same provider on repeated discoveries
        var dup = state.detectedProviders.some(function (w) {
          return w.provider === event.detail.provider;
        });
        if (dup) return;
        state.detectedProviders.push({
          provider: event.detail.provider,
          label: info.name || 'Wallet',
          rdns: info.rdns,
          icon: info.icon
        });
      });
      window.dispatchEvent(new Event('eip6963:requestProvider'));

      setTimeout(function () {
        // Legacy fallbacks if no 6963 wallet announced
        if (state.detectedProviders.length === 0) {
          if (window.okxwallet) {
            state.detectedProviders.push({ provider: window.okxwallet, label: 'OKX Wallet' });
          }
          if (window.ethereum) {
            var label = window.ethereum.isMetaMask ? 'MetaMask'
                      : window.ethereum.isOkxWallet ? 'OKX Wallet'
                      : 'Browser Wallet';
            var dup = state.detectedProviders.some(function (w) {
              return w.provider === window.ethereum;
            });
            if (!dup) {
              state.detectedProviders.push({ provider: window.ethereum, label: label });
            }
          }
        }
        resolve();
      }, 300);
    });
  }

  // Refresh the wallet-step UI based on what's currently detected.
  // Extracted so disconnect() can re-run it after a fresh discovery.
  function refreshWalletUI() {
    var noWallet = $('[data-checkout-no-wallet]');
    var mobileOpen = $('[data-checkout-mobile-open]');
    var connectBtn = $('[data-checkout-connect]');
    if (state.detectedProviders.length === 0) {
      if (isMobileBrowser() && !isInWalletBrowser()) {
        show(mobileOpen);
        hide(noWallet);
        hide(connectBtn);
        wireDeepLinks();
      } else {
        show(noWallet);
        hide(mobileOpen);
        show(connectBtn);
        if (connectBtn) connectBtn.disabled = true;
      }
    } else {
      hide(noWallet);
      hide(mobileOpen);
      show(connectBtn);
      if (connectBtn) connectBtn.disabled = false;
    }
  }

  // Startup-time discovery — runs once on page load.
  function discoverWallets() {
    reDiscover().then(refreshWalletUI);
  }

  // True on iOS Safari / Chrome / WeChat / TG built-in browser etc.
  // — anywhere a Web3 extension can't run.
  function isMobileBrowser() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      .test(navigator.userAgent || '');
  }

  // True if we're already inside a wallet app's built-in dApp browser
  // (where window.ethereum would normally be there but we got here
  // before the injection completed). Defensive — if any of these UA
  // strings appear, we shouldn't push the user to "Open in app".
  function isInWalletBrowser() {
    var ua = navigator.userAgent || '';
    return /MetaMask|OKX|TokenPocket|imToken|Bitget|Trust/i.test(ua);
  }

  // Wire the two deep-link buttons. Platform-aware so we use the most
  // reliable deep-link form per OS — iOS prefers universal links,
  // Android benefits from intent: URLs with built-in fallback URLs.
  function wireDeepLinks() {
    var mmBtn = $('[data-checkout-open-in-mm]');
    var okxBtn = $('[data-checkout-open-in-okx]');
    var fullUrl = window.location.href;
    var encoded = encodeURIComponent(fullUrl);
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua);
    var isAndroid = /Android/i.test(ua);

    // MetaMask universal link works well on both iOS and Android —
    // metamask.app.link is registered with both Apple AASA and
    // Android assetlinks, so OS routes to the app when installed.
    if (mmBtn) {
      var host = window.location.host + window.location.pathname + window.location.search;
      mmBtn.href = 'https://metamask.app.link/dapp/' + host;
    }

    // OKX Wallet deep-linking is much less reliable than MetaMask —
    // OKX has shorter universal-link history and inconsistent app-side
    // routing. Best-effort by platform:
    //
    //   Android: intent: URL — most reliable on Android. Has a built-in
    //            S.browser_fallback_url so if OKX isn't installed,
    //            Chrome auto-redirects to the download page (no JS
    //            timeout shenanigans needed).
    //
    //   iOS:     universal link via okx.com — if AASA file routes the
    //            URL, OKX opens; otherwise browser falls through to
    //            the OKX web wallet page.
    //
    //   Other:   raw okx:// scheme as last resort.
    if (okxBtn) {
      if (isAndroid) {
        okxBtn.href = 'intent://wallet/dapp/details?dappUrl=' + encoded
          + '#Intent;scheme=okx;package=com.okinc.okex.gp'
          + ';S.browser_fallback_url=' + encodeURIComponent('https://www.okx.com/download')
          + ';end';
      } else if (isIOS) {
        okxBtn.href = 'https://www.okx.com/web3/wallet/dappBrowser?dappUrl=' + encoded;
      } else {
        okxBtn.href = 'okx://wallet/dapp/details?dappUrl=' + encoded;
      }
    }
  }

  // ---- 4. Connect wallet ----------------------------------------------
  async function connect(preferredProvider) {
    // If we have no providers cached, re-run discovery once before
    // giving up. Mobile in-app browsers sometimes inject window.ethereum
    // AFTER the initial 300ms timeout fires, leaving us with an empty
    // list at startup. Re-running on click gives the wallet a second
    // chance to announce itself.
    if (!preferredProvider && state.detectedProviders.length === 0) {
      await reDiscover();
      refreshWalletUI();
    }

    var entry;
    if (preferredProvider) {
      entry = state.detectedProviders.find(function (w) { return w.provider === preferredProvider; });
    } else if (state.detectedProviders.length === 1) {
      entry = state.detectedProviders[0];
    } else if (state.detectedProviders.length > 1) {
      // Multiple — show picker
      return showWalletPicker();
    } else {
      // Still 0 providers after retry — surface a real error so the
      // user knows what to do (previously fell through to showWalletPicker
      // which rendered an empty list = silent failure). Using alert
      // instead of showError to avoid bouncing user to the final-error
      // state — they can still retry from the connect step.
      var msg = (CONFIG.labels && CONFIG.labels.no_wallet_after_retry) ||
        'No Web3 wallet was detected. Please reload the page, or open this site inside your wallet app\'s built-in browser.';
      window.alert(msg);
      return;
    }
    if (!entry) return;

    try {
      var accounts = await entry.provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts[0]) throw new Error('No accounts returned');
      state.provider = entry.provider;
      state.providerLabel = entry.label;
      state.account = accounts[0].toLowerCase();
      state.chainId = await entry.provider.request({ method: 'eth_chainId' });

      // Listen for changes
      if (entry.provider.on) {
        entry.provider.on('accountsChanged', onAccountsChanged);
        entry.provider.on('chainChanged', onChainChanged);
      }

      renderConnected();
      maybeAdvanceStep();
    } catch (e) {
      console.error('[checkout] connect failed', e);
      showError(e && e.message ? e.message : 'Wallet connection failed.');
    }
  }

  function showWalletPicker() {
    var list = $('[data-checkout-wallet-options]');
    if (!list) return;
    list.innerHTML = '';
    state.detectedProviders.forEach(function (w) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'checkout__wallet-option';
      btn.innerHTML = (w.icon ? '<img src="' + w.icon + '" alt="" />' : '<span class="checkout__wallet-fallback-icon"></span>')
                    + '<span class="checkout__wallet-option-label">' + escapeHtml(w.label) + '</span>';
      btn.addEventListener('click', function () { connect(w.provider); });
      list.appendChild(btn);
    });
    show(list);
  }

  function disconnect() {
    if (state.provider && state.provider.removeListener) {
      state.provider.removeListener('accountsChanged', onAccountsChanged);
      state.provider.removeListener('chainChanged', onChainChanged);
    }
    state.provider = null;
    state.account = null;
    state.providerLabel = null;
    state.chainId = null;
    hide($('[data-checkout-wallet-state]'));
    hide($('[data-checkout-wallet-options]'));
    hide($('[data-checkout-chain-warn]'));
    setStep('wallet');
    // Re-run discovery so newly installed wallets (or wallets that
    // were late-injected) are picked up. Then refreshWalletUI shows
    // either the connect button, the picker, or the mobile / no-wallet
    // variants based on the new state.
    reDiscover().then(refreshWalletUI);
  }

  function onAccountsChanged(accounts) {
    if (!accounts || !accounts[0]) { disconnect(); return; }
    state.account = accounts[0].toLowerCase();
    renderConnected();
  }

  function onChainChanged(chainId) {
    state.chainId = chainId;
    renderConnected();
  }

  function renderConnected() {
    if (!state.account) return;
    hide($('[data-checkout-connect]'));
    hide($('[data-checkout-wallet-options]'));
    show($('[data-checkout-wallet-state]'));
    setText('[data-checkout-wallet-name]', state.providerLabel);
    setText('[data-checkout-wallet-addr]', shortAddr(state.account));

    // Chain check
    var onBsc = (state.chainId === CONFIG.chain.hex || parseInt(state.chainId, 16) === CONFIG.chain.id);
    if (onBsc) hide($('[data-checkout-chain-warn]'));
    else show($('[data-checkout-chain-warn]'));
  }

  async function switchToBsc() {
    if (!state.provider) return;
    try {
      await state.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CONFIG.chain.hex }]
      });
    } catch (e) {
      // 4902 = chain not added; try to add it
      if (e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902))) {
        try {
          await state.provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CONFIG.chain.hex,
              chainName: CONFIG.chain.name,
              rpcUrls: [CONFIG.chain.rpc],
              nativeCurrency: { name: CONFIG.chain.native_symbol, symbol: CONFIG.chain.native_symbol, decimals: 18 },
              blockExplorerUrls: [CONFIG.chain.block_explorer]
            }]
          });
        } catch (e2) {
          console.error('[checkout] addChain failed', e2);
          showError('Could not add BNB Smart Chain. Please add it manually in your wallet.');
        }
      } else {
        console.error('[checkout] switchChain failed', e);
      }
    }
  }

  // ---- 5. Step navigation ---------------------------------------------
  function setStep(name) {
    $$('[data-checkout-step]').forEach(function (el) {
      if (el.getAttribute('data-checkout-step') === name) show(el); else hide(el);
    });
    $$('[data-checkout-status]').forEach(hide);
  }

  function setStatus(name) {
    $$('[data-checkout-step]').forEach(hide);
    $$('[data-checkout-status]').forEach(function (el) {
      if (el.getAttribute('data-checkout-status') === name) show(el); else hide(el);
    });
  }

  function maybeAdvanceStep() {
    if (!state.account) return;
    var onBsc = (state.chainId === CONFIG.chain.hex || parseInt(state.chainId, 16) === CONFIG.chain.id);
    if (!onBsc) return;
    setStep('form');
  }

  // ---- 6. ERC-20 transfer calldata ------------------------------------
  // Build calldata for transfer(address,uint256) without any library.
  function buildTransferCalldata(recipient, amountWei) {
    var selector = '0xa9059cbb';
    var addr = recipient.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    var amt  = amountWei.toString(16).padStart(64, '0');
    return selector + addr + amt;
  }

  // Convert a decimal price (e.g. 8000) to a BigInt amount in wei
  // BSC USDT/USDC: 18 decimals
  function priceToWei(priceDecimal, decimals) {
    var bn = BigInt(priceDecimal);
    var mult = 10n ** BigInt(decimals);
    return bn * mult;
  }

  // ---- 7. Pay ---------------------------------------------------------
  async function pay() {
    if (!state.provider || !state.account) {
      setStep('wallet');
      return;
    }
    var onBsc = (state.chainId === CONFIG.chain.hex || parseInt(state.chainId, 16) === CONFIG.chain.id);
    if (!onBsc) {
      switchToBsc();
      return;
    }

    // Validate form
    var form = $('[data-checkout-form]');
    if (form && !form.reportValidity()) {
      setStep('form');
      return;
    }

    // Validate receiving wallet is set
    if (!CONFIG.receiving_wallet || /^0x0+$/i.test(CONFIG.receiving_wallet.replace(/^0x/, ''))) {
      showError('Receiving wallet is not configured. Please contact us by email — we cannot accept on-chain payments yet.');
      return;
    }

    var token = CONFIG.tokens[state.token];
    var price = state.token === 'USDT' ? state.pkg.priceUsdt : state.pkg.priceUsdc;
    var amountWei = priceToWei(price, token.decimals);
    var data = buildTransferCalldata(CONFIG.receiving_wallet, amountWei);

    setStatus('pending');
    setText('[data-checkout-pending-text]', CONFIG.labels.paying);

    try {
      var txHash = await state.provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: state.account,
          to: token.address,
          data: data,
          value: '0x0'
        }]
      });

      setText('[data-checkout-pending-text]', CONFIG.labels.pending);

      // Notify Quedic team — POST to the Cloudflare Worker, which
      // forwards a formatted message to the internal Telegram group.
      // Parallel — don't block UX while we wait for the on-chain receipt.
      // amount is String()'d because the Worker validates payload
      // fields with `typeof === 'string'` and bare numbers fail.
      notifyOrder({
        package_id: state.pkg.id,
        package_title: state.pkg.title,
        token: state.token,
        amount: String(price),
        wallet: state.account,
        tx_hash: txHash,
        chain: CONFIG.chain.name,
        chain_id: CONFIG.chain.id,
        block_explorer: CONFIG.chain.block_explorer + '/tx/' + txHash,
        project_name: form.elements['project_name'].value,
        email: form.elements['email'].value,
        telegram: form.elements['telegram'].value,
        notes: form.elements['notes'].value,
        // Only present for buy-traffic SKUs; undefined fields end up
        // empty in the email — that's the desired behavior.
        target_url: form.elements['target_url'] ? form.elements['target_url'].value : '',
        lang: CONFIG.lang
      });

      // Wait for tx receipt (max ~60s)
      await waitForReceipt(txHash, 60);
      onSuccess(txHash);
    } catch (e) {
      console.error('[checkout] pay failed', e);
      var msg = (e && e.message) ? e.message : 'Transaction failed.';
      // Common: user rejected
      if (e && (e.code === 4001 || (e.message || '').toLowerCase().includes('user rejected'))) {
        msg = 'Transaction was rejected in your wallet.';
      }
      showError(msg);
    }
  }

  function waitForReceipt(txHash, maxSeconds) {
    var maxAttempts = Math.max(1, Math.floor(maxSeconds / 3));
    return new Promise(function (resolve, reject) {
      var attempts = 0;
      function tick() {
        attempts += 1;
        state.provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash]
        }).then(function (rec) {
          if (rec && rec.blockNumber) return resolve(rec);
          if (attempts >= maxAttempts) {
            // Don't fail — receipt may still arrive; we already kicked off the email
            return resolve(null);
          }
          setTimeout(tick, 3000);
        }).catch(function (err) {
          if (attempts >= maxAttempts) return resolve(null);
          setTimeout(tick, 3000);
        });
      }
      tick();
    });
  }

  function notifyOrder(payload) {
    // Skip silently if endpoint placeholder is unfilled. Real bot
    // token + chat id live in Cloudflare Worker env vars; from the
    // browser side we just POST JSON to a public Worker URL.
    var endpoint = CONFIG.order_endpoint || '';
    if (!endpoint ||
        endpoint.indexOf('your-account') !== -1 ||
        endpoint === 'https://orders.quedic.com') {
      // The default value lives in _data/packages.yml; only POST
      // once the user has changed it to an actual deployed Worker.
      // We still allow orders.quedic.com if the user actually points
      // it at a real Worker — the heuristic is they edited yaml.
      // To avoid blocking real launch, check is loose: skip only
      // when explicitly placeholder strings appear.
      if (endpoint.indexOf('your-account') !== -1 || endpoint === '') {
        console.warn('[checkout] order_endpoint not configured — order relay skipped');
        return Promise.resolve();
      }
    }
    return fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          console.error('[checkout] order relay failed', res.status, body);
        });
      }
    }).catch(function (e) {
      // Order relay must never break the UX — log only. Customer's
      // payment is already on-chain; we can reconcile manually via
      // BscScan if Telegram delivery failed.
      console.error('[checkout] order relay post failed', e);
    });
  }

  function onSuccess(txHash) {
    setStatus('success');
    var link = $('[data-checkout-tx-link]');
    if (link) link.setAttribute('href', CONFIG.chain.block_explorer + '/tx/' + txHash);
  }

  function showError(msg) {
    setStatus('error');
    setText('[data-checkout-error-msg]', msg);
  }

  // ---- 8. Open / close modal -----------------------------------------
  function openModal(card) {
    // Three layouts share the same data attributes:
    // .shop-card (main bundles), .quickbuy-card (quick buys),
    // .shop-row (category-list <li>).
    var titleEl = card.querySelector('.shop-card__title, .quickbuy-card__title, .shop-row__title');
    var summaryEl = card.querySelector('.shop-card__summary, .quickbuy-card__desc');
    // For .shop-row, the row's data-searchable attr or title text is the label
    if (!titleEl && card.classList.contains('shop-row')) {
      titleEl = card.querySelector('.shop-row__title') || card;
    }
    state.pkg = {
      id: card.getAttribute('data-package-id'),
      priceUsdt: parseFloat(card.getAttribute('data-price-usdt')),
      priceUsdc: parseFloat(card.getAttribute('data-price-usdc')),
      recurring: card.getAttribute('data-recurring') === 'true',
      title: titleEl ? titleEl.textContent.trim() : '',
      summary: summaryEl ? summaryEl.textContent.trim() : ''
    };
    setText('[data-checkout-pkg-title]', state.pkg.title);
    setText('[data-checkout-pkg-summary]', state.pkg.summary);

    // Show / hide the monthly-renewal reminder for retainer packages
    var recNote = $('[data-checkout-recurring-note]');
    if (recNote) {
      if (state.pkg.recurring) recNote.removeAttribute('hidden');
      else recNote.setAttribute('hidden', '');
    }

    refreshPayLabel();

    // Reset state of stepper
    if (state.account) {
      maybeAdvanceStep();
    } else {
      setStep('wallet');
    }

    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('checkout-open');
  }

  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('checkout-open');
  }

  function refreshPayLabel() {
    var price = state.token === 'USDT' ? state.pkg.priceUsdt : state.pkg.priceUsdc;
    var label = CONFIG.labels.pay_btn
      .replace('{amount}', formatPrice(price))
      .replace('{token}', state.token);
    setText('[data-checkout-pay-label]', label);
  }

  function formatPrice(n) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- 9. Wire up event handlers --------------------------------------
  function bind() {
    // Open from any orderable element: package card, quick-buy card,
    // or category row (<li class="shop-row pricing-row">).
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-checkout-trigger]');
      if (!trigger) return;
      e.preventDefault();
      var card = trigger.closest('.shop-card, .quickbuy-card, .shop-row, .pricing-row');
      if (card) openModal(card);
    });

    // Category chips — jump nav, not show/hide filter.
    // Clicking a chip scrolls to the first card matching that category.
    // All cards stay visible at all times so customers can keep
    // browsing past the destination.
    // NOTE: must use document.querySelectorAll (not $$ helper) because
    // $$ is scoped to the checkout modal — chips live in the page body.
    var filterButtons = Array.from(document.querySelectorAll('.shop-filter'));
    if (filterButtons.length) {
      var mainCards = document.querySelectorAll('.shop-card[data-category]');
      var quickCards = document.querySelectorAll('.quickbuy-card[data-category]');

      // Virtual chip → real categories. Lets one chip ("Programs")
      // cover multiple thin tags (brand, launch, retainer) without
      // splitting them across separate chips.
      var virtualCategories = {
        programs: ['brand', 'launch', 'retainer']
      };

      var matchesCategory = function (cardCat, cat) {
        if (cat === 'all') return true;
        if (virtualCategories[cat]) return virtualCategories[cat].indexOf(cardCat) !== -1;
        return cardCat === cat;
      };

      var findFirstMatch = function (nodeList, cat) {
        for (var i = 0; i < nodeList.length; i++) {
          if (matchesCategory(nodeList[i].getAttribute('data-category'), cat)) {
            return nodeList[i];
          }
        }
        return null;
      };

      var scrollToCard = function (cat) {
        var target;
        if (cat === 'all') {
          // "全部" scrolls back to the top of the programs grid
          target = document.getElementById('programs');
        } else {
          // Prefer the main package grid; fall back to Quick Buys
          target = findFirstMatch(mainCards, cat) || findFirstMatch(quickCards, cat);
        }
        if (!target) return;

        // Account for sticky header (~104px) + sticky chip bar (~56px)
        var offset = 168;
        var top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });

        // Brief highlight on the destination card so customers see
        // exactly which item the chip pointed them to.
        var flashClass = null;
        if (target.classList.contains('shop-card')) flashClass = 'shop-card--just-jumped';
        else if (target.classList.contains('quickbuy-card')) flashClass = 'quickbuy-card--just-jumped';
        if (flashClass) {
          target.classList.add(flashClass);
          setTimeout(function () {
            target.classList.remove(flashClass);
          }, 1600);
        }
      };

      filterButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cat = btn.getAttribute('data-category');
          filterButtons.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          scrollToCard(cat);
        });
      });
    }

    // ----------------------------------------------------------------
    // À la carte search — filters quickbuy cards + category rows by
    // substring match against data-searchable. Auto-expands any
    // category whose rows match. Hides categories with no matches.
    // ----------------------------------------------------------------
    var searchInput = document.querySelector('[data-shop-search]');
    if (searchInput) {
      var searchClear = document.querySelector('[data-shop-search-clear]');
      var searchStatus = document.querySelector('[data-shop-search-status]');
      var searchNoResults = document.querySelector('[data-shop-search-no-results]');
      var searchCardsContainer = document.querySelector('[data-shop-cards]');
      var searchMainCards = Array.from(document.querySelectorAll('.shop-card[data-searchable]'));
      var searchCards = Array.from(document.querySelectorAll('.quickbuy-card[data-searchable]'));
      var searchRows = Array.from(document.querySelectorAll('.shop-row[data-searchable]'));
      var searchCategs = Array.from(document.querySelectorAll('.shop-categ'));
      // Remember the user's manual open/close state so we can restore it
      // when they clear the search.
      var prevOpenState = new WeakMap();
      // Suppress search while user is composing (IME for CJK input —
      // typing 中文/日本語 fires `input` continuously per keystroke).
      var imeComposing = false;

      var normalize = function (s) {
        return (s || '').toString().toLowerCase().normalize('NFKC');
      };

      var applySearch = function (raw) {
        var q = normalize(raw).trim();
        var hasQuery = q.length > 0;

        // Toggle the cards container into flex-wrap layout when
        // searching, so 1 visible card doesn't leave 2 blank columns.
        if (searchCardsContainer) {
          if (hasQuery) searchCardsContainer.setAttribute('data-search-active', 'true');
          else searchCardsContainer.removeAttribute('data-search-active');
        }

        // First-time entering search mode — snapshot which categories
        // were open so we can restore on clear.
        if (hasQuery && !applySearch._snapshotted) {
          searchCategs.forEach(function (c) { prevOpenState.set(c, c.open); });
          applySearch._snapshotted = true;
        }

        // Main package cards: never hide — they're context. Just
        // pulse the matching ones so the customer notices.
        var matchedMain = 0;
        searchMainCards.forEach(function (card) {
          var hay = normalize(card.getAttribute('data-searchable'));
          var match = hasQuery && hay.indexOf(q) !== -1;
          if (match) {
            card.classList.add('shop-card--search-match');
            matchedMain += 1;
          } else {
            card.classList.remove('shop-card--search-match');
          }
        });

        var visibleCardCount = 0;
        searchCards.forEach(function (card) {
          var hay = normalize(card.getAttribute('data-searchable'));
          var match = !hasQuery || hay.indexOf(q) !== -1;
          if (match) {
            card.removeAttribute('data-search-hidden');
            visibleCardCount += 1;
          } else {
            card.setAttribute('data-search-hidden', '');
          }
        });

        var visibleRowCount = 0;
        searchRows.forEach(function (row) {
          var hay = normalize(row.getAttribute('data-searchable'));
          var match = !hasQuery || hay.indexOf(q) !== -1;
          if (match) {
            row.removeAttribute('data-search-hidden');
            visibleRowCount += 1;
          } else {
            row.setAttribute('data-search-hidden', '');
          }
        });

        // Hide entire category if 0 matching rows; otherwise show + open
        searchCategs.forEach(function (categ) {
          var anyVisible = !!categ.querySelector('.shop-row:not([data-search-hidden])');
          if (!hasQuery) {
            categ.removeAttribute('data-search-hidden');
            // Restore prior open/close state
            categ.open = prevOpenState.get(categ) || false;
          } else if (anyVisible) {
            categ.removeAttribute('data-search-hidden');
            categ.open = true; // auto-expand to surface matches
          } else {
            categ.setAttribute('data-search-hidden', '');
          }
        });

        // Status / clear button visibility. When zero matches, suppress
        // the count line and show only the no-results panel — the count
        // would just say "0" alongside the panel, which is redundant.
        // Main-package matches counted separately — they get a pulse,
        // not a hide, but they should bump the total visible count.
        var totalVisible = visibleCardCount + visibleRowCount + matchedMain;
        if (hasQuery) {
          if (searchClear) searchClear.removeAttribute('hidden');
          if (searchStatus) {
            if (totalVisible > 0) {
              var label = (CONFIG.labels && CONFIG.labels.search_matches) || 'matches';
              searchStatus.innerHTML = '<em>' + totalVisible + '</em> ' + label;
              searchStatus.removeAttribute('hidden');
            } else {
              searchStatus.setAttribute('hidden', '');
            }
          }
          if (searchNoResults) {
            if (totalVisible === 0) searchNoResults.removeAttribute('hidden');
            else searchNoResults.setAttribute('hidden', '');
          }
        } else {
          if (searchClear) searchClear.setAttribute('hidden', '');
          if (searchStatus) searchStatus.setAttribute('hidden', '');
          if (searchNoResults) searchNoResults.setAttribute('hidden', '');
          applySearch._snapshotted = false;
        }
      };

      // Debounce input for smoother typing. Skip while IME composing
      // — only fire when the user has finalized a CJK composition.
      var searchTimer;
      var queueSearch = function () {
        if (imeComposing) return;
        clearTimeout(searchTimer);
        var val = searchInput.value;
        searchTimer = setTimeout(function () { applySearch(val); }, 80);
      };
      searchInput.addEventListener('input', queueSearch);
      searchInput.addEventListener('compositionstart', function () {
        imeComposing = true;
      });
      searchInput.addEventListener('compositionend', function () {
        imeComposing = false;
        queueSearch();
      });

      if (searchClear) {
        searchClear.addEventListener('click', function () {
          searchInput.value = '';
          applySearch('');
          searchInput.focus();
        });
      }
    }

    // Smooth-scroll for sticky shop nav anchors
    document.querySelectorAll('.shop-jump a').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var href = a.getAttribute('href') || '';
        if (href.charAt(0) !== '#') return;
        var target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        // Account for sticky header (~104px) + sticky shop-jump (~52px) so
        // the destination heading isn't hidden under the bars.
        var offset = 160;
        var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: top, behavior: 'smooth' });
      });
    });

    // Close handlers
    $$('[data-checkout-close]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeModal();
    });

    // Wallet
    var connectBtn = $('[data-checkout-connect]');
    if (connectBtn) connectBtn.addEventListener('click', function () { connect(); });
    var disconnectBtn = $('[data-checkout-disconnect]');
    if (disconnectBtn) disconnectBtn.addEventListener('click', disconnect);
    var switchBtn = $('[data-checkout-switch-chain]');
    if (switchBtn) switchBtn.addEventListener('click', switchToBsc);

    // Token toggle
    $$('[data-checkout-token]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('[data-checkout-token]').forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        state.token = btn.getAttribute('data-checkout-token');
        refreshPayLabel();
      });
    });

    // Form submit blocking (we call pay() ourselves)
    var form = $('[data-checkout-form]');
    if (form) {
      form.addEventListener('submit', function (e) { e.preventDefault(); pay(); });
      form.addEventListener('input', function () {
        // After form valid, advance to pay step automatically
        if (form.checkValidity()) setStep('pay');
      });
    }

    // Pay button
    var payBtn = $('[data-checkout-pay]');
    if (payBtn) payBtn.addEventListener('click', pay);

    // Retry
    var retryBtn = $('[data-checkout-retry]');
    if (retryBtn) retryBtn.addEventListener('click', function () { setStep('pay'); });
  }

  // ---- 10. Boot --------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bind(); discoverWallets(); });
  } else {
    bind();
    discoverWallets();
  }
})();
