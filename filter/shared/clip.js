// The revealing-clothing judge (Joe, 2026-11-05: "Can we try upping the filtering on instagram? Like, shorter tank-tops,
// bikinis, gymwear etc."). A small zero-shot image model, TinyCLIP-ViT-40M-32 (Microsoft, MIT; vendor/), run on the
// device with onnxruntime-web (MIT): the picture's embedding against prompts embedded once, offline
// (vendor/clip-prompts.json): bikinis and swimwear, lingerie, crop and short tank tops, sports bras, tight gymwear and
// leggings, body-focused fitness posing, against everyday pictures (people in everyday clothes, landscapes, empty
// beaches, gym equipment, people working out in loose clothes, music gear, products, food, text). Gender-neutral by
// design (no gender model; Joe agreed to skip it for now). The answer is the share of the revealing prompts, 0 to 1,
// as scores.Revealing; rules.js decides the line. Runs in the classifier page beside nsfwjs, which is unchanged.
(function () {
  'use strict';
  const MEAN = [0.48145466, 0.4578275, 0.40821073], STD = [0.26862954, 0.26130258, 0.27577711];
  let session = null, prompts = null, loading = null;
  const info = { loadMs: 0, n: 0, totalMs: 0, ready: false, error: '' };

  function load() {
    if (loading) return loading;
    const t0 = performance.now();
    loading = (async () => {
      ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
      ort.env.wasm.numThreads = 1; // no SharedArrayBuffer in these pages; one thread
      ort.env.wasm.proxy = false;
      const [p, model] = await Promise.all([
        fetch('vendor/clip-prompts.json').then((r) => r.json()),
        fetch('vendor/tinyclip-vision-int8.onnx').then((r) => { if (!r.ok) throw new Error('model ' + r.status); return r.arrayBuffer(); }),
      ]);
      prompts = { scale: p.logitScale, nrev: p.rev.length, embeds: p.embeds.map((e) => Float32Array.from(e)) };
      session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      info.loadMs = Math.round(performance.now() - t0);
      info.ready = true;
      return session;
    })().catch((e) => { info.error = String(e && e.message || e); loading = null; throw e; });
    return loading;
  }

  /** The picture as the model wants it: shortest side 224, centre 224 x 224, CLIP's normalisation, CHW. */
  function pixels(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const k = 224 / Math.min(w, h);
    const c = document.createElement('canvas'); c.width = 224; c.height = 224;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(img, (224 - w * k) / 2, (224 - h * k) / 2, w * k, h * k);
    const d = g.getImageData(0, 0, 224, 224).data, out = new Float32Array(3 * 224 * 224);
    for (let i = 0, n = 224 * 224; i < n; i++) for (let ch = 0; ch < 3; ch++) out[ch * n + i] = (d[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    return out;
  }

  /** The share of the revealing prompts for a loaded image (0 to 1). */
  async function revealing(img) {
    await load();
    const started = performance.now();
    const res = await session.run({ pixel_values: new ort.Tensor('float32', pixels(img), [1, 3, 224, 224]) });
    const e = res.embeds.data;
    const logits = prompts.embeds.map((t) => { let s = 0; for (let i = 0; i < t.length; i++) s += t[i] * e[i]; return s * prompts.scale; });
    const m = Math.max(...logits), ex = logits.map((l) => Math.exp(l - m)), sum = ex.reduce((a, b) => a + b, 0);
    let rev = 0; for (let i = 0; i < prompts.nrev; i++) rev += ex[i] / sum;
    info.n++; info.totalMs += performance.now() - started;
    return Math.round(rev * 10000) / 10000;
  }

  window.IGClip = { load, revealing, info: () => ({ ...info, avgMs: info.n ? Math.round(info.totalMs / info.n) : 0 }) };
})();
