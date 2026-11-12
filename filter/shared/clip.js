// The revealing-clothing judge (Joe, 2026-11-05: "Can we try upping the filtering on instagram? Like, shorter tank-tops,
// bikinis, gymwear etc."). A small zero-shot image model, TinyCLIP-ViT-40M-32 (Microsoft, MIT; vendor/), run on the
// device with onnxruntime-web (MIT): the picture's embedding against prompts embedded once, offline
// (vendor/clip-prompts.json): bikinis and swimwear, lingerie, crop and short tank tops, sports bras, tight gymwear and
// leggings, body-focused fitness posing, against everyday pictures (people in everyday clothes, landscapes, empty
// beaches, gym equipment, people working out in loose clothes, music gear, products, food, text). Gender-neutral by
// design (no gender model; Joe agreed to skip it for now). The answer is the share of the revealing prompts, 0 to 1,
// as scores.Revealing; rules.js decides the line. Runs in the classifier page beside nsfwjs, which is unchanged.
//
// Lanes (2026-11-12, for speed; Joe: "I spend most of my time looking at empty grey boxes"): this judge is most of the
// time a picture takes, and it ran one picture at a time on the page's own thread. Now the model runs in workers
// (clip-worker.js; two, or as many as the app asks for), so two or three pictures are judged at once and the other
// judge is not held up. The same model, the same numbers. If no worker starts (within 25 s), or they all end,
// the model runs in the page as before; a picture is never judged without it.
(function () {
  'use strict';
  const MEAN = [0.48145466, 0.4578275, 0.40821073], STD = [0.26862954, 0.26130258, 0.27577711];
  const CFG = (typeof IGFilterConfig !== 'undefined' && IGFilterConfig) || {};
  // How many lanes: the app says (classifier.html?lanes=3 on a phone with the cores and memory for it, 1 after the
  // judge's process ended twice), else the settings, else two.
  const asked = /[?&]lanes=(\d)/.exec(location.search);
  const WANT = Math.max(0, Math.min(4, asked ? +asked[1] : Number.isFinite(CFG.judgeLanes) ? CFG.judgeLanes : 2));
  const WORKER_WAIT = window.__igClipWorkerWait || 25000, RUN_WAIT = 30000;
  let session = null, prompts = null, loading = null;
  const lanes = []; // workers that are ready: { worker, busy, jobs: Map }
  const info = { loadMs: 0, n: 0, totalMs: 0, ready: false, error: '', mode: '', lanes: 0 };

  const loadPrompts = () => fetch('vendor/clip-prompts.json').then((r) => r.json()).then((p) => {
    prompts = { scale: p.logitScale, nrev: p.rev.length, embeds: p.embeds.map((e) => Float32Array.from(e)) };
  });

  // The model in the page itself: the way it ran before the lanes, and what is left if no worker can start.
  let pageLoading = null;
  function loadInPage() {
    return pageLoading || (pageLoading = (async () => {
      ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
      ort.env.wasm.numThreads = 1; // no SharedArrayBuffer in these pages; one thread
      ort.env.wasm.proxy = false;
      const r = await fetch('vendor/tinyclip-vision-int8.onnx');
      if (!r.ok) throw new Error('model ' + r.status);
      session = await ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      return session;
    })().catch((e) => { pageLoading = null; throw e; }));
  }

  function startLane() {
    return new Promise((resolve) => {
      let worker, settled = false;
      const lane = { worker: null, jobs: new Map(), dead: false };
      const fail = (why) => {
        lane.dead = true;
        const i = lanes.indexOf(lane); if (i >= 0) lanes.splice(i, 1);
        info.lanes = lanes.length;
        for (const [, job] of lane.jobs) job.reject(new Error('lane ' + why));
        lane.jobs.clear();
        try { worker && worker.terminate(); } catch {}
        if (!settled) { settled = true; resolve(null); }
      };
      try { worker = new Worker('clip-worker.js'); } catch (e) { info.error = 'worker: ' + String(e && e.message || e); return resolve(null); }
      lane.worker = worker;
      const timer = setTimeout(() => { if (!settled) { info.error = 'worker: slow to start'; fail('slow'); } }, WORKER_WAIT);
      worker.onerror = (e) => { info.error = 'worker: ' + String((e && e.message) || 'error'); clearTimeout(timer); fail('error'); };
      worker.onmessage = (ev) => {
        const d = ev.data || {};
        if ('ready' in d) {
          clearTimeout(timer);
          if (!d.ready) { info.error = 'worker: ' + d.error; return fail('load'); }
          if (lane.dead) return;
          lanes.push(lane); info.lanes = lanes.length;
          settled = true; resolve(lane);
          return;
        }
        const job = lane.jobs.get(d.id);
        if (!job) return;
        lane.jobs.delete(d.id);
        clearTimeout(job.timer);
        if (d.error) job.reject(new Error(d.error)); else job.resolve(d.embeds);
      };
      lane.fail = fail;
    });
  }

  function load() {
    if (loading) return loading;
    const t0 = performance.now();
    loading = (async () => {
      const promptsReady = loadPrompts();
      let ok = false;
      if (WANT > 0 && typeof Worker === 'function') {
        // Ready with the first lane. The others start once it is in (starting them together made every one of them,
        // and the other judge, slower to load) and join as they load.
        ok = !!(await startLane());
        if (ok) for (let i = 1; i < WANT; i++) startLane();
      }
      if (ok) info.mode = 'workers';
      else { await loadInPage(); info.mode = 'page'; }
      await promptsReady;
      info.loadMs = Math.round(performance.now() - t0);
      info.ready = true;
      return true;
    })().catch((e) => { info.error = String(e && e.message || e); loading = null; throw e; });
    return loading;
  }

  /** The picture as the model wants it: shortest side 224, centre 224 x 224, CLIP's normalisation, CHW. */
  function pixels(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const k = 224 / Math.min(w, h);
    const c = document.createElement('canvas'); c.width = 224; c.height = 224;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, (224 - w * k) / 2, (224 - h * k) / 2, w * k, h * k);
    const d = g.getImageData(0, 0, 224, 224).data, out = new Float32Array(3 * 224 * 224);
    for (let i = 0, n = 224 * 224; i < n; i++) for (let ch = 0; ch < 3; ch++) out[ch * n + i] = (d[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    return out;
  }

  let nextId = 1;
  function inLane(px) {
    // The lane with the least waiting.
    let lane = lanes[0];
    for (const l of lanes) if (l.jobs.size < lane.jobs.size) lane = l;
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => { if (lane.jobs.has(id)) { info.error = 'worker: no answer'; lane.fail('stuck'); } }, RUN_WAIT);
      lane.jobs.set(id, { resolve, reject, timer });
      lane.worker.postMessage({ id, pixels: px }, [px.buffer]);
    });
  }
  async function embed(img) {
    if (lanes.length) {
      try { return await inLane(pixels(img)); }
      catch (e) { if (lanes.length) return inLane(pixels(img)); } // that lane ended: once more in another, else in the page
    }
    await loadInPage();
    info.mode = 'page';
    const res = await session.run({ pixel_values: new ort.Tensor('float32', pixels(img), [1, 3, 224, 224]) });
    return res.embeds.data;
  }

  /** The share of the revealing prompts for a loaded image (0 to 1). */
  async function revealing(img) {
    await load();
    const started = performance.now();
    const e = await embed(img);
    const logits = prompts.embeds.map((t) => { let s = 0; for (let i = 0; i < t.length; i++) s += t[i] * e[i]; return s * prompts.scale; });
    const m = Math.max(...logits), ex = logits.map((l) => Math.exp(l - m)), sum = ex.reduce((a, b) => a + b, 0);
    let rev = 0; for (let i = 0; i < prompts.nrev; i++) rev += ex[i] / sum;
    info.n++; info.totalMs += performance.now() - started;
    return Math.round(rev * 10000) / 10000;
  }

  /** How many pictures can be judged at once (the lanes ready now; one in the page). */
  const width = () => Math.max(1, lanes.length);
  window.IGClip = { load, revealing, width, info: () => ({ ...info, avgMs: info.n ? Math.round(info.totalMs / info.n) : 0 }) };
})();
