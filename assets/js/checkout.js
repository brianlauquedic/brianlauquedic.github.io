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
  function discoverWallets() {
    state.detectedProviders = [];
    // EIP-6963 — wallets announce themselves on this event
    window.addEventListener('eip6963:announceProvider', function (event) {
      if (!event.detail) return;
      var info = event.detail.info || {};
      state.detectedProviders.push({
        provider: event.detail.provider,
        label: info.name || 'Wallet',
        rdns: info.rdns,
        icon: info.icon
      });
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Allow a tick for synchronous announcements to land
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
          // Avoid duplicates
          var alreadyHave = state.detectedProviders.some(function (w) {
            return w.provider === window.ethereum;
          });
          if (!alreadyHave) {
            state.detectedProviders.push({ provider: window.ethereum, label: label });
          }
        }
      }
      var noWallet = $('[data-checkout-no-wallet]');
      var connectBtn = $('[data-checkout-connect]');
      if (state.detectedProviders.length === 0) {
        show(noWallet);
        if (connectBtn) connectBtn.disabled = true;
      } else {
        hide(noWallet);
      }
    }, 300);
  }

  // ---- 4. Connect wallet ----------------------------------------------
  async function connect(preferredProvider) {
    var entry;
    if (preferredProvider) {
      entry = state.detectedProviders.find(function (w) { return w.provider === preferredProvider; });
    } else if (state.detectedProviders.length === 1) {
      entry = state.detectedProviders[0];
    } else {
      // Multiple — show picker
      return showWalletPicker();
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
    hide($('[data-checkout-chain-warn]'));
    show($('[data-checkout-connect]'));
    setStep('wallet');
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

      // Notify Quedic team via Formspree (parallel — don't block UX waiting on receipt)
      submitFormspree({
        package_id: state.pkg.id,
        package_title: state.pkg.title,
        token: state.token,
        amount: price,
        wallet: state.account,
        tx_hash: txHash,
        chain: CONFIG.chain.name,
        chain_id: CONFIG.chain.id,
        block_explorer: CONFIG.chain.block_explorer + '/tx/' + txHash,
        project_name: form.elements['project_name'].value,
        email: form.elements['email'].value,
        telegram: form.elements['telegram'].value,
        notes: form.elements['notes'].value,
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

  function submitFormspree(payload) {
    if (!CONFIG.formspree || CONFIG.formspree.indexOf('your-id') !== -1) {
      console.warn('[checkout] formspree endpoint not configured — order email skipped');
      return Promise.resolve();
    }
    var fd = new FormData();
    Object.keys(payload).forEach(function (k) { fd.append(k, payload[k] == null ? '' : String(payload[k])); });
    return fetch(CONFIG.formspree, {
      method: 'POST',
      body: fd,
      headers: { 'Accept': 'application/json' }
    }).catch(function (e) {
      // Email sending must never break the UX — log only.
      console.error('[checkout] formspree post failed', e);
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
      var searchCards = Array.from(document.querySelectorAll('.quickbuy-card[data-searchable]'));
      var searchRows = Array.from(document.querySelectorAll('.shop-row[data-searchable]'));
      var searchCategs = Array.from(document.querySelectorAll('.shop-categ'));
      // Remember the user's manual open/close state so we can restore it
      // when they clear the search.
      var prevOpenState = new WeakMap();

      var normalize = function (s) {
        return (s || '').toString().toLowerCase().normalize('NFKC');
      };

      var applySearch = function (raw) {
        var q = normalize(raw).trim();
        var hasQuery = q.length > 0;

        // First-time entering search mode — snapshot which categories
        // were open so we can restore on clear.
        if (hasQuery && !applySearch._snapshotted) {
          searchCategs.forEach(function (c) { prevOpenState.set(c, c.open); });
          applySearch._snapshotted = true;
        }

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

        // Status / clear button visibility
        if (hasQuery) {
          if (searchClear) searchClear.removeAttribute('hidden');
          if (searchStatus) {
            var totalVisible = visibleCardCount + visibleRowCount;
            var label = (CONFIG.labels && CONFIG.labels.search_matches) || 'matches';
            searchStatus.innerHTML = '<em>' + totalVisible + '</em> ' + label;
            searchStatus.removeAttribute('hidden');
          }
          if (searchNoResults) {
            if (visibleCardCount + visibleRowCount === 0) searchNoResults.removeAttribute('hidden');
            else searchNoResults.setAttribute('hidden', '');
          }
        } else {
          if (searchClear) searchClear.setAttribute('hidden', '');
          if (searchStatus) searchStatus.setAttribute('hidden', '');
          if (searchNoResults) searchNoResults.setAttribute('hidden', '');
          applySearch._snapshotted = false;
        }
      };

      // Debounce input for smoother typing
      var searchTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        var val = searchInput.value;
        searchTimer = setTimeout(function () { applySearch(val); }, 80);
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
