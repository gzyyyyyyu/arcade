// 首屏提速：浏览器还在下载主程序时，就先把 title 图集（标题页要用的那部分）的入口和页图拉起来，随后再拉 game 图集（对局用）。
// 之后 assets.ts 的 prepareArt / ensureAtlas 直接接手这里的结果；这里什么都没拿到，它们照常自己去取。
// 单独一个同域脚本而不是内联：页面的 CSP 不许内联脚本。
(function () {
  var q = location.search;
  // 和 assets.ts 的取舍一致：atlas=0、渲染倍数可能高于图集倍数（2）时不用图集，就不白下。
  // 手机平板（theme.ts 的 LOW_MEMORY，照抄同一判断）渲染倍数封顶 2，dpr 3 的 iPhone 照样用图集，必须预取
  var ua = navigator.userAgent;
  var lowMem = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (/[?&]atlas=0/.test(q) || /[?&]scale=/.test(q) || (!lowMem && Math.round(window.devicePixelRatio || 1) > 2)) return;
  var dir = 'assets/art/v3/atlas/';
  var early = (window.__kpEarly = { json: { title: null, game: null }, imgs: {} });
  function getJson(name) {
    return fetch(dir + name + '.json')
      .then(function (r) {
        var type = r.headers.get('content-type') || '';
        return r.ok && type.indexOf('text/html') < 0 ? r.text() : null;
      })
      .catch(function () {
        return null;
      });
  }
  // 返回这组页图全部下完（成功或失败）的 Promise
  function loadPages(text) {
    var waits = [];
    try {
      var pages = JSON.parse(text).textures || [];
      pages.forEach(function (p) {
        if (!p || typeof p.image !== 'string') return;
        var img = new Image();
        // 页图大，让主程序的脚本先到（支持 fetchpriority 的浏览器上生效）
        img.fetchPriority = 'low';
        waits.push(
          new Promise(function (resolve) {
            img.onload = img.onerror = resolve;
          }),
        );
        img.src = dir + p.image;
        early.imgs[p.image] = img;
      });
    } catch (e) {
      /* 格式不对就让 prepareArt 自己报 */
    }
    return Promise.all(waits);
  }
  // 两份入口都小，同时取；标题页只等 title 的页图，先下它；game 的页图（对局用，大）等 title 的到齐再开始，不抢带宽
  early.json.title = getJson('title');
  early.json.game = getJson('game');
  early.json.title
    .then(function (text) {
      return text ? loadPages(text) : null;
    })
    .then(function () {
      return early.json.game;
    })
    .then(function (text) {
      if (text) loadPages(text);
    });
})();
