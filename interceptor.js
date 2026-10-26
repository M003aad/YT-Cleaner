// interceptor.js (MAIN world)
(() => {
  'use strict';

  document.addEventListener('ytc-enable-original-titles', () => {
    if (window.__0T_YT__) return;
    window.__0T_YT__ = true;

    const markActive = () => {
      try { document.documentElement.setAttribute('data-0t-yt', '1'); } catch {}
    };
    if (document.documentElement) markActive();
    else document.addEventListener('DOMContentLoaded', markActive, { once: true });

  /* ------------------------------------------------------------------ *
   * Config
   * ------------------------------------------------------------------ */
  const API_RE = /\/youtubei\/v1\/(browse|next|player|search)(?:\?|$)/;
  const PLAYER_RE = /\/youtubei\/v1\/player(?:\?|$)/;
  const MAX_PARALLEL = 6;
  const LS_KEY = '0T-YT:titles:v1';
  const CACHE_LIMIT = 4000;

  const nativeFetch = window.fetch;
  const isTarget = (u) => API_RE.test(u);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const urlOf = (input) => {
    try {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      return input && input.url ? input.url : '';
    } catch { return ''; }
  };

  const currentVideoId = () => {
    try { return new URL(location.href).searchParams.get('v'); } catch { return null; }
  };

  /* ------------------------------------------------------------------ *
   * Original-title cache (persisted so hard reloads can be patched synchronously)
   * ------------------------------------------------------------------ */
  const cache = new Map();
  const failed = new Set();
  const inflight = new Map();

  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    for (const [k, v] of saved) cache.set(k, v);
  } catch {}

  let saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify([...cache])); } catch {}
    }, 1500);
  }

  function remember(id, title) {
    cache.set(id, title);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    persist();
  }

  /* ------------------------------------------------------------------ *
   * Concurrency limiter + original title lookup (oEmbed)
   * ------------------------------------------------------------------ */
  let active = 0;
  const queue = [];
  function pump() {
    while (active < MAX_PARALLEL && queue.length) {
      active++;
      queue.shift()();
    }
  }
  function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push(() => {
        fn().then(resolve, reject).finally(() => { active--; pump(); });
      });
      pump();
    });
  }

  function fetchOriginal(id) {
    if (cache.has(id)) return Promise.resolve(cache.get(id));
    if (failed.has(id)) return Promise.resolve(null);
    if (inflight.has(id)) return inflight.get(id);

    const p = limit(async () => {
      try {
        const watch = 'https://www.youtube.com/watch?v=' + id;
        const r = await nativeFetch.call(
          window,
          location.origin + '/oembed?format=json&url=' + encodeURIComponent(watch),
          { credentials: 'omit' }
        );
        if (!r.ok) { failed.add(id); return null; }
        const d = await r.json();
        if (d && typeof d.title === 'string' && d.title) {
          remember(id, d.title);
          return d.title;
        }
      } catch {}
      failed.add(id);
      return null;
    }).finally(() => inflight.delete(id));

    inflight.set(id, p);
    return p;
  }

  /* ------------------------------------------------------------------ *
   * JSON tree: find titles and swap them
   * ------------------------------------------------------------------ */
  const isTextObj = (t) =>
    t && typeof t === 'object' && (typeof t.simpleText === 'string' || Array.isArray(t.runs));

  const getText = (t) =>
    typeof t.simpleText === 'string' ? t.simpleText : t.runs.map((r) => r.text || '').join('');

  function replaceInLabel(holder, key, translated, original) {
    try {
      if (holder && typeof holder[key] === 'string' && translated && holder[key].includes(translated)) {
        holder[key] = holder[key].split(translated).join(original);
      }
    } catch {}
  }

  function textJob(id, obj) {
    const translated = getText(obj);
    return {
      id,
      apply(orig) {
        if (!orig || orig === translated) return;
        if (typeof obj.simpleText === 'string') obj.simpleText = orig;
        else obj.runs = [{ text: orig }];
        replaceInLabel(obj.accessibility && obj.accessibility.accessibilityData, 'label', translated, orig);
      }
    };
  }

  function inspect(n, jobs, ctxId) {
    // videoRenderer, gridVideoRenderer, compactVideoRenderer, playlistVideoRenderer,
    // playlistPanelVideoRenderer, reelItemRenderer (headline), player videoDetails (string title)
    if (typeof n.videoId === 'string') {
      if (isTextObj(n.title)) jobs.push(textJob(n.videoId, n.title));
      if (isTextObj(n.headline)) jobs.push(textJob(n.videoId, n.headline));
      if (typeof n.title === 'string' && 'lengthSeconds' in n) {
        const t = n.title;
        jobs.push({ id: n.videoId, apply(o) { if (o && o !== t) n.title = o; } });
      }
    }

    // Watch page title (/next response and ytInitialData)
    if (n.videoPrimaryInfoRenderer && ctxId && isTextObj(n.videoPrimaryInfoRenderer.title)) {
      jobs.push(textJob(ctxId, n.videoPrimaryInfoRenderer.title));
    }

    // Player microformat title
    if (n.videoDetails && n.videoDetails.videoId && n.microformat &&
        n.microformat.playerMicroformatRenderer &&
        isTextObj(n.microformat.playerMicroformatRenderer.title)) {
      jobs.push(textJob(n.videoDetails.videoId, n.microformat.playerMicroformatRenderer.title));
    }

    // New-style lockups (Home grid / sidebar)
    if (typeof n.contentId === 'string' && /VIDEO/.test(n.contentType || '') &&
        n.metadata && n.metadata.lockupMetadataViewModel &&
        n.metadata.lockupMetadataViewModel.title &&
        typeof n.metadata.lockupMetadataViewModel.title.content === 'string') {
      const tObj = n.metadata.lockupMetadataViewModel.title;
      const translated = tObj.content;
      jobs.push({
        id: n.contentId,
        apply(orig) {
          if (!orig || orig === translated) return;
          tObj.content = orig;
          replaceInLabel(n.rendererContext && n.rendererContext.accessibilityContext, 'label', translated, orig);
        }
      });
    }

    // Shorts lockups
    if (n.overlayMetadata && n.overlayMetadata.primaryText &&
        typeof n.overlayMetadata.primaryText.content === 'string') {
      const id = n.onTap && n.onTap.innertubeCommand &&
                 n.onTap.innertubeCommand.reelWatchEndpoint &&
                 n.onTap.innertubeCommand.reelWatchEndpoint.videoId;
      if (id) {
        const tObj = n.overlayMetadata.primaryText;
        const translated = tObj.content;
        jobs.push({
          id,
          apply(orig) {
            if (!orig || orig === translated) return;
            tObj.content = orig;
            replaceInLabel(n, 'accessibilityText', translated, orig);
          }
        });
      }
    }
  }

  function collect(root, ctxId) {
    const jobs = [];
    const stack = [root];
    const seen = new WeakSet();
    while (stack.length) {
      const n = stack.pop();
      if (!n || typeof n !== 'object' || seen.has(n)) continue;
      seen.add(n);
      if (Array.isArray(n)) {
        for (let i = 0; i < n.length; i++) stack.push(n[i]);
        continue;
      }
      inspect(n, jobs, ctxId);
      for (const k in n) {
        const v = n[k];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    return jobs;
  }

  // Cache hits are applied synchronously (before the first await);
  // misses are resolved through oEmbed, bounded by `timeout`.
  async function process(json, ctxId, { wait, timeout }) {
    const jobs = collect(json, ctxId);
    const pending = [];
    for (const j of jobs) {
      const hit = cache.get(j.id);
      if (hit) j.apply(hit);
      else pending.push(j);
    }
    if (!pending.length) return json;

    const work = Promise.all(
      pending.map(async (j) => {
        const o = await fetchOriginal(j.id);
        if (o) j.apply(o);
      })
    );
    if (wait) await Promise.race([work, sleep(timeout)]);
    return json;
  }

  /* ------------------------------------------------------------------ *
   * fetch patch
   * ------------------------------------------------------------------ */
  async function rewriteResponse(res, url, bodyP) {
    if (!res.ok) return res;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return res;

    const json = await res.clone().json();

    let ctx = null;
    try { ctx = JSON.parse(await bodyP).videoId || null; } catch {}
    ctx = ctx || currentVideoId();

    await process(json, ctx, { wait: true, timeout: PLAYER_RE.test(url) ? 700 : 2500 });

    const headers = new Headers(res.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    const out = new Response(JSON.stringify(json), {
      status: res.status,
      statusText: res.statusText,
      headers
    });
    try { Object.defineProperty(out, 'url', { value: res.url }); } catch {}
    return out;
  }

  window.fetch = function (input, init) {
    const url = urlOf(input);
    if (!url || !isTarget(url)) return Reflect.apply(nativeFetch, this, arguments);

    let bodyP;
    try {
      if (init && typeof init.body === 'string') bodyP = Promise.resolve(init.body);
      else if (typeof Request !== 'undefined' && input instanceof Request) {
        bodyP = input.clone().text().catch(() => '');
      }
    } catch {}

    return Reflect.apply(nativeFetch, this, arguments).then((res) =>
      rewriteResponse(res, url, bodyP).catch(() => res)
    );
  };

  /* ------------------------------------------------------------------ *
   * XMLHttpRequest patch
   * Matching async XHRs are re-routed through the patched fetch and the XHR
   * instance is driven manually, so the page still sees normal XHR behavior.
   * ------------------------------------------------------------------ */
  const XHR = XMLHttpRequest.prototype;
  const nativeOpen = XHR.open;
  const nativeSend = XHR.send;
  const nativeSetHeader = XHR.setRequestHeader;
  const nativeAbort = XHR.abort;

  XHR.open = function (method, url, async) {
    this.__0t = { method: String(method), url: String(url), async: async !== false, headers: {} };
    return nativeOpen.apply(this, arguments);
  };

  XHR.setRequestHeader = function (k, v) {
    if (this.__0t) this.__0t.headers[k] = v;
    return nativeSetHeader.apply(this, arguments);
  };

  XHR.abort = function () {
    if (this.__0t && this.__0t.emulating) { this.__0t.aborted = true; return; }
    return nativeAbort.apply(this, arguments);
  };

  XHR.send = function (body) {
    const m = this.__0t;
    if (!m || !m.async || !isTarget(m.url)) return nativeSend.apply(this, arguments);
    emulate(this, m, body);
  };

  function emulate(xhr, m, body) {
    m.emulating = true;
    const st = {
      readyState: 1, status: 0, statusText: '', responseURL: '',
      response: '', responseText: ''
    };
    const def = (k) => Object.defineProperty(xhr, k, { configurable: true, get: () => st[k] });
    ['readyState', 'status', 'statusText', 'responseURL', 'response', 'responseText'].forEach(def);

    const fire = (type) => {
      const ev = type === 'readystatechange' ? new Event(type) : new ProgressEvent(type);
      try { xhr.dispatchEvent(ev); } catch {}
    };

    const init = {
      method: m.method,
      headers: m.headers,
      credentials: xhr.withCredentials ? 'include' : 'same-origin'
    };
    if (!/^(GET|HEAD)$/i.test(m.method) && body != null) init.body = body;

    window.fetch(m.url, init)
      .then(async (res) => {
        const text = await res.text();
        if (m.aborted) return;

        const headerStr = [...res.headers].map(([k, v]) => k + ': ' + v).join('\r\n');
        xhr.getAllResponseHeaders = () => headerStr;
        xhr.getResponseHeader = (n) => res.headers.get(n);

        st.status = res.status;
        st.statusText = res.statusText;
        st.responseURL = res.url || m.url;
        st.readyState = 2; fire('readystatechange');
        st.readyState = 3; fire('readystatechange');

        st.responseText = text;
        switch (xhr.responseType) {
          case 'json': try { st.response = JSON.parse(text); } catch { st.response = null; } break;
          case 'arraybuffer': st.response = new TextEncoder().encode(text).buffer; break;
          case 'blob': st.response = new Blob([text]); break;
          default: st.response = text;
        }

        st.readyState = 4;
        fire('readystatechange'); fire('load'); fire('loadend');
      })
      .catch(() => {
        if (m.aborted) return;
        st.readyState = 4;
        fire('readystatechange'); fire('error'); fire('loadend');
      });
  }

  /* ------------------------------------------------------------------ *
   * First page load: YouTube embeds the initial payload in inline scripts
   * (ytInitialData / ytInitialPlayerResponse), which never touch fetch/XHR.
   * A setter patches cached titles synchronously and fills the rest in place.
   * ------------------------------------------------------------------ */
  function hookGlobal(name) {
    let value = window[name];
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get: () => value,
        set: (v) => {
          value = v;
          try {
            if (v && typeof v === 'object') {
              process(v, currentVideoId(), { wait: false, timeout: 0 }).catch(() => {});
            }
          } catch {}
        }
      });
    } catch {}
  }
    hookGlobal('ytInitialData');
    hookGlobal('ytInitialPlayerResponse');
  }, { once: true });
})();
