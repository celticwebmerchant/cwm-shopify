/* ==========================================================================
   BLOCK-EMBED-KLAVIYO-BIS
   Vertaallaag voor de Klaviyo Back in Stock-popup.

   - Find & replace op hele teksten in de Klaviyo BIS-knop en -popup (tekst,
     placeholder, aria-label, title, value) zodra die verschijnen
   - Strikt afgebakend: #klaviyo-bis-button-container + het formulier met
     de BIS form-ID (section-setting) en de dialoog eromheen
   - Elke tekstnode is een eigen zin: een kop over twee regels (<br>) is
     dus twee paren
   - Opmaak van Klaviyo blijft intact
   - Klaviyo plaatst een eigen knop bij .klaviyo-bis-trigger en verbergt die <a>
   - Config komt uit [data-klaviyo-bis-config] (section block-embed-klaviyo-bis)
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     DEV-GATE (tijdelijk) — ?dev=klaviyo-bis aan, ?dev=off uit, per sessie
     Verwijderen bij livegang: DEV_GATE op false + de {% style %}-regel
     in de section.
     ------------------------------------------------------------------------ */
  var DEV_GATE = true;
  var DEV_KEY = 'cwm-dev';
  var DEV_VALUE = 'klaviyo-bis';

  function devActive() {
    var param = null;
    try { param = new URLSearchParams(window.location.search).get('dev'); } catch (e) {}
    try {
      if (param === DEV_VALUE) sessionStorage.setItem(DEV_KEY, DEV_VALUE);
      if (param === 'off') sessionStorage.removeItem(DEV_KEY);
      return sessionStorage.getItem(DEV_KEY) === DEV_VALUE;
    } catch (e) {
      return param === DEV_VALUE;
    }
  }

  var isDev = devActive();
  if (DEV_GATE && !isDev) return;
  document.documentElement.classList.add('is-dev-klaviyo-bis');

  /* ------------------------------------------------------------------------
     Config
     ------------------------------------------------------------------------ */
  var configEl = document.querySelector('[data-klaviyo-bis-config]');
  if (!configEl) return;

  var config;
  try { config = JSON.parse(configEl.textContent); } catch (e) { return; }

  var debug = isDev || config.designMode;
  function log() {
    if (!debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[klaviyo-bis]');
    console.log.apply(console, args);
  }

  // Eigen trigger: voorkom sprong naar boven door href="#"; Klaviyo zelf
  // blijft de klik ontvangen (geen stopPropagation).
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('.product-atc__notify--klaviyo .klaviyo-bis-trigger');
    if (trigger) {
      e.preventDefault();
      log('trigger click, variant', trigger.getAttribute('data-variant-id'), 'url', window.location.search);
    }
  });

  /* ------------------------------------------------------------------------
     Taal op het profiel — bij aanmelden via het BIS-formulier krijgt het
     Klaviyo-profiel Locale = taal van de pagina (zelfde eigenschap die de
     Shopify-koppeling en Smart Translations gebruiken). CWM kan in flows op
     Locale splitsen. Eén keer per aanmelding; e-mail of telefoon.
     ------------------------------------------------------------------------ */
  var identified = {};

  window.addEventListener('klaviyoForms', function (e) {
    var d = e.detail || {};
    log('klaviyoForms event', d.type, d);

    if (!config.formId || d.formId !== config.formId) return;
    // BIS-formulieren vuren eigen events af (getest okt 2026):
    // submitBackInStockStep + submitBackInStockForm, met $email in metaData.
    // submit/stepSubmit (gewone formulieren) als vangnet.
    if (!/^(submitBackInStockForm|submitBackInStockStep|submit|stepSubmit)$/.test(d.type)) return;

    var meta = d.metaData || {};
    var email = meta.$email || meta.email;
    var phone = meta.$phone_number || meta.phone_number;
    var props = { Locale: config.locale };
    if (email) props.email = email;
    else if (phone) props.phone_number = phone;
    else return;

    var key = props.email || props.phone_number;
    if (identified[key]) return;
    identified[key] = true;

    window.klaviyo = window.klaviyo || [];
    window.klaviyo.push(['identify', props]);
    log('identify', { Locale: props.Locale, via: props.email ? 'email' : 'phone' });
  });

  /* ------------------------------------------------------------------------
     Vertaling — in elke taal (ook de hoofdtaal): de bron is wat in Klaviyo
     staat, niet de hoofdtaal van de shop. Paren waarvan bron en vervanging
     gelijk zijn worden overgeslagen.
     ------------------------------------------------------------------------ */
  // Vergelijkingssleutel: spaties samengevoegd en hoofdletterongevoelig
  // ("back in Stock" = "back in stock" = "BACK IN STOCK").
  function normalize(str) {
    return (str || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  var map = {};
  var sources = [];
  var labels = {};
  (config.pairs || []).forEach(function (pair) {
    var source = normalize(pair[0]);
    var replacement = pair[1];
    if (!source || !replacement || pair[0].trim() === replacement.trim()) return;
    map[source] = replacement;
    sources.push(source);
    labels[source] = pair[0];
  });

  if (!sources.length) {
    log('geen vervangteksten voor', config.locale);
    return;
  }

  var found = {};
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };
  var ATTRS = ['placeholder', 'aria-label', 'title'];
  var INLINE = /^(SPAN|STRONG|B|EM|I|U|SMALL|BR|A|FONT|SUP|SUB)$/;

  // Strikt afgebakend: alleen de BIS-knop en de BIS-popup, niets anders
  // (ook niet andere Klaviyo-formulieren zoals de nieuwsbrief in de footer).
  var BUTTON = '#klaviyo-bis-button-container';
  var FORM = config.formId ? '[data-testid="klaviyo-form-' + config.formId + '"]' : null;

  function roots() {
    var list = [];
    var button = document.querySelector(BUTTON);
    if (button) list.push(button);
    if (FORM) {
      document.querySelectorAll(FORM).forEach(function (form) {
        // De dialoog eromheen hoort erbij (sluitknop, aria-labels)
        list.push(form.closest('[role="dialog"]') || form);
      });
    }
    return list;
  }

  function replaceText(node) {
    var key = normalize(node.nodeValue);
    if (!key || !map.hasOwnProperty(key)) return false;
    var lead = node.nodeValue.match(/^\s*/)[0];
    var trail = node.nodeValue.match(/\s*$/)[0];
    node.nodeValue = lead + map[key] + trail;
    found[key] = true;
    return true;
  }

  // Tekst die over meerdere inline-nodes verdeeld is (<p><span>A</span> <span>B</span></p>)
  function replaceInlineGroup(el) {
    if (SKIP[el.tagName]) return;
    var key = normalize(el.textContent);
    if (!key || !map.hasOwnProperty(key)) return;
    for (var i = 0; i < el.children.length; i++) {
      if (!INLINE.test(el.children[i].tagName)) return;
    }
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var first = null, node;
    while ((node = walker.nextNode())) {
      if (!first) { first = node; continue; }
      node.nodeValue = '';
    }
    if (first) {
      first.nodeValue = map[key];
      found[key] = true;
    }
  }

  function replaceAttrs(el) {
    ATTRS.forEach(function (attr) {
      var val = el.getAttribute(attr);
      var key = normalize(val);
      if (key && map.hasOwnProperty(key)) {
        el.setAttribute(attr, map[key]);
        found[key] = true;
      }
    });
    if (el.tagName === 'INPUT' && /^(submit|button)$/i.test(el.type)) {
      var vkey = normalize(el.value);
      if (vkey && map.hasOwnProperty(vkey)) {
        el.value = map[vkey];
        found[vkey] = true;
      }
    }
  }

  function translate(root) {
    // 1. Losse tekstnodes
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        return n.parentNode && SKIP[n.parentNode.nodeName] ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) replaceText(node);

    // 2. Elementen: attributen + teksten verdeeld over inline-nodes
    var els = root.querySelectorAll ? root.querySelectorAll('*') : [];
    if (root.nodeType === 1) { replaceAttrs(root); replaceInlineGroup(root); }
    for (var i = 0; i < els.length; i++) {
      replaceAttrs(els[i]);
      replaceInlineGroup(els[i]);
    }
  }

  var reportTimer = null;
  function report() {
    if (!debug) return;
    clearTimeout(reportTimer);
    reportTimer = setTimeout(function () {
      var missing = sources.filter(function (s) { return !found[s]; }).map(function (s) { return labels[s]; });
      if (missing.length) {
        console.warn('[klaviyo-bis] niet gevonden in popup (' + config.locale + '):', missing);
      } else {
        log('alle vervangteksten gevonden (' + config.locale + ')');
      }
    }, 1500);
  }

  function process(nodes) {
    var hit = false;
    roots().forEach(function (root) {
      var touched = nodes.some(function (n) { return root.contains(n) || n.contains(root); });
      if (touched) { translate(root); hit = true; }
    });
    if (hit) report();
  }

  // Bestaande BIS-content (bv. al gerenderd vóór dit script)
  process([document.body]);

  // Nieuwe content: popup openen, volgende stap, foutmeldingen
  var queued = [];
  var scheduled = false;
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.type === 'characterData') {
        if (m.target.parentNode) queued.push(m.target.parentNode);
        return;
      }
      if (m.type === 'attributes') {
        queued.push(m.target);
        return;
      }
      m.addedNodes.forEach(function (n) {
        if (n.nodeType === 1) queued.push(n);
        else if (n.nodeType === 3 && n.parentNode) queued.push(n.parentNode);
      });
    });
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      var batch = queued;
      queued = [];
      batch = batch.filter(function (el) { return el.isConnected; });
      if (batch.length) process(batch);
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS
  });

  log('actief voor', config.locale, '—', sources.length, 'vervangteksten, form', config.formId || '(geen)');
})();
