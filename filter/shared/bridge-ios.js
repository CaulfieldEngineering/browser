// The Instagram filter's bridge on the iPhone (ios/Browser/Filter/InstagramFilter.swift). Runs in the "igfilter" content world, before
// ig-filter.js. Each call asks the app, which judges the image on the phone and answers the scores (or null).
(function () {
  if (globalThis.IGFilterBridge || !(globalThis.webkit && webkit.messageHandlers && webkit.messageHandlers.igf)) return;
  const ask = (msg) => webkit.messageHandlers.igf.postMessage(msg).then((s) => s || null, () => null);
  globalThis.IGFilterBridge = {
    classifyUrl: (url) => ask({ op: 'url', url: String(url) }),
    classifyData: (data) => ask({ op: 'data', data: String(data) }),
    classifyRect: (r) => ask({ op: 'rect', rect: { x: +r.x, y: +r.y, width: +r.width, height: +r.height } }),
  };
})();
