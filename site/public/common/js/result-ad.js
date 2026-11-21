(function () {
  'use strict';

  var AD_CLIENT = '__ADSENSE_CLIENT_ID__';
  var AD_SLOT = '__ADSENSE_RESULT_SLOT_ID__';
  var SHOW_DELAY_MS = 600;
  var PROD_HOSTS = ['unimate-jp.com', 'www.unimate-jp.com'];

  function normalizeConfig(value) {
    var trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed || /^__ADSENSE_/.test(trimmed)) {
      return '';
    }
    return trimmed;
  }

  function resolveAdMode(hostname, search, client, slot) {
    var params = new URLSearchParams(search || '');
    var previewFlag = params.get('adpreview');
    var isLocalHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.indexOf('192.168.') === 0;

    if (previewFlag === '1' || (isLocalHost && previewFlag !== '0')) {
      return 'local';
    }

    var validClient = /^ca-pub-\d+$/.test(client);
    var validSlot = /^\d+$/.test(slot);
    if (!validClient || !validSlot) {
      return 'disabled';
    }

    if (PROD_HOSTS.indexOf(hostname) !== -1) {
      return 'live';
    }
    return 'test';
  }

  function ensureAdSenseScript(client) {
    var existing = document.querySelector(
      'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]'
    );
    if (existing) return;

    var script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src =
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
      encodeURIComponent(client);
    document.head.appendChild(script);
  }

  function mountAd(slotEl, mode, client, slot) {
    if (mode === 'local') {
      var preview = document.createElement('div');
      preview.className = 'result-ad-preview';
      preview.innerHTML =
        'AD PREVIEW 320×100<br /><span>（600ms遅延・誤クリック防止確認用）</span>';
      slotEl.appendChild(preview);
      return;
    }

    ensureAdSenseScript(client);

    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'inline-block';
    ins.style.width = '320px';
    ins.style.height = '100px';
    ins.setAttribute('data-ad-client', client);
    ins.setAttribute('data-ad-slot', slot);
    if (mode === 'test') {
      ins.setAttribute('data-adtest', 'on');
    }
    slotEl.appendChild(ins);

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (_) {
      // Ignore AdSense initialization errors when blocked by client extensions
    }
  }

  function isElementHidden(el) {
    if (!el) return true;
    var style = window.getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden';
  }

  function setupContainer(container, mode, client, slot) {
    container.hidden = false;
    container.setAttribute('data-mode', mode);
    container.classList.remove('is-ready');

    var label = document.createElement('span');
    label.className = 'result-ad-label';
    label.textContent = '広告';

    var slotEl = document.createElement('div');
    slotEl.className = 'result-ad-slot';

    container.replaceChildren(label, slotEl);

    var hostScreen =
      container.closest('.screen-overlay, .modal-backdrop, .screen') ||
      container.parentElement;

    var loaded = false;
    var shown = false;
    var showTimer = null;

    function onShow() {
      if (shown) return;
      shown = true;

      if (!loaded) {
        loaded = true;
        mountAd(slotEl, mode, client, slot);
      }

      if (showTimer !== null) {
        window.clearTimeout(showTimer);
      }
      showTimer = window.setTimeout(function () {
        showTimer = null;
        if (shown && !isElementHidden(hostScreen)) {
          container.classList.add('is-ready');
        }
      }, SHOW_DELAY_MS);
    }

    function onHide() {
      shown = false;
      if (showTimer !== null) {
        window.clearTimeout(showTimer);
        showTimer = null;
      }
      container.classList.remove('is-ready');
    }

    if (typeof window.IntersectionObserver === 'function') {
      var io = new window.IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].target !== container) continue;
            if (entries[i].isIntersecting && !isElementHidden(hostScreen)) {
              onShow();
            } else if (!entries[i].isIntersecting) {
              onHide();
            }
          }
        },
        { threshold: 0.1 }
      );
      io.observe(container);
    }

    if (hostScreen && typeof window.MutationObserver === 'function') {
      var mo = new window.MutationObserver(function () {
        if (isElementHidden(hostScreen)) {
          onHide();
        } else if (typeof window.IntersectionObserver !== 'function') {
          onShow();
        }
      });
      mo.observe(hostScreen, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
  }

  function init() {
    var client = normalizeConfig(AD_CLIENT);
    var slot = normalizeConfig(AD_SLOT);
    var mode = resolveAdMode(
      window.location.hostname,
      window.location.search,
      client,
      slot
    );

    var containers = document.querySelectorAll('[data-result-ad]');
    if (containers.length === 0) return;

    if (mode === 'disabled') {
      for (var i = 0; i < containers.length; i++) {
        containers[i].hidden = true;
      }
      return;
    }

    for (var j = 0; j < containers.length; j++) {
      setupContainer(containers[j], mode, client, slot);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
