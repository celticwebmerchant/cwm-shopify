/* ==========================================================================
   BLOCK-CART-FREESHIP
   Live free-shipping progress bar. Reads the server-injected config and
   recomputes remaining / progress on every cart change via window.CartEvents.
   Money formatting mirrors html-product-price / theme-search formatMoney.

   NOTE on load order: theme-cart.js (which defines window.CartEvents) is
   loaded by block-cart-order, which sits BELOW this section. Deferred
   scripts run in DOM order, so this file may execute before CartEvents
   exists — we therefore bind lazily once it becomes available.
   ========================================================================== */
(function () {
  'use strict';

  function initFreeship(root) {
    if (!root || root.dataset.freeshipInit) return;
    root.dataset.freeshipInit = 'true';

    var configEl = root.querySelector('[data-freeship-config]');
    if (!configEl) return;

    var config;
    try {
      config = JSON.parse(configEl.textContent);
    } catch (e) {
      return;
    }

    var messageEl = root.querySelector('[data-freeship-message]');
    var fillEl = root.querySelector('[data-freeship-fill]');
    var trackEl = root.querySelector('[role="progressbar"]');
    // Hide the full-width section wrapper (incl. background) when present;
    // fall back to the component root for a standalone (cart-preview) render.
    var wrapper = root.closest('.block-cart-freeship') || root;

    function formatMoney(cents) {
      var c = config.currency || {};
      var symbol = c.symbol || '€';
      var decSep = /\d/.test(c.decimalSeparator) ? ',' : (c.decimalSeparator || ',');
      var thouSep = (typeof c.thousandsSeparator === 'string') ? c.thousandsSeparator : '.';
      if (/\d/.test(thouSep)) thouSep = '';

      var amount = (Math.abs(cents) / 100).toFixed(2);
      var parts = amount.split('.');
      var before = thouSep ? parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thouSep) : parts[0];
      var after = parts[1];

      if (config.hideZeroCents && after === '00') {
        return '<span class="price"><span class="valuta">' + symbol + '</span><span class="before_seperator">' + before + '</span></span>';
      }
      return '<span class="price"><span class="valuta">' + symbol + '</span><span class="before_seperator">' + before + '</span><span class="seperator">' + decSep + '</span><span class="after_seperator">' + after + '</span></span>';
    }

    function render(cart) {
      var threshold = config.threshold || 0;
      if (threshold <= 0) return;

      var basisCents = (config.basis === 'subtotal' && cart.items_subtotal_price != null)
        ? cart.items_subtotal_price
        : cart.total_price;
      var itemCount = (cart.item_count != null) ? cart.item_count : 1;

      // Empty-cart visibility
      if (itemCount === 0 && !config.showWhenEmpty) {
        wrapper.hidden = true;
        return;
      }
      wrapper.hidden = false;

      var remaining = threshold - basisCents;
      var reached = remaining <= 0;
      var percent = Math.min(100, Math.round((basisCents * 100) / threshold));

      root.classList.toggle('cart-freeship--reached', reached);
      if (fillEl) fillEl.style.width = (reached ? 100 : percent) + '%';
      if (trackEl) trackEl.setAttribute('aria-valuenow', reached ? 100 : percent);

      if (messageEl) {
        if (reached) {
          messageEl.textContent = config.texts.reached;
        } else {
          messageEl.innerHTML = config.texts.remaining.replace('{amount}', formatMoney(remaining));
        }
      }
    }

    // --- Bind to cart events, load-order safe ---------------------------------
    // cart:update is published for add / change / update / note / clear /
    // remove (remove routes through change()), so one subscription covers all.
    var bound = false;
    function bind() {
      if (bound) return true;
      if (window.CartEvents && typeof window.CartEvents.subscribe === 'function') {
        window.CartEvents.subscribe('cart:update', function (data) {
          if (data && data.cart) render(data.cart);
        });
        bound = true;
      }
      return bound;
    }

    if (!bind()) {
      // theme-cart.js is deferred and lives below us; it will exist by
      // DOMContentLoaded. Retry as a fallback for editor re-renders too.
      document.addEventListener('DOMContentLoaded', bind);
      var tries = 0;
      var timer = setInterval(function () {
        if (bind() || ++tries > 50) clearInterval(timer);
      }, 100);
    }
  }

  function initAll(scope) {
    (scope || document).querySelectorAll('[data-cart-freeship]').forEach(initFreeship);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(); });
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', function (e) {
    if (e && e.target) initAll(e.target);
  });
})();
