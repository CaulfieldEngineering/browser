// The classifier behind the Instagram filter (classifier.html). One model, loaded once; images in as data: URLs,
// scores out as {Drawing, Hentai, Neutral, Porn, Sexy}. Runs on the device only.
(function () {
  'use strict';
  let model = null, loading = null;
  const load = () => loading || (loading = nsfwjs.load('MobileNetV2').then((m) => {
    model = m;
    info.loadMs = Math.round(performance.now() - t0);
    try { info.backend = (window._tfengine && window._tfengine.backendName) || ''; } catch {}
    return m;
  }));

  function image(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('bad image'));
      img.src = dataUrl;
    });
  }

  // One picture at a time: the model is one engine, and a feed asks for dozens at once. A queue keeps each answer's
  // time to its own work, so a busy feed does not make the native side give up on pictures still waiting.
  let chain = Promise.resolve();
  const info = { backend: '', loadMs: 0, n: 0, totalMs: 0 };
  const t0 = performance.now();
  function classify(dataUrl) {
    const run = chain.then(() => classifyNow(dataUrl));
    chain = run.catch(() => {});
    return run;
  }
  async function classifyNow(dataUrl) {
    const started = performance.now();
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new Error('not an image');
    await load();
    const img = await image(dataUrl);
    const c = document.createElement('canvas');
    c.width = 224; c.height = 224;
    // Centre-crop to a square, as the model was trained.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 224, 224);
    let out = await model.classify(c, 5);
    // A tall picture (most posts and Reels) is also judged on its top and bottom halves, so a crop does not hide it.
    if (img.naturalHeight > img.naturalWidth * 1.3) {
      for (const top of [0, img.naturalHeight - side]) {
        c.getContext('2d').drawImage(img, 0, top, side, side, 0, 0, 224, 224);
        const more = await model.classify(c, 5);
        out = out.map((o) => ({ className: o.className, probability: Math.max(o.probability, (more.find((m) => m.className === o.className) || {}).probability || 0) }));
      }
    }
    const scores = {};
    for (const o of out) scores[o.className] = Math.round(o.probability * 10000) / 10000;
    info.n++; info.totalMs += performance.now() - started;
    return scores;
  }

  window.IGClassifier = { classify, load, info: () => ({ ...info, avgMs: info.n ? Math.round(info.totalMs / info.n) : 0 }) };

  // The iPhone app: native calls igcClassify(id, dataUrl) and hears back on the "igc" message handler.
  window.igcClassify = (id, dataUrl) => {
    classify(dataUrl)
      .then((scores) => window.webkit.messageHandlers.igc.postMessage({ id, scores, info: window.IGClassifier.info() }))
      .catch((e) => window.webkit.messageHandlers.igc.postMessage({ id, error: String(e && e.message || e) }));
    return true;
  };
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.igc) {
    load().then(() => window.webkit.messageHandlers.igc.postMessage({ ready: true, info: window.IGClassifier.info() }))
      .catch((e) => window.webkit.messageHandlers.igc.postMessage({ ready: false, error: String(e) }));
  }

  // The laptop extension: its offscreen document answers {igc: 'classify', data} from the service worker.
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg && msg.igc === 'ping') { reply({ ready: true }); return false; }
      if (!msg || msg.igc !== 'classify') return false;
      classify(msg.data).then((scores) => reply({ scores })).catch((e) => reply({ error: String(e && e.message || e) }));
      return true;
    });
    load();
  }
})();
