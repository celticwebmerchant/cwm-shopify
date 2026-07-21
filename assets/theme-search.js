/**
 * ============================================================================
 * THEME-SEARCH.JS
 * ============================================================================
 * 
 * Search overlay system with predictive search functionality.
 * 
 * USAGE:
 * 
 * HTML (declarative):
 *   <a href="/search" data-search-trigger>Search</a>
 *   
 *   <div data-search-overlay hidden>
 *     <div data-search-close></div>
 *     <div class="block-search-overlay__container">
 *       <input type="search">
 *       <button data-search-close>×</button>
 *       <div data-search-results></div>
 *     </div>
 *   </div>
 * 
 * JavaScript (imperative):
 *   window.themeSearch.open();
 *   window.themeSearch.close();
 *   window.themeSearch.isOpen();
 * 
 * Events:
 *   document.addEventListener('search:open', (e) => {});
 *   document.addEventListener('search:close', (e) => {});
 * 
 * ============================================================================
 */

(function() {
  'use strict';

  // -------------------------------------------------------------------------
  // Search Overlay Controller
  // -------------------------------------------------------------------------

  const SearchOverlay = {
    overlay: null,
    input: null,
    results: null,
    config: null,
    previousFocus: null,
    abortController: null,
    debounceTimer: null,
    searchCache: new Map(),
    recentSearchesKey: 'theme_recent_searches',

    init() {
      // Always bind trigger events first (for progressive enhancement)
      this.bindTriggerEvents();

      // Then initialize overlay if present
      this.overlay = document.querySelector('[data-search-overlay]');
      if (!this.overlay) return;

      this.input = this.overlay.querySelector('input[type="search"]');
      this.results = this.overlay.querySelector('[data-search-results]');
      this.config = this.loadConfig();

      this.bindOverlayEvents();
    },

    loadConfig() {
      const el = this.overlay.querySelector('[data-search-config]');
      if (!el) return { blocks: [], routes: {}, strings: {} };
      
      try {
        return JSON.parse(el.textContent);
      } catch (e) {
        console.error('[theme-search] Failed to parse config:', e);
        return { blocks: [], routes: {}, strings: {} };
      }
    },

    bindTriggerEvents() {
      // Trigger buttons - always listen, even without overlay
      document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-search-trigger]');
        if (trigger) {
          // Only prevent default if overlay exists and opens successfully
          if (this.open()) {
            e.preventDefault();
          }
          // Otherwise, let the link navigate to search page (fallback)
        }
      });

      // Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen()) {
          e.preventDefault();
          this.close();
        }
      });
    },

    bindOverlayEvents() {
      // Close buttons
      this.overlay.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('[data-search-close]');
        if (closeBtn) {
          e.preventDefault();
          this.close();
        }
      });

      // Input events
      if (this.input) {
        this.input.addEventListener('input', () => {
          this.toggleResetButton();
          this.debounce(() => this.onInputChange(), 300);
        });

        this.input.addEventListener('focus', () => {
          if (!this.input.value.trim()) {
            this.showInitialState();
          }
        });
      }

      // Reset button
      const form = this.overlay.querySelector('form');
      if (form) {
        form.addEventListener('reset', (e) => {
          e.preventDefault();
          this.clearSearch();
        });
      }

      // Focus trap
      this.overlay.addEventListener('keydown', (e) => this.handleFocusTrap(e));

      // Shopify events
      document.addEventListener('shopify:section:unload', () => this.close());
    },

    open() {
      if (!this.overlay) return false;

      // Close modals and drawers
      if (window.themeModal) window.themeModal.closeAll();
      if (window.themeDrawer) window.themeDrawer.closeAll();

      this.previousFocus = document.activeElement;
      this.overlay.hidden = false;
      document.body.classList.add('has-search-open');

      // Add open class after a frame to trigger CSS transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.overlay.classList.add('is-open');
        });
      });

      // Focus input after visibility transition (175ms)
      setTimeout(() => {
        if (this.input) {
          this.input.focus();
          this.input.select();
        }
      }, 175);

      // Show results based on input state
      if (this.input) {
        this.toggleResetButton();
        const term = this.input.value.trim();
        if (term) {
          // Re-fetch results for existing term
          this.fetchResults(term);
        } else {
          // Show initial state (popular/recent)
          this.showInitialState();
        }
      }

      document.dispatchEvent(new CustomEvent('search:open'));
      return true;
    },

    close() {
      if (!this.overlay) return false;

      this.overlay.classList.remove('is-open');
      document.body.classList.remove('has-search-open');

      // Wait for animation
      setTimeout(() => {
        this.overlay.hidden = true;
      }, 175);

      // Restore focus
      if (this.previousFocus) {
        this.previousFocus.focus();
        this.previousFocus = null;
      }

      // Keep results and input value for when reopened

      document.dispatchEvent(new CustomEvent('search:close'));
      return true;
    },

    isOpen() {
      return this.overlay && !this.overlay.hidden;
    },

    handleFocusTrap(e) {
      if (e.key !== 'Tab') return;

      const focusable = this.overlay.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },

    // -----------------------------------------------------------------------
    // Search Logic
    // -----------------------------------------------------------------------

    onInputChange() {
      const term = this.input.value.trim();

      if (!term) {
        this.showInitialState();
        return;
      }

      this.fetchResults(term);
    },

    toggleResetButton() {
      const resetBtn = this.overlay.querySelector('.search-form__reset');
      if (!resetBtn) return;
      
      if (this.input.value.trim()) {
        resetBtn.classList.remove('hidden');
      } else {
        resetBtn.classList.add('hidden');
      }
    },

    clearSearch() {
      if (this.input) {
        this.input.value = '';
        this.input.focus();
      }
      this.toggleResetButton();
      this.showInitialState();
    },

    showInitialState() {
      if (!this.results) return;

      let html = '';

      // Popular searches
      const popular = this.config.blocks.find(b => b.type === 'popular_searches');
      if (popular && popular.settings.terms) {
        html += this.renderPopularSearches(popular);
      }

      // Recent searches
      const recent = this.config.blocks.find(b => b.type === 'recent_searches');
      if (recent) {
        const recentHtml = this.renderRecentSearches(recent);
        if (recentHtml) html += recentHtml;
      }

      this.results.innerHTML = html || '';
    },

    fetchResults(term) {
      // Check cache
      if (this.searchCache.has(term)) {
        this.renderResults(term, this.searchCache.get(term));
        return;
      }

      // Cancel previous
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();

      // Show loading
      this.results.innerHTML = '<div class="search-results__loading"></div>';

      const types = this.getEnabledTypes();
      const limit = this.getMaxLimit();
      let root = this.config.routes.root || '/';
      
      // Ensure root ends with slash
      if (!root.endsWith('/')) {
        root += '/';
      }

      fetch(`${root}search/suggest.json?q=${encodeURIComponent(term)}&resources[type]=${types.join(',')}&resources[limit]=${limit}&resources[limit_scope]=each`, {
        signal: this.abortController.signal
      })
        .then(r => r.json())
        .then(data => {
          this.searchCache.set(term, data);
          this.renderResults(term, data);
          this.saveRecentSearch(term);
        })
        .catch(err => {
          if (err.name !== 'AbortError') {
            console.error('[theme-search] Fetch error:', err);
            this.results.innerHTML = '';
          }
        });
    },

    getEnabledTypes() {
      const types = [];
      this.config.blocks.forEach(b => {
        if (b.type === 'product_results') types.push('product');
        if (b.type === 'collection_results') types.push('collection');
        if (b.type === 'article_results') types.push('article');
        if (b.type === 'page_results') types.push('page');
      });
      return types.length ? types : ['product'];
    },

    getMaxLimit() {
      // Get the highest limit from all blocks (limit_scope=each applies this per type)
      let maxLimit = 4;
      this.config.blocks.forEach(b => {
        if (b.settings && b.settings.limit && b.settings.limit > maxLimit) {
          maxLimit = b.settings.limit;
        }
      });
      return Math.min(maxLimit, 10); // Shopify max is 10 per type
    },

    renderResults(term, data) {
      const products = data.resources?.results?.products || [];
      const collections = data.resources?.results?.collections || [];
      const articles = data.resources?.results?.articles || [];
      const pages = data.resources?.results?.pages || [];

      const total = products.length + collections.length + articles.length + pages.length;

      if (total === 0) {
        const noResultsText = (this.config.strings.noResults || 'No results found')
          .replace('{{ terms }}', term)
          .replace('{{terms}}', term);
        this.results.innerHTML = `
          <div class="search-results__empty">
            <p>${noResultsText}</p>
          </div>
        `;
        return;
      }

      let html = '<div class="search-results__grid">';

      // Render in block order
      this.config.blocks.forEach(block => {
        if (block.type === 'product_results' && products.length) {
          html += this.renderProductResults(block, products);
        } else if (block.type === 'collection_results' && collections.length) {
          html += this.renderCollectionResults(block, collections);
        } else if (block.type === 'article_results' && articles.length) {
          html += this.renderArticleResults(block, articles);
        } else if (block.type === 'page_results' && pages.length) {
          html += this.renderPageResults(block, pages);
        }
      });

      html += '</div>';

      // Footer
      const searchUrl = this.config.routes.search || '/search';
      html += `
        <div class="search-results__footer">
          <a href="${searchUrl}?q=${encodeURIComponent(term)}&type=product" class="search-results__view-all">
            ${this.config.strings.viewAll || 'View all results'}
          </a>
        </div>
      `;

      this.results.innerHTML = html;
    },

    renderPopularSearches(block) {
      const terms = (block.settings.terms || '')
        .split(',')
        .map(t => t.trim())
        .filter(t => t);

      if (!terms.length) return '';

      let root = this.config.routes.root || '/';
      if (!root.endsWith('/')) root += '/';
      
      const heading = block.settings.heading || this.config.strings.popularSearches;

      return `
        <div class="search-results__section search-results__section--popular">
          <h3 class="search-results__heading">${heading}</h3>
          <div class="search-results__tags">
            ${terms.map(t => `
              <a href="${root}search?q=${encodeURIComponent(t)}&type=product" class="search-results__tag">${t}</a>
            `).join('')}
          </div>
        </div>
      `;
    },

    renderRecentSearches(block) {
      const recent = this.getRecentSearches(block.settings.limit || 5);
      if (!recent.length) return '';

      let root = this.config.routes.root || '/';
      if (!root.endsWith('/')) root += '/';
      
      const heading = block.settings.heading || this.config.strings.recentSearches;

      return `
        <div class="search-results__section search-results__section--recent">
          <h3 class="search-results__heading">${heading}</h3>
          <div class="search-results__tags">
            ${recent.map(t => `
              <a href="${root}search?q=${encodeURIComponent(t)}&type=product" class="search-results__tag search-results__tag--recent">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                ${t}
              </a>
            `).join('')}
          </div>
        </div>
      `;
    },

    renderProductResults(block, products) {
      const items = products.slice(0, block.settings.limit || 6);
      const columns = block.settings.columns || '2';
      const heading = block.settings.heading || this.config.strings.products;
      const showCompare = this.config.showComparePrice !== false;
      const showTaxNotice = this.config.showTaxNotice === true;
      const taxNotice = this.config.taxIncluded ? this.config.strings.taxIncluded : this.config.strings.taxExcluded;
      
      return `
        <div class="search-results__section search-results__section--products" data-columns="${columns}">
          <h3 class="search-results__heading">${heading}</h3>
          <div class="search-results__items">
            ${items.map(p => {
              // API returns compare_at_price_min for products with variants
              const comparePrice = p.compare_at_price_min || p.compare_at_price_max;
              const hasCompare = showCompare && comparePrice && parseFloat(comparePrice) > 0 && parseFloat(comparePrice) > parseFloat(p.price);
              return `
              <a href="${p.url}" class="search-results__item">
                ${p.featured_image ? `
                  <img src="${this.getImageUrl(p.featured_image, '100x100')}" alt="${p.title}" loading="lazy" width="50" height="50">
                ` : '<span class="search-results__placeholder"></span>'}
                <div class="search-results__content">
                  ${block.settings.show_vendor && p.vendor ? `<span class="search-results__vendor">${p.vendor}</span>` : ''}
                  <span class="search-results__title">${p.title}</span>
                  ${block.settings.show_price && p.price ? `
                    <span class="product-price">
                      <span class="product-price__current">${this.formatMoney(p.price)}</span>
                      ${hasCompare ? `<span class="product-price__compare">${this.formatMoney(comparePrice)}</span>` : ''}
                      ${showTaxNotice ? `<span class="product-price__tax-notice">${taxNotice}</span>` : ''}
                    </span>
                  ` : ''}
                </div>
              </a>
            `}).join('')}
          </div>
        </div>
      `;
    },

    renderCollectionResults(block, collections) {
      const items = collections.slice(0, block.settings.limit || 4);
      const heading = block.settings.heading || this.config.strings.collections;
      
      return `
        <div class="search-results__section search-results__section--collections">
          <h3 class="search-results__heading">${heading}</h3>
          <div class="search-results__items search-results__items--compact">
            ${items.map(c => `
              <a href="${c.url}" class="search-results__item search-results__item--compact">
                <span class="search-results__title">${c.title}</span>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    },

    renderArticleResults(block, articles) {
      const items = articles.slice(0, block.settings.limit || 4);
      const heading = block.settings.heading || this.config.strings.articles;
      
      return `
        <div class="search-results__section search-results__section--articles">
          <h3 class="search-results__heading">${heading}</h3>
          <div class="search-results__items search-results__items--compact">
            ${items.map(a => `
              <a href="${a.url}" class="search-results__item search-results__item--compact">
                <span class="search-results__title">${a.title}</span>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    },

    renderPageResults(block, pages) {
      const items = pages.slice(0, block.settings.limit || 4);
      const heading = block.settings.heading || this.config.strings.pages;
      
      return `
        <div class="search-results__section search-results__section--pages">
          <h3 class="search-results__heading">${heading}</h3>
          <div class="search-results__items search-results__items--compact">
            ${items.map(p => `
              <a href="${p.url}" class="search-results__item search-results__item--compact">
                <span class="search-results__title">${p.title}</span>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    },

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    getImageUrl(image, size) {
      if (!image) return null;
      const url = typeof image === 'string' ? image : image.url;
      if (!url) return null;
      return url.replace(/(\.[^.]+)$/, `_${size}$1`);
    },

    formatMoney(price) {
      // Currency per market: symbol + separators come from the section config
      // (see block-search-overlay.liquid). Mirrors html-product-price.
      const currency = this.config.currency || {};
      const symbol = currency.symbol || '€';
      let decSep = currency.decimalSeparator || ',';
      let thouSep = (typeof currency.thousandsSeparator === 'string') ? currency.thousandsSeparator : '.';
      if (/\d/.test(decSep)) decSep = ',';
      if (/\d/.test(thouSep)) thouSep = '';

      // Shopify API returns price as string like "51.25" or number
      const amount = parseFloat(price).toFixed(2);

      // Split into whole and decimal parts
      const parts = amount.split('.');
      const before = thouSep ? parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thouSep) : parts[0];
      const after = parts[1];

      // Hide cents on whole prices when enabled (mirrors html-product-price)
      if (this.config.hideZeroCents && after === '00') {
        return `<span class="price"><span class="valuta">${symbol}</span><span class="before_seperator">${before}</span></span>`;
      }

      // Return same structure as html-product-price
      return `<span class="price"><span class="valuta">${symbol}</span><span class="before_seperator">${before}</span><span class="seperator">${decSep}</span><span class="after_seperator">${after}</span></span>`;
    },

    getRecentSearches(limit) {
      try {
        const recent = JSON.parse(localStorage.getItem(this.recentSearchesKey) || '[]');
        return recent.slice(0, limit);
      } catch (e) {
        return [];
      }
    },

    saveRecentSearch(term) {
      try {
        let recent = JSON.parse(localStorage.getItem(this.recentSearchesKey) || '[]');
        recent = recent.filter(t => t.toLowerCase() !== term.toLowerCase());
        recent.unshift(term);
        recent = recent.slice(0, 10);
        localStorage.setItem(this.recentSearchesKey, JSON.stringify(recent));
      } catch (e) {
        // localStorage disabled
      }
    },

    debounce(fn, wait) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(fn, wait);
    }
  };

  // -------------------------------------------------------------------------
  // Initialize
  // -------------------------------------------------------------------------

  function init() {
    SearchOverlay.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.themeSearch = {
    open: () => SearchOverlay.open(),
    close: () => SearchOverlay.close(),
    isOpen: () => SearchOverlay.isOpen()
  };

})();
