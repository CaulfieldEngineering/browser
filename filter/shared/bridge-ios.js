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
    // How many pictures the judge takes at a time on this phone (its lanes), so the page keeps that many in flight.
    width: () => webkit.messageHandlers.igf.postMessage({ op: 'width' }).then((n) => (n > 0 ? n : 1), () => 1),
    // Hidden by hand: a record (ids, scores, rules; never the picture) kept on the phone and sent with the feed.
    report: (record) => { webkit.messageHandlers.igf.postMessage({ op: 'report', record: JSON.stringify(record).slice(0, 4000) }).catch(() => {}); },
    // "Skip posts I've seen" (ig-seen.js): the menu's switch, on unless turned off.
    seenOn: () => webkit.messageHandlers.igf.postMessage({ op: 'seen' }).then((on) => on !== false, () => true),
    byHand: () => webkit.messageHandlers.igf.postMessage({ op: 'byhand' }).then((ids) => (Array.isArray(ids) ? ids : []), () => []),
  };
})();
