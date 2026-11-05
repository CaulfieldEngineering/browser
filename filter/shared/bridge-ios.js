// The Instagram filter's bridge on the iPhone (ios/Browser/Filter/InstagramFilter.swift). Runs in the "igfilter" content
// world, before ig-filter.js. Each call asks the app, which judges the image on the phone and answers the scores, or
// {_error: reason} when it could not judge it (loading, unreadable, timeout, host).
(function () {
  if (globalThis.IGFilterBridge || !(globalThis.webkit && webkit.messageHandlers && webkit.messageHandlers.igf)) return;
  const ask = (msg) => webkit.messageHandlers.igf.postMessage(msg).then((s) => s || { _error: 'none' }, () => ({ _error: 'bridge' }));
  globalThis.IGFilterBridge = {
    classifyUrl: (url) => ask({ op: 'url', url: String(url) }),
    classifyData: (data) => ask({ op: 'data', data: String(data) }),
    classifyRect: (r) => ask({ op: 'rect', rect: { x: +r.x, y: +r.y, width: +r.width, height: +r.height } }),
    stat: (name) => { webkit.messageHandlers.igf.postMessage({ op: 'stat', name: String(name).slice(0, 40) }).catch(() => {}); },
    warm: () => { webkit.messageHandlers.igf.postMessage({ op: 'warm' }).catch(() => {}); },
  };
})();
