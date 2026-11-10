/**
 * BLOCK-MARKETING-SHOWCASE
 * All behaviour is delegated on document, so it also works for content that
 * is swapped in later (related showcases, product-page modal).
 *
 * - Dot modal: positioned next to its dot on desktop (mobile = CSS bottom
 *   sheet), previous/next through the showcase, aria-expanded on the dot.
 * - Variant choice: buttons update the html-button-order form's hidden id
 *   input; the add button stays disabled until a variant is chosen.
 * - Dot ↔ product card highlight on hover/focus.
 * - "Show all products": opens the full showcase in a page modal.
 * - Related showcases: swapped in place via the Section Rendering API on the
 *   showcase page, with a "back to …" button. Outside a showcase block
 *   (product page) the showcase opens in a modal instead.
 * Cart handling is NOT here: html-button-order + theme-cart.js interceptor.
 */
(function () {
  'use strict';

  if (window.__showcaseReady) return;
  window.__showcaseReady = true;

  var MOBILE = window.matchMedia('(max-width: 40em)');
  var GAP = 12;
  var SECTION_ID = 'block-marketing-showcase'; // section file, rendered with defaults in the showcase page's context
  var uid = 0;

  /* ---------------------------------------------------------------- dots */

  function dotFor(popover) {
    return document.querySelector('.showcase__dot[popovertarget="' + CSS.escape(popover.id) + '"]');
  }

  function position(popover, dot) {
    if (MOBILE.matches || !dot) {
      popover.style.top = '';
      popover.style.left = '';
      return;
    }
    var d = dot.getBoundingClientRect();
    var p = popover.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;

    // Show on the side with room: dots in the right half open to the left
    var left = parseFloat(popover.dataset.showcaseX) > 55 ? d.left - p.width - GAP : d.right + GAP;
    left = Math.max(GAP, Math.min(left, vw - p.width - GAP));
    var top = d.top + d.height / 2 - p.height / 2;
    top = Math.max(GAP, Math.min(top, vh - p.height - GAP));

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  }

  function syncPicker(popover) {
    var picker = popover.querySelector('[data-showcase-variants]');
    if (!picker) return;
    var chosen = picker.querySelector('[aria-pressed="true"]');
    var add = popover.querySelector('[data-button-order-add]');
    if (add) add.disabled = !chosen;
  }

  document.addEventListener('toggle', function (e) {
    var popover = e.target;
    if (!popover.matches || !popover.matches('[data-showcase-popover]')) return;
    var open = e.newState === 'open';
    var dot = dotFor(popover);
    if (dot) {
      dot.setAttribute('aria-expanded', String(open));
      dot.classList.toggle('is-showcase-active', open);
    }
    if (open) {
      position(popover, dot);
      syncPicker(popover);
    }
  }, true);

  function step(button) {
    var popover = button.closest('[data-showcase-popover]');
    var showcase = popover.closest('[data-showcase]');
    var list = Array.prototype.slice.call(showcase.querySelectorAll('[data-showcase-popover]'));
    var dir = parseInt(button.dataset.showcaseStep, 10) || 1;
    var next = list[(list.indexOf(popover) + dir + list.length) % list.length];
    if (!next || next === popover) return;
    popover.hidePopover();
    next.showPopover();
    var focus = next.querySelector('[data-showcase-step="' + dir + '"]');
    if (focus) focus.focus();
  }

  function chooseVariant(button) {
    var popover = button.closest('[data-showcase-popover]');
    var picker = button.closest('[data-showcase-variants]');
    picker.querySelectorAll('[data-showcase-variant]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b === button));
    });
    var input = popover.querySelector('form input[name="id"]');
    if (input) input.value = button.dataset.showcaseVariant;
    if (button.dataset.url) {
      popover.querySelectorAll('[data-showcase-link]').forEach(function (a) { a.href = button.dataset.url; });
    }
    syncPicker(popover);
  }

  /* ------------------------------------------------------ card ↔ dot sync */

  var hovered = null;
  function setActive(el, on) {
    var root = el.closest('[data-showcase-root]') || document;
    var id = el.dataset.showcaseHotspot || el.dataset.showcaseCard;
    root.querySelectorAll('[data-showcase-hotspot="' + id + '"], [data-showcase-card="' + id + '"]').forEach(function (n) {
      if (n.closest('[data-showcase-root]') === el.closest('[data-showcase-root]')) n.classList.toggle('is-showcase-active', on);
    });
  }
  function onOver(e) {
    var el = e.target.closest && e.target.closest('[data-showcase-hotspot], [data-showcase-card]');
    if (el === hovered) return;
    if (hovered) setActive(hovered, false);
    hovered = el;
    if (el) setActive(el, true);
  }
  document.addEventListener('mouseover', onOver);
  document.addEventListener('focusin', onOver);

  /* ------------------------------------------------------ swap & modals */

  function ownParts(root) {
    var parts = {};
    root.querySelectorAll('[data-showcase-part]').forEach(function (el) {
      if (el.closest('[data-showcase-root]') === root) parts[el.dataset.showcasePart] = el;
    });
    return parts;
  }

  // Popover IDs from fetched HTML must not collide with the page's own
  function uniquify(fragment) {
    var prefix = 'sx' + (++uid) + '-';
    fragment.querySelectorAll('[id^="showcase-"]').forEach(function (el) { el.id = prefix + el.id; });
    fragment.querySelectorAll('[popovertarget^="showcase-"]').forEach(function (el) {
      el.setAttribute('popovertarget', prefix + el.getAttribute('popovertarget'));
    });
  }

  // Markets: keep the locale/market prefix (e.g. /de/) so the swapped
  // showcase renders in the shopper's language and currency.
  function localize(url) {
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    if (root !== '/' && url.pathname.indexOf(root) !== 0) {
      url.pathname = root.replace(/\/$/, '') + url.pathname;
    }
    return url;
  }

  function fetchShowcase(href) {
    var url = localize(new URL(href, window.location.origin));
    url.searchParams.set('section_id', SECTION_ID);
    return fetch(url.toString(), { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var root = doc.querySelector('[data-showcase-root]');
        if (!root) throw new Error('no showcase in response');
        uniquify(root);
        return root;
      });
  }

  function titleOf(root) {
    var h = ownParts(root).header;
    var heading = h && h.querySelector('h2');
    return heading ? heading.textContent.trim() : '';
  }

  function updateBackbar(root) {
    var bar = Array.prototype.find.call(root.querySelectorAll('[data-showcase-backbar]'), function (b) {
      return b.closest('[data-showcase-root]') === root;
    });
    if (!bar) return;
    var stack = root._showcaseStack || [];
    bar.hidden = stack.length === 0;
    if (stack.length) {
      bar.querySelector('[data-showcase-back-label]').textContent =
        (bar.dataset.label || '').replace('__TITLE__', stack[stack.length - 1].title);
    }
  }

  function ownEl(root, selector) {
    return Array.prototype.find.call(root.querySelectorAll(selector), function (el) {
      return el.closest('[data-showcase-root]') === root;
    });
  }

  // Inline display: caption ("n products" + "show all (n)") follows the swap
  function updateCaption(root) {
    var caption = ownEl(root, '[data-showcase-caption]');
    var image = ownParts(root).image;
    if (!caption || !image) return;
    var ids = {};
    image.querySelectorAll('[data-showcase-hotspot]').forEach(function (d) { ids[d.dataset.showcaseHotspot] = true; });
    var n = String(Object.keys(ids).length);
    var count = caption.querySelector('[data-showcase-caption-count]');
    var all = caption.querySelector('[data-showcase-open-all]');
    if (count && caption.dataset.countLabel) count.textContent = caption.dataset.countLabel.replace('__COUNT__', n);
    if (all && caption.dataset.allLabel) all.textContent = caption.dataset.allLabel.replace('__COUNT__', n);
  }

  function currentUrl(root) {
    var image = ownParts(root).image;
    var sc = image && image.querySelector('[data-showcase-url]');
    return sc ? sc.dataset.showcaseUrl : null;
  }

  // "Show all products": the modal is pre-rendered for the original showcase;
  // after an inline swap it is fetched for the showcase now on screen.
  function openAll(root) {
    var dialog = ownEl(root, 'dialog[data-showcase-all]');
    if (!dialog) return;
    var url = currentUrl(root);
    if (!url || dialog.dataset.showcaseLoaded === url) { dialog.showModal(); return; }
    var body = dialog.querySelector('[data-showcase-dialog-body]');
    root.classList.add('is-showcase-loading');
    fetchShowcase(url).then(function (source) {
      body.innerHTML = '';
      body.appendChild(source);
      dialog.dataset.showcaseLoaded = url;
      dialog.showModal();
    }).catch(function () {
      window.location.href = url;
    }).finally(function () {
      root.classList.remove('is-showcase-loading');
    });
  }

  function replaceParts(root, source) {
    var target = ownParts(root);
    var incoming = ownParts(source);
    ['header', 'image', 'items', 'related'].forEach(function (name) {
      if (!target[name]) return;
      target[name].innerHTML = incoming[name] ? incoming[name].innerHTML : '';
    });
  }

  function snapshot(root) {
    var parts = ownParts(root), snap = { title: titleOf(root), html: {} };
    Object.keys(parts).forEach(function (k) { snap.html[k] = parts[k].innerHTML; });
    return snap;
  }

  // Browsers without the Popover API: dots are inert, nothing to close (and :popover-open would throw)
  var HAS_POPOVER = typeof HTMLElement !== 'undefined' && HTMLElement.prototype.hasOwnProperty('popover');

  function closePopovers() {
    if (!HAS_POPOVER) return;
    document.querySelectorAll('[data-showcase-popover]:popover-open').forEach(function (p) { p.hidePopover(); });
  }

  function scrollIntoViewIfNeeded(root) {
    var top = root.getBoundingClientRect().top;
    if (top < 0 && !root.closest('dialog')) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (root.closest('dialog')) root.closest('dialog').scrollTop = 0;
  }

  function swap(link, root) {
    root.classList.add('is-showcase-loading');
    closePopovers();
    fetchShowcase(link.href).then(function (source) {
      var stack = root._showcaseStack || (root._showcaseStack = []);
      stack.push(snapshot(root));
      replaceParts(root, source);
      updateCaption(root);
      updateBackbar(root);
      scrollIntoViewIfNeeded(root);
    }).catch(function () {
      window.location.href = link.href; // fall back to the showcase page
    }).finally(function () {
      root.classList.remove('is-showcase-loading');
    });
  }

  function back(root) {
    var stack = root._showcaseStack || [];
    var prev = stack.pop();
    if (!prev) return;
    closePopovers();
    var parts = ownParts(root);
    Object.keys(prev.html).forEach(function (k) { if (parts[k]) parts[k].innerHTML = prev.html[k]; });
    updateCaption(root);
    updateBackbar(root);
    scrollIntoViewIfNeeded(root);
  }

  function openRemote(link) {
    var scope = link.closest('[data-showcase-remote-scope]');
    var dialog = scope && scope.querySelector('dialog[data-showcase-remote]');
    if (!dialog) { window.location.href = link.href; return; }
    var body = dialog.querySelector('[data-showcase-remote-body]');
    fetchShowcase(link.href).then(function (source) {
      body.innerHTML = '';
      body.appendChild(source);
      dialog.showModal();
    }).catch(function () { window.location.href = link.href; });
  }

  /* -------------------------------------------------------------- clicks */

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;

    var el = t.closest('[data-showcase-variant]');
    if (el) { chooseVariant(el); return; }

    el = t.closest('[data-showcase-step]');
    if (el) { step(el); return; }

    el = t.closest('[data-showcase-open-all]');
    if (el) { openAll(el.closest('[data-showcase-root]')); return; }

    el = t.closest('[data-showcase-dialog-close]');
    if (el) { closePopovers(); el.closest('dialog').close(); return; }

    el = t.closest('[data-showcase-back]');
    if (el) { back(el.closest('[data-showcase-root]')); return; }

    el = t.closest('a[data-showcase-swap]');
    if (el && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      var root = el.closest('[data-showcase-root]');
      if (root) swap(el, root); else openRemote(el);
      return;
    }

    // Click on the dialog backdrop closes it
    if (t.matches && t.matches('dialog.showcase-dialog')) { closePopovers(); t.close(); }
  });

  // Keep popovers honest: close when the page or a dialog scrolls (desktop)
  // Not when the popover itself scrolls (long size list); resize only on a real width
  // change (iOS fires resize when the address bar shows/hides, which would close the sheet)
  document.addEventListener('scroll', function (e) {
    if (MOBILE.matches) return;
    var t = e.target;
    if (t && t.closest && t.closest('[data-showcase-popover]')) return;
    closePopovers();
  }, { capture: true, passive: true });
  var lastWidth = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    closePopovers();
  });
})();
