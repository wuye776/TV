// ============================================================
// 影视仓 / TVBox 本地包 · QuickJS spider (type:3 零服务器)
// 目标站：黄果漫剧（2026-10 改版为 SSR HTML，旧 JSON API 已废）
//
// api.json:
//   { "type": 3, "api": "./js/huangguoac.js",
//     "ext": { "base": "https://a1dz.eqbxqk5v3.cc" } }
//
// 站点现状测绘（2026-10 实测）：
//   旧接口 GET /api/videos?page=N 等全部变成 catch-all：
//     任何 /api/videos/* 都回 {"status":0,"msg":"无效的 ID"}，JSON 数据层已下线。
//   新站是服务端渲染 HTML：
//     /                     首页
//     /{slug}/              分类第1页   slug: ai-manju lifan-dongman duanju riman hanman
//     /{slug}/{page}/       分类第N页   （?page=N 无效，只认路径）
//     /detail/{id}/         详情页
//     /video/{id}/          播放页（内嵌 <script id="videoInitialData" type="application/json">）
//     /video/{id}/ep-{n}/   第 n 集
//     /search/video/{kw}/   搜索（第N页：/search/video/{kw}/{page}/）
//     /tag/{slug}/          标签页
//   列表卡片：<div class="hg-comic-feed-card" data-track-id="3845" data-track-title="东郊到家">
//                …<img … data-src="封面">…<span class="hg-comic-feed-card__episode">更新至1集</span>
//   分页：<span … data-pages="69">
//   播放页 JSON 含 title/coverSrc/description/tags/time/epPlaySrcs{"1":"…m3u8"} 与选集网格
//   data-ep-id="1..N"，所以详情和播放都只需要一发 /video/{id}/。
//
// 版本：
//   v3 新增 🔧诊断分类 + 列表失败页吐诊断行
//   v4 真机返回形状5 {headers,content,code} 适配；域名池兜底
//   v5 直连被阻断时走服务端代理代抓（allorigins/codetabs/jina）
//   v6 「诊断转圈」：单发硬超时 7s、绑定零探测、通道最多两条、诊断 1~2 发
//   v7 站点改版：JSON API → HTML 抓取。域名池换成发布页公布的三条 .cc 线路，
//      列表/详情/播放全部走 HTML（详情与播放共用 /video/{id}/ 的内嵌 JSON）。
// ============================================================

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// v7 域名池：https://huangguoac.net/ 发布页公布的线路 01/02/03。
// 老的 huangguoac.com / .net / .com6 / wy60j19s.cc 已全废（连接重置或 404）。
const HOSTS = [
    'https://a1dz.eqbxqk5v3.cc',
    'https://gfwfe.eqbxqk5v3.cc',
    'https://i5vn9.eqbxqk5v3.cc'
];
let BASE = HOSTS[0];
let HEADERS = { 'User-Agent': UA, 'Referer': BASE + '/', 'Accept': 'text/html,application/xhtml+xml,application/json,*/*' };

// v6：单次请求硬超时。宿主支持就生效，不支持也只是多等，不会更糟。
const TIMEOUT = 7000;
// 直连优先（v7 实测直连可出数据），失败才逐级代理；最多两条，路径越多转圈越久。
const TRANSPORTS = ['direct', 'proxy1', 'proxy2'];
const DEAD = {};          // 本轮彻底失败的通道，不再重复等
let LAST_ERR = '';        // 最近一次网络错误，诊断页直接展示
let FAIL_AT = 0;          // 熔断：刚全败过就降级成「一发 + 3s」
const PROXIES = {
    proxy1: u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    proxy2: u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    proxy3: u => 'https://r.jina.ai/' + u,
};
let TRANSPORT_OK = '';
let PROXY_OFF = false;
let HOST_OK = '';

// 绑定通道自适配：app 端 http/req 返回形状各异（对象/纯串/Promise），按存在性选。
let BINDING_OK = '';
let BINDING_LOCKED = false;

// 分类：直接对应站点主导航（稳定，零网络）
const CATS = [
    { slug: 'duanju', name: '成人短剧' },
    { slug: 'ai-manju', name: 'AI漫剧' },
    { slug: 'lifan-dongman', name: '里番动漫' },
    { slug: 'riman', name: '成人日漫' },
    { slug: 'hanman', name: '成人韩漫' }
];

// 标签走站内搜索兜底（/tag/ 页不分页，翻页 404）
const HOT_TAGS = ['现代', '都市', '职场', '大女主', '甜宠', '古风', '校园', '重生', '逆袭', '悬疑'];

// ---------- 网络 ----------

function normalizeBody(res) {
    if (res == null) return '';
    if (typeof res === 'string') return res;
    if (typeof res !== 'object') return String(res);
    if (typeof res.then === 'function') return '';
    const c = res.content !== undefined ? res.content
        : (res.body !== undefined ? res.body
        : (res.data !== undefined ? res.data
        : (res.text !== undefined ? res.text : undefined)));
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object') return JSON.stringify(c);
    return '';
}

// 真机形状5用 code 而非 status
function resCode(r) {
    if (r == null || typeof r !== 'object') return undefined;
    if (r.code !== undefined) return r.code;
    if (r.status !== undefined) return r.status;
    return undefined;
}
function resOk(r) {
    if (r == null || typeof r !== 'object') return true;
    if (r.ok === false) return false;
    if (r.code !== undefined) {
        const c = r.code;
        return c === 0 || (c >= 200 && c < 400);
    }
    if (r.status !== undefined) {
        const s = r.status;
        if (s === 1 || s === 0) return true;
        return s >= 200 && s < 400;
    }
    return true;
}

function bindingList() {
    const out = [];
    const push = function (n) { if (out.indexOf(n) < 0) out.push(n); };
    if (BINDING_OK) push(BINDING_OK);
    if (typeof http === 'function') push('http');
    if (typeof req === 'function') push('req');
    if (typeof net !== 'undefined' && net && typeof net.http === 'function') push('net');
    return out;
}

function callBinding(n, url, o) {
    if (n === 'http') return http(url, o);
    if (n === 'req') return req(url, o);
    if (n === 'net') return net.http(url, o);
    throw new Error('no binding ' + n);
}

// 不再为“探形状”白打一发网络请求：形状由 normalizeBody 全兼容。
function ensureBinding() {
    if (BINDING_LOCKED) return;
    const l = bindingList();
    BINDING_OK = l.length ? l[0] : '';
    BINDING_LOCKED = true;
}

function request(url, options) {
    const o = Object.assign({ async: false, timeout: TIMEOUT }, options || {});
    o.async = false;
    ensureBinding();
    const l = bindingList();
    let last = null;
    for (let i = 0; i < l.length; i++) {
        try {
            const r = callBinding(l[i], url, o);
            if (r && typeof r === 'object' && typeof r.then === 'function') continue;
            BINDING_OK = l[i];
            return r;
        } catch (e) { last = e; }
    }
    throw last || new Error('no http binding');
}

function proxify(url, transport) {
    if (transport === 'direct' || !PROXIES[transport]) return url;
    const sep = url.indexOf('?') >= 0 ? '&' : '?';
    url = url + sep + '_nc=' + Date.now();
    return PROXIES[transport](url);
}

function transportOrder() {
    if (PROXY_OFF) return ['direct'];
    if (TRANSPORT_OK) return DEAD[TRANSPORT_OK] ? [] : [TRANSPORT_OK];
    const out = [];
    for (let i = 0; i < TRANSPORTS.length; i++) {
        const t = TRANSPORTS[i];
        if (!DEAD[t]) out.push(t);
    }
    return out.length ? out : TRANSPORTS.slice(0, 1);
}

// v7：接受 HTML。want='html' 只认 <，want='json' 只认 {/[。
function looksLike(txt, want) {
    if (!txt) return false;
    const t = String(txt).replace(/^[\s\uFEFF]+/, '');
    const c = t.charAt(0);
    if (c === '<') return want !== 'json';
    if (c === '{' || c === '[') return want !== 'html';
    return false;
}

function fetchOnce(url, want, maxTry) {
    const quick = FAIL_AT && (Date.now() - FAIL_AT < 60000);
    const eff = transportOrder().slice(0, quick ? 1 : (maxTry || 2));
    if (!eff.length) throw new Error('通道全黑，等重试');
    let lastErr = null;
    for (let i = 0; i < eff.length; i++) {
        const t = eff[i];
        try {
            const res = request(proxify(url, t), { headers: HEADERS, timeout: quick ? 3000 : TIMEOUT });
            if (res && typeof res === 'object' && res.ok === false) throw new Error('http ' + (res.status || ''));
            if (!resOk(res)) throw new Error('code ' + resCode(res));
            const txt = normalizeBody(res);
            if (!txt) throw new Error('空响应');
            if (!looksLike(txt, want)) throw new Error('形状不符(' + t + ',' + txt.length + ')');
            TRANSPORT_OK = t;
            FAIL_AT = 0;
            delete DEAD[t];
            return txt;
        } catch (e) {
            lastErr = e;
            DEAD[t] = 1;
        }
    }
    LAST_ERR = String(lastErr && lastErr.message || lastErr || '');
    FAIL_AT = Date.now();
    throw lastErr || new Error('fetch failed');
}

function resetDead() { for (const k in DEAD) delete DEAD[k]; }

// 一发拿文档：主域名一次，失败再换一个备域名，然后收手（全池轮换＝转圈）。
function fetchDoc(path, want) {
    ensureBinding();
    const tries = [];
    if (/^https?:\/\//.test(path)) {
        tries.push(path);
    } else {
        const first = HOST_OK || BASE;
        tries.push(first + path);
        for (let i = 0; i < HOSTS.length && tries.length < 2; i++) {
            if (HOSTS[i] !== first) tries.push(HOSTS[i] + path);
        }
    }
    let lastErr = null;
    for (let i = 0; i < tries.length; i++) {
        try {
            const txt = fetchOnce(tries[i], want, 1);
            const host = (tries[i].match(/^(https?:\/\/[^/]+)/) || [])[1] || BASE;
            HOST_OK = host;
            BASE = host;
            HEADERS.Referer = host + '/';
            return txt;
        } catch (e) { lastErr = e; }
    }
    HOST_OK = '';
    resetDead();
    throw lastErr || new Error('fetch failed');
}

// ---------- HTML 解析 ----------

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
function unesc(s) {
    return String(s == null ? '' : s).replace(/&(amp|lt|gt|quot|#39|nbsp);/g, function (m) { return ENT[m] || m; });
}
function stripTags(s) {
    return unesc(String(s || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

// 封面域换血：pic.drleao.cn 吐的是 AES-128-CBC 密文，而 req/http 把它当 UTF-8 文本递回，
// 字节在进 JS 之前就被 U+FFFD 折断了（首字节 65533 = 不可逆），解密无从谈起。
// 但同一 path 在 og:image 的明文域 imgpublic.ycomesc.live 上是裸 JPEG（喂爬虫用，不加密）。
// 实测：246624(密) vs 246612(明)，差 12 正是 PKCS7 补位；首字节 FF D8 FF E0。path 与 query 原样透传。
const PIC_CIPHER_HOST = /^(https?:\/\/)?pic\.drleao\.cn(\/|$)/i;
const PIC_PLAIN_HOST = 'https://imgpublic.ycomesc.live';

function fixCover(u) {
    const s = String(u == null ? '' : u).trim();
    if (!s) return '';
    if (s.indexOf('cover-placeholder') >= 0) return '';
    if (PIC_CIPHER_HOST.test(s)) return PIC_PLAIN_HOST + s.replace(PIC_CIPHER_HOST, '/');
    return s;
}

// 列表卡片：data-track-id + data-track-title 是最稳的锚点，卡片体切 3000 字符窗口取封面/集数/标签
const CARD_RE = /data-track-id="(\d+)"\s+data-track-title="([^"]*)"/g;
const DETAIL_RE = /href="\/detail\/(\d+)\/"[^>]*>[\s\S]{0,600}?alt="([^"]*)"/g;

function pickCards(html) {
    const hits = [];
    CARD_RE.lastIndex = 0;
    let m;
    while ((m = CARD_RE.exec(html))) hits.push({ id: m[1], title: m[2], start: m.index, end: CARD_RE.lastIndex });
    if (!hits.length) {
        // 兜底：详情链接 + alt
        DETAIL_RE.lastIndex = 0;
        while ((m = DETAIL_RE.exec(html))) hits.push({ id: m[1], title: m[2], start: m.index, end: DETAIL_RE.lastIndex });
    }
    return hits;
}

function parseCards(html) {
    const hits = pickCards(html);
    const out = [];
    const seen = {};
    for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (seen[h.id]) continue;
        seen[h.id] = 1;
        const stop = i + 1 < hits.length ? hits[i + 1].start : hits.length ? html.length : html.length;
        const chunk = html.slice(h.end, Math.min(stop, h.end + 3000));
        let cover = '';
        const cm = /data-src="([^"]+)"/.exec(chunk) || /<img[^>]+src="(https?:\/\/[^"]+)"/.exec(chunk);
        if (cm) cover = unesc(cm[1]);
        if (!cover || cover.indexOf('cover-placeholder') >= 0) {
            const cm2 = /<img[^>]+src="(https?:\/\/[^"]+)"/.exec(chunk);
            if (cm2) cover = unesc(cm2[1]);
        }
        let remark = '';
        const em = /__episode">([^<]*)</.exec(chunk) || /__score[^>]*>([^<]*)</.exec(chunk);
        if (em) remark = stripTags(em[1]);
        if (!remark) {
            const epm = /data-track-title[\s\S]{0,400}?(更新至\s*\d+\s*集|全\s*\d+\s*集|完结)/.exec(chunk);
            if (epm) remark = epm[1];
        }
        const tags = [];
        const tre = /\/tag\/[^"]*">([^<]+)</g;
        let tm;
        while ((tm = tre.exec(chunk)) && tags.length < 3) tags.push(stripTags(tm[1]));
        if (tags.length) remark += (remark ? '·' : '') + tags.join('·');
        out.push({
            vod_id: String(h.id),
            vod_name: stripTags(h.title) || String(h.id),
            vod_pic: fixCover(cover),
            vod_remarks: remark,
            vod_year: ''
        });
    }
    return out;
}

// 分页：优先 data-pages，其次数 pager 链接
function pageCount(html) {
    const m = /data-pages="(\d+)"/.exec(html);
    if (m) return Number(m[1]) || 1;
    let max = 1;
    const re = /class="hg-pager__page"[^>]*href="[^"]*?\/(\d+)\/?"/g;
    let x;
    while ((x = re.exec(html))) {
        const n = Number(x[1]);
        if (n > max) max = n;
    }
    return max;
}

// 播放/详情页内嵌 JSON
function vidData(html) {
    const m = /<script id="videoInitialData" type="application\/json">([\s\S]*?)<\/script>/.exec(html)
        || /<script id="detailInitialData" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return null; }
}

function maxEp(html) {
    let max = 0;
    const re = /data-ep-id="(\d+)"/g;
    let x;
    while ((x = re.exec(html))) {
        const n = Number(x[1]);
        if (n > max) max = n;
    }
    if (!max) {
        const m = /共\s*(\d+)\s*集/.exec(html);
        if (m) max = Number(m[1]);
    }
    return max;
}

function epName(n) { return '第' + n + '集'; }

// ---------- 列表 ----------

function catPath(slug, page) {
    return '/' + slug + '/' + (page > 1 ? page + '/' : '');
}
function searchPath(q, page) {
    return '/search/video/' + encodeURIComponent(q) + '/' + (page > 1 ? page + '/' : '');
}

function listPage(path) {
    try {
        const html = fetchDoc(path, 'html');
        const list = parseCards(html);
        if (!list.length) return { list: diagItems(true), pages: 1 };
        return { list: list, pages: pageCount(html) };
    } catch (e) {
        return { list: diagItems(true), pages: 1 };
    }
}

// ---------- 诊断 ----------

function shapeName(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v.then === 'function') return 'Promise';
    if (typeof v === 'string') return 'string(' + v.length + ')';
    if (typeof v === 'object') return 'object{' + Object.keys(v).slice(0, 6).join(',') + '}';
    return typeof v;
}

function packDiag(out) {
    const items = [];
    for (let k = 0; k < out.length; k++) {
        items.push({ vod_id: 'diag' + k, vod_name: '🔧' + out[k], vod_pic: '', vod_remarks: '诊断' });
    }
    // v8：data URI 能否被图片加载器渲染（1x1 GIF，最小体积）
    items.push({
        vod_id: 'diagimg', vod_name: '🔧测图-dataURI',
        vod_pic: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        vod_remarks: '有绿点=支持'
    });
    return items;
}

function diagItems(fast) {
    const out = [];
    out.push('绑定=' + (BINDING_OK || '未锁') + ' 通道=' + (PROXY_OFF ? '直连(off)' : (TRANSPORT_OK || '未定')));
    out.push('域名=' + BASE.replace(/^https?:\/\//, '') + (HOST_OK ? '' : '(默认)'));
    if (LAST_ERR) out.push('上次错误: ' + LAST_ERR.slice(0, 70));
    if (fast) {
        out.push('列表请求失败 → 点开 🔧诊断 分类再看通路');
        return packDiag(out);
    }
    // 一发探活：抓 /duanju/ 数卡片
    const chan = PROXY_OFF ? 'direct' : (TRANSPORT_OK || 'direct');
    try {
        const html = fetchDoc('/duanju/', 'html');
        const n = pickCards(html).length;
        out.push((n ? '[通] ' : '[异] ') + chan + ' 卡片=' + n + ' 长度=' + html.length);
        if (n) out.push('站点活着，抓取层正常');
    } catch (e) {
        out.push('[败] ' + chan + ' :' + String(e && e.message || e).slice(0, 45));
        out.push('直连与代理都没拿到页面 → 站点侧/网络侧阻断');
        out.push('换网络(关WiFi走流量)或等站点恢复');
    }
    if (out.length < 6) out.push('线路池: ' + HOSTS.map(function (h) { return h.replace(/^https?:\/\//, ''); }).join(' '));
    // ---- v8 探测：宿主能否拿到图片原始字节（决定封面 AES 路线生死）----
    try { imgProbe(out); } catch (e) { out.push('探测异常:' + String(e && e.message || e).slice(0, 40)); }
    return packDiag(out);
}

// 宿主能力枚举 + 图片字节是否被 UTF-8 破坏。只读，不碰抓取/播放路径。
function imgProbe(out) {
    const caps = ['btoa', 'atob', 'Uint8Array', 'ArrayBuffer', 'Buffer', 'crypto', 'TextDecoder', 'md5', 'base64Decode'];
    const miss = [], hit = [];
    for (let i = 0; i < caps.length; i++) {
        const g = typeof globalThis !== 'undefined' ? globalThis : this;
        (g && g[caps[i]] !== undefined ? hit : miss).push(caps[i]);
    }
    out.push('能力有:' + (hit.join(',') || '无'));
    out.push('能力无:' + miss.join(','));

    // 决定性一发：打一张已知 JPEG，看前 3 字节是不是 FF D8 FF
    const pic = 'https://pic.drleao.cn/upload_01/upload/20260811/2026081110470446036.jpg';
    try {
        ensureBinding();
        const res = request(pic, { headers: { 'User-Agent': UA }, timeout: 6000 });
        let s = typeof res === 'string' ? res
            : ((res && res.content !== undefined ? res.content
                : (res && res.body !== undefined ? res.body
                    : (res && res.data !== undefined ? res.data
                        : (res && res.text !== undefined ? res.text : '')))) || '');
        s = String(s);
        const c0 = s.charCodeAt(0), c1 = s.charCodeAt(1), c2 = s.charCodeAt(2), c3 = s.charCodeAt(3);
        out.push('图长度=' + s.length + ' 首4=' + c0 + ',' + c1 + ',' + c2 + ',' + c3);
        out.push('期望:长246624 首4=101,217,237,139');
        if (s.length === 246624 && c0 === 101 && c1 === 217) out.push('判定:字节原样透传 → 封面AES可行');
        else if (c0 === 65533 || s.length < 246624) out.push('判定:字节被UTF-8破坏 → 封面AES判死');
        else out.push('判定:未知,人工比对上面两行');
    } catch (e) {
        out.push('取图失败:' + String(e && e.message || e).slice(0, 45));
    }
}

// ---------- 菜单 ----------

function classList() {
    const cls = [{ type_id: 'diag', type_name: '🔧诊断' }];
    for (let i = 0; i < CATS.length; i++) {
        cls.push({ type_id: 'c:' + CATS[i].slug, type_name: CATS[i].name });
    }
    for (let i = 0; i < HOT_TAGS.length; i++) {
        cls.push({ type_id: 't:' + HOT_TAGS[i], type_name: HOT_TAGS[i] });
    }
    return cls;
}

function filtersFor(tid) { return {}; }

// ---------- 入口 ----------

function init(ext) {
    try {
        let o = typeof ext === 'string' ? JSON.parse(ext) : (ext || {});
        if (o && o.ext !== undefined && !o.base) {
            o = typeof o.ext === 'string' ? JSON.parse(o.ext) : o.ext;
        }
        if (o && o.base) {
            const b = String(o.base).replace(/\/+$/, '');
            BASE = b;
            if (HOSTS.indexOf(b) < 0) HOSTS.unshift(b);
            HEADERS.Referer = b + '/';
            HOST_OK = '';
        }
        if (o && o.proxy === 'off') PROXY_OFF = true;
    } catch (e) { /* 默认域名 */ }
}

function home(filter) {
    const r = listPage(catPath('duanju', 1));
    const cls = classList();
    const filters = {};
    for (let i = 0; i < cls.length; i++) filters[cls[i].type_id] = {};
    return JSON.stringify({ class: cls, list: r.list, filters: filters });
}

function homeVod() {
    const r = listPage(catPath('duanju', 1));
    return JSON.stringify({ list: r.list });
}

function category(tid, pg, filter, extend) {
    const page = Number(pg || 1) || 1;
    const t = String(tid || '');
    if (t === 'diag') {
        const items = diagItems();
        return JSON.stringify({ page: 1, pagecount: 1, limit: items.length, total: items.length, list: items });
    }
    let path = '';
    if (t.indexOf('c:') === 0) {
        path = catPath(t.slice(2), page);
    } else if (t.indexOf('t:') === 0) {
        path = searchPath(t.slice(2), page);
    } else if (/^[a-z-]+$/.test(t)) {
        path = catPath(t, page);
    } else {
        path = searchPath(t, page);
    }
    const r = listPage(path);
    return JSON.stringify({
        page: page,
        pagecount: r.pages,
        limit: r.list.length || 20,
        total: r.pages * (r.list.length || 20),
        list: r.list
    });
}

function detail(id) {
    const sid = String(id || '');
    if (/^diag\d+$/.test(sid)) {
        return JSON.stringify({
            list: [{
                vod_id: sid, vod_name: '🔧诊断条目', vod_pic: '',
                vod_content: '诊断结果就在列表那一行里，不用点开。返回上一页再进分类＝重新探测一次。',
                vod_play_from: '', vod_play_url: ''
            }]
        });
    }
    if (sid.indexOf('-') > 0) return detailVid(sid.split('-')[0]);
    return detailVid(sid);
}

function detailVid(vid) {
    let html = '', d = null;
    try {
        html = fetchDoc('/video/' + encodeURIComponent(vid) + '/', 'html');
        d = vidData(html);
    } catch (e) { d = null; }
    if (!d) {
        return JSON.stringify({
            list: [{ vod_id: vid, vod_name: vid, vod_pic: '', vod_content: '', vod_play_from: '', vod_play_url: '' }]
        });
    }
    const total = maxEp(html) || 1;
    const parts = [];
    for (let n = 1; n <= total && n <= 800; n++) parts.push(epName(n) + '$' + vid + '-' + n);
    const tags = Array.isArray(d.tags) ? d.tags.map(stripTags).filter(Boolean) : [];
    let remark = tags.slice(0, 3).join('·');
    if (total > 0) remark += (remark ? '·' : '') + '共' + total + '集';
    return JSON.stringify({
        list: [{
            vod_id: String(d.id || vid),
            vod_name: stripTags(d.title) || vid,
            vod_pic: fixCover(d.coverSrc || d.posterSrc || ''),
            vod_remarks: remark,
            vod_year: /^\d{4}/.test(String(d.time || '')) ? String(d.time).slice(0, 4) : '',
            vod_area: (Array.isArray(d.breadcrumb) && d.breadcrumb[0] && d.breadcrumb[0].name) ? stripTags(d.breadcrumb[0].name) : '短剧',
            vod_actor: stripTags(d.author || ''),
            vod_director: '',
            vod_class: tags.join(','),
            vod_content: stripTags(d.description || ''),
            vod_play_from: 'huangguo',
            vod_play_url: parts.join('#')
        }]
    });
}

function search(key, quick, pg) {
    const k = String(key || '').trim();
    const page = Number(pg || 1) || 1;
    if (!k) return JSON.stringify({ list: [], page: 1, pagecount: 1, limit: 0, total: 0 });
    const r = listPage(searchPath(k, page));
    return JSON.stringify({
        page: page,
        pagecount: r.pages,
        limit: r.list.length || 0,
        total: r.pages * (r.list.length || 0),
        list: r.list
    });
}

// ---------- 播放 ----------

function play(flag, id, vipFlags) {
    const s = String(id || '');
    if (/^https?:\/\//.test(s)) {
        return JSON.stringify({ parse: 0, jx: 0, url: s, header: HEADERS });
    }
    const dash = s.indexOf('-');
    if (dash < 0) return JSON.stringify({ parse: 0, jx: 0, url: '', header: HEADERS });
    const vid = s.slice(0, dash);
    const ep = s.slice(dash + 1).replace(/[^0-9]/g, '') || '1';
    const paths = [
        '/video/' + encodeURIComponent(vid) + '/' + (ep === '1' ? '' : 'ep-' + ep + '/'),
        '/video/' + encodeURIComponent(vid) + '/'      // 兜底：只拿第1集的内嵌源
    ];
    for (let i = 0; i < paths.length; i++) {
        try {
            const html = fetchDoc(paths[i], 'html');
            const d = vidData(html);
            if (!d) continue;
            const srcs = d.epPlaySrcs || {};
            const url = String(srcs[ep] || srcs[String(Number(ep))] || d.videoSrc || d.previewSrc || '');
            if (!url) continue;
            return JSON.stringify({ parse: 0, jx: 0, url: url, header: HEADERS });
        } catch (e) { /* 换下一条路径 */ }
    }
    return JSON.stringify({ parse: 0, jx: 0, url: '', header: HEADERS });
}

// ---------- 杂项（drpy2 同款，缺了客户端会抛） ----------

function isVideo(url) {
    return /\.(m3u8|mp4|flv|mkv|ts|mov)(\?|$)/i.test(String(url || ''));
}

function sniffer() { return false; }

function action(action) { return JSON.stringify({}); }

function proxy(params) { return JSON.stringify([]); }

function destroy() { }

// ---------- 导出 ----------

export default {
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    detail: detail,
    search: search,
    play: play,
    isVideo: isVideo,
    sniffer: sniffer,
    action: action,
    proxy: proxy,
    destroy: destroy
};
