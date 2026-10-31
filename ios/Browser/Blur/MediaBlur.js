/* Runs in an isolated WKContentWorld, in every frame, before page scripts and first paint. */
(() => {
  'use strict';
  const bridge = globalThis.webkit.messageHandlers.mediaBlur;
  const protectedImages = new WeakMap();
  const backgrounds = new WeakMap();
  const pending = new Set();
  const videos = new Map();
  let working = 0;
  let scanning = false;
  const safety = document.createElement('style');
  safety.textContent = `
    img,video,canvas,svg,object,embed { visibility:hidden!important; }
    *::before,*::after { background-image:none!important; content:normal!important; }
    video::-webkit-media-controls-fullscreen-button,
    video::-webkit-media-controls-picture-in-picture-button { display:none!important; }
  `;
  const backgroundSafety = document.createElement('style');
  backgroundSafety.textContent = '* { background-image:none!important; border-image-source:none!important; list-style-image:none!important; }';
  const mount = () => {
    if (!document.documentElement) return;
    if (!safety.isConnected) document.documentElement.prepend(safety);
    if (!backgroundSafety.isConnected) document.documentElement.prepend(backgroundSafety);
  };
  mount();
  function hide(el) { el.style.setProperty('visibility', 'hidden', 'important'); }
  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > -300 && r.top < innerHeight + 300 && r.right > 0 && r.left < innerWidth;
  }
  function sourceOf(el) { return el.currentSrc || el.src || ''; }
  function enqueue(el) {
    if (!(el instanceof HTMLImageElement)) return;
    const state = protectedImages.get(el);
    if (state && el.src === state.output && !el.srcset && !el.closest('picture')?.querySelector('source[srcset]:not([srcset=""])')) return;
    hide(el);
    if (!state || !state.busy) pending.add(el);
    pump();
  }
  async function processImage(el) {
    const source = sourceOf(el);
    if (!source || source === protectedImages.get(el)?.output) return;
    const state = { source, output: '', busy: true };
    protectedImages.set(el, state);
    try {
      // Blob images can be read locally; native handles cross-origin network URLs without forwarding page data.
      let input = source;
      if (source.startsWith('blob:')) {
        const blob = await (await fetch(source)).blob();
        if (blob.size > 20 * 1024 * 1024) throw Error('Too large');
        input = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
        });
      }
      const size = Math.ceil(Math.max(el.clientWidth, el.clientHeight, 512) * Math.min(devicePixelRatio, 2));
      const result = await bridge.postMessage({ kind: 'image', source: input, size });
      if (!el.isConnected || sourceOf(el) !== source || protectedImages.get(el) !== state) return;
      const check = new Image(); check.src = result.image; await check.decode();
      if (sourceOf(el) !== source) return;
      state.output = result.image;
      el.closest('picture')?.querySelectorAll('source').forEach(s => s.removeAttribute('srcset'));
      el.removeAttribute('srcset');
      el.removeAttribute('sizes');
      el.src = state.output;
      await el.decode();
      if (el.src !== state.output) return;
      el.style.setProperty('visibility', 'visible', 'important');
      // Animation only changes the processed image's opacity. The original never fades through.
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
    } catch (_) { hide(el); }
    finally { state.busy = false; }
  }
  function pump() {
    if (working >= 2) return;
    for (const el of pending) {
      if (!el.isConnected) { pending.delete(el); continue; }
      if (!visible(el)) continue;
      pending.delete(el); working++;
      processImage(el).finally(() => { working--; pump(); });
      if (working >= 2) break;
    }
  }

  async function background(el) {
    if (el === safety || el === backgroundSafety || el.tagName?.startsWith('BROWSER-')) return;
    const old = backgrounds.get(el);
    if (old && (old.busy || el.style.backgroundImage.includes(old.output))) return;
    // Disable the suppression sheet only within this synchronous JS task. No rendering occurs between
    // these statements, and the native content rule still blocks original network images.
    backgroundSafety.disabled = true;
    let value;
    try { value = getComputedStyle(el).backgroundImage; } finally { backgroundSafety.disabled = false; }
    if (!value || value === 'none') return;
    const match = /^url\(["']?(.*?)["']?\)$/.exec(value);
    el.style.setProperty('background-image', 'none', 'important');
    if (!match || !visible(el)) return;
    const state = { busy: true, output: '' };
    backgrounds.set(el, state);
    try {
      const result = await bridge.postMessage({ kind: 'image', source: new URL(match[1], document.baseURI).href, size: 1024 });
      if (!el.isConnected || backgrounds.get(el) !== state) return;
      const check = new Image(); check.src = result.image; await check.decode();
      state.output = result.image;
      el.style.setProperty('background-image', `url("${result.image}")`, 'important');
    } catch (_) { /* leave the original suppressed */ }
    finally { state.busy = false; }
  }

  // The live video is always hidden. We display complete processed frames, never a delayed mask on top
  // of newer raw pixels. When capture is tainted, DRM protected or too slow, the neutral cover remains.
  let overlay;
  function videoOverlay() {
    if (overlay?.isConnected) return overlay;
    const host = document.createElement('browser-video-cover');
    host.style.cssText = 'position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = '.frame{position:absolute;overflow:hidden;background:#272a30;outline:3px solid #101318;outline-offset:-3px;contain:strict}.frame img{width:100%;height:100%;visibility:visible;display:block}.frame button{position:absolute;bottom:8px;left:8px;pointer-events:auto;border:1px solid #888;border-radius:6px;background:#16181c;color:white;padding:6px 12px;font:13px -apple-system}';
    root.append(style); document.documentElement.append(host);
    overlay = host; overlay.root = root;
    return overlay;
  }
  function trackVideo(video) {
    if (videos.has(video)) return;
    hide(video);
    video.playsInline = true;
    video.disablePictureInPicture = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x-webkit-airplay', 'deny');
    video.controls = false;
    const cover = document.createElement('div'); cover.className = 'frame';
    const picture = document.createElement('img'); picture.style.opacity = '0';
    const button = document.createElement('button'); button.textContent = 'Play / pause';
    button.onclick = () => video.paused ? video.play().catch(() => {}) : video.pause();
    cover.append(picture, button); videoOverlay().root.append(cover);
    videos.set(video, { cover, picture, busy: false, last: 0, attempt: 0, canvas: document.createElement('canvas') });
  }
  function positionVideos() {
    for (const [video, state] of videos) {
      if (!video.isConnected) { state.cover.remove(); videos.delete(video); continue; }
      const r = video.getBoundingClientRect();
      state.cover.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;display:${visible(video) && r.width && r.height ? 'block' : 'none'};`;
      const style = getComputedStyle(video);
      state.picture.style.objectFit = style.objectFit;
      state.picture.style.objectPosition = style.objectPosition;
      state.cover.style.borderRadius = style.borderRadius;
      // Clip to scrolling containers; never paint over unrelated content outside the video viewport.
      let clip = { top: 0, right: innerWidth, bottom: innerHeight, left: 0 };
      for (let parent = video.parentElement; parent; parent = parent.parentElement) {
        const s = getComputedStyle(parent);
        if (/(hidden|scroll|auto|clip)/.test(s.overflow + s.overflowX + s.overflowY)) {
          const b = parent.getBoundingClientRect();
          clip = { top: Math.max(clip.top, b.top), right: Math.min(clip.right, b.right), bottom: Math.min(clip.bottom, b.bottom), left: Math.max(clip.left, b.left) };
        }
      }
      state.cover.style.clipPath = `inset(${Math.max(0, clip.top - r.top)}px ${Math.max(0, r.right - clip.right)}px ${Math.max(0, r.bottom - clip.bottom)}px ${Math.max(0, clip.left - r.left)}px)`;
    }
  }
  async function frame(video, state, now) {
    if (state.busy || now - state.attempt < 100 || !visible(video) || video.readyState < 2 || document.hidden) return;
    if (video.paused && state.last) return;
    state.busy = true; state.attempt = now;
    try {
      const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
      if (!scale || !Number.isFinite(scale)) throw Error('No frame');
      state.canvas.width = Math.round(video.videoWidth * scale); state.canvas.height = Math.round(video.videoHeight * scale);
      state.canvas.getContext('2d').drawImage(video, 0, 0, state.canvas.width, state.canvas.height);
      const result = await bridge.postMessage({ kind: 'frame', source: state.canvas.toDataURL('image/jpeg', 0.8) });
      // A delayed result is safe but stale; keep it covered until a timely frame arrives.
      if (performance.now() - now > 300) return;
      state.picture.src = result.image; await state.picture.decode();
      state.last = performance.now(); state.picture.style.opacity = '1';
    } catch (_) { state.picture.style.opacity = '0'; }
    finally { state.busy = false; }
  }
  function scan(root) {
    mount();
    if (root instanceof HTMLImageElement) enqueue(root);
    if (root instanceof HTMLVideoElement) trackVideo(root);
    root.querySelectorAll?.('img').forEach(enqueue);
    root.querySelectorAll?.('video').forEach(trackVideo);
    // Open shadow roots get the same protection. Closed roots remain protected by the network barrier.
    const elements = root.querySelectorAll?.('*') || [];
    let index = 0;
    function batch() {
      const until = Math.min(index + 40, elements.length);
      for (; index < until; index++) {
        const el = elements[index];
        if (el.shadowRoot) {
          if (!el.shadowRoot.querySelector('[data-browser-protection]')) {
            const style = document.createElement('style'); style.dataset.browserProtection = '1';
            style.textContent = safety.textContent + backgroundSafety.textContent; el.shadowRoot.prepend(style);
            scan(el.shadowRoot);
          }
        }
        if (working === 0 && visible(el)) background(el);
      }
      if (index < elements.length) setTimeout(batch, 20);
    }
    batch();
  }
  const observer = new MutationObserver(records => {
    mount();
    for (const record of records) {
      if (record.type === 'attributes') {
        const el = record.target;
        if (el instanceof HTMLImageElement) enqueue(el);
        if (el instanceof HTMLSourceElement) el.closest('picture')?.querySelectorAll('img').forEach(enqueue);
        if (el instanceof HTMLVideoElement) { hide(el); if (el.controls) el.controls = false; }
      } else for (const node of record.addedNodes) if (node.nodeType === 1 && !node.tagName?.startsWith('BROWSER-')) scan(node);
    }
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset', 'sizes', 'class', 'controls'] });
  document.addEventListener('load', e => { if (e.target instanceof HTMLImageElement) enqueue(e.target); }, true);
  document.addEventListener('DOMContentLoaded', () => scan(document), { once: true });
  addEventListener('scroll', () => { pump(); positionVideos(); }, { passive: true, capture: true });
  addEventListener('resize', () => { pump(); positionVideos(); });
  setInterval(() => {
    mount(); pump(); positionVideos();
    const now = performance.now();
    for (const [video, state] of videos) {
      if (!video.paused && now - state.last > 300) state.picture.style.opacity = '0';
      frame(video, state, now);
    }
  }, 100);
  globalThis.__browserBlurReady = true;
})();
