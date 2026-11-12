// One lane of the revealing-clothing judge (clip.js), in a worker of its own, so two pictures can be judged at once
// and the classifier page stays free for the other judge. The same model and runtime as in the page; the page sends
// the picture as the model wants it (pixels, CHW float32) and gets the embedding back. Loads nothing from the network.
/* global ort, importScripts */
importScripts('vendor/ort/ort.wasm.min.js');
let session = null;
const ready = (async () => {
  ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
  ort.env.wasm.numThreads = 1; // no SharedArrayBuffer in these pages; one thread a lane
  ort.env.wasm.proxy = false;
  const r = await fetch('vendor/tinyclip-vision-int8.onnx');
  if (!r.ok) throw new Error('model ' + r.status);
  session = await ort.InferenceSession.create(new Uint8Array(await r.arrayBuffer()), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
})();
ready.then(() => postMessage({ ready: true }), (e) => postMessage({ ready: false, error: String(e && e.message || e) }));
onmessage = async (ev) => {
  const { id, pixels } = ev.data || {};
  try {
    await ready;
    const res = await session.run({ pixel_values: new ort.Tensor('float32', pixels, [1, 3, 224, 224]) });
    const embeds = new Float32Array(res.embeds.data);
    postMessage({ id, embeds }, [embeds.buffer]);
  } catch (e) { postMessage({ id, error: String(e && e.message || e) }); }
};
