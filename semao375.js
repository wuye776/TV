// ============================================================
// 影视仓 / TVBox 本地包 · QuickJS spider
// 目标站：www.semao376.xyz（2026-10 换域，旧 375 已 RST）（苹果CMS v10，采集接口关闭，纯 HTML 解析）
//
// api.json:
//   { "type": 3, "api": "./js/semao375.js",
//     "ext": { "base": "https://www.semao375.xyz" } }
//
// 入口约定（影视仓 assets/js/lib/spider.js 胶水层实证）：
//   export default { init, home, homeVod, category, detail, search, play, ... }
//   所有方法返回 **JSON 字符串**（与 drpy2.js 一致，Java 侧 (String) 强转）
// 网络：全局函数 http(url, {headers}) -> { ok, status, content }
// ============================================================

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

let BASE = 'https://www.semao378.xyz';
let HEADERS = { 'User-Agent': UA };

// 站点分类（首页固定 22 项，写死不额外请求，冷启动 0 延迟）
const TYPES = [
    [96, '国产视频'], [97, '网曝黑料'], [103, '真实乱伦'], [135, '直播裸聊'], [106, '国产传媒'],
    [132, '糖心vlog'], [142, '少女萝莉'], [143, '熟女少妇'], [123, '国产自拍'], [139, '群P换妻'],
    [144, '酒店探花'], [141, '偷拍盗摄'], [136, '综合强片'], [140, '醉酒强奸'], [138, '户外野战'],
    [137, '巨乳诱惑'], [131, '明星换脸'], [114, '日韩中字'], [113, '日韩无码'], [133, '无码素人'],
    [130, '无码破解'], [121, '欧美视频']
];

// 标签库。站点本身没有标签接口，分类页也没有筛选条（2026-10-24 逐页实测：
// 首页/分类页/详情页均无筛选区，只有「精品/给力/综合」三个分类组共 22 项）。
// 唯一真实生效的筛选通道是站内搜索，所以标签筛选走 /vod/search/page/N/wd/<词>.html。
const TAG_WORDS = '丝袜 强奸 自拍 偷拍 人妻 母女 学生 空姐 护士 老师 熟女 萝莉 巨乳 中出 口交 内射 ' +
    '无码 中文字幕 探花 酒店 门事件 大学生 眼镜 情侣 洗澡 厕所 车震 迷奸 调教 SM 户外 露出 换脸 网红 ' +
    '主播 反差 白丝 黑丝 旗袍 制服 旗袍 双飞 孕妇 大奶 肥臀 按摩 会所 缅北 吃瓜 黑料 合集';

let TAG_LIST = null;

function tagList() {
    if (TAG_LIST) return TAG_LIST;
    const raw = TAG_WORDS.split(' ');
    const seen = {};
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const w = String(raw[i] || '').trim();
        if (!w || seen[w]) continue;
        seen[w] = 1;
        out.push(w);
    }
    TAG_LIST = out;
    return out;
}

function init(ext) {
    if (!ext) return;
    let o = ext;
    if (typeof ext === 'string') {
        try { o = JSON.parse(ext); } catch (e) { return; }
    }
    // 客户端可能包一层 { stype, skey, ext }
    if (o && o.ext !== undefined && !o.base) {
        o = o.ext;
        if (typeof o === 'string') {
            try { o = JSON.parse(o); } catch (e) { return; }
        }
    }
    if (o && o.base) BASE = String(o.base).replace(/\/+$/, '');
    if (o && o.headers && typeof o.headers === 'object') {
        HEADERS = Object.assign({ 'User-Agent': UA }, o.headers);
    }
}

// ---------- 网络（全局 http / req 双通道） ----------

// 关键：必须走同步通道（async:false）。
// http.js 里 http(url,opts) 默认返回 Promise，而 QuickJS 宿主不 pump 微任务，
// Promise 永不 resolve -> 首页 list 恒为空（class 是写死的所以能显示）。
function request(url, options) {
    const o = Object.assign({ async: false }, options || {});
    o.async = false;
    if (typeof http === 'function') return http(url, o);
    if (typeof req === 'function') return req(url, o);
    if (typeof net !== 'undefined' && net && typeof net.http === 'function') return net.http(url, o);
    throw new Error('no http binding');
}

// ---------- 域名轮换 ----------
// 源站日抛域名，数字往上走（375 -> 376 -> 377...）。当前域名挂了就顺着探。
let HOSTS = null;
let HOST_OK = '';

function hostList() {
    if (HOSTS) return HOSTS;
    const cur = BASE.replace(/^https?:\/\//, '');
    const m = cur.match(/semao(\d+)/);
    const list = [BASE];
    if (m) {
        const n = parseInt(m[1], 10);
        // 近邻优先：先 ±1，再 ±2，再外围。
        // 实测 2026-10-22：374 活、375/376/377 全死、378 活。
        // 日抛域名常常连号死一片，所以步长给到 6，别只探紧邻。
        const nums = [n + 1, n - 1, n + 2, n + 3, n + 4, n + 5, n + 6, n - 2];
        const seen = { };
        seen[n] = 1;
        for (let i = 0; i < nums.length; i++) {
            if (nums[i] < 300 || seen[nums[i]]) continue;
            seen[nums[i]] = 1;
            list.push('https://www.semao' + nums[i] + '.xyz');
        }
    }
    HOSTS = list;
    return list;
}

// 探活：首页 200 且 title 含「色猫」
function probe(host) {
    try {
        const res = request(host + '/', { headers: HEADERS });
        if (!res || res.ok === false) return false;
        const c = String(res.content || '');
        if (c.length < 5000) return false;
        return /色猫/.test(c) || /content-item/.test(c);
    } catch (e) { return false; }
}

function fetchOnce(path, host) {
    const url = /^https?:\/\//.test(path) ? path : host + path;
    let lastErr = null;
    // 单次，不重试：A 记录同域名轮询同一批 IP，重试收益低；
    // 而死域名重试 2 次会让首屏从 14 次连接涨到 28 次，电视端必超时。
    for (let i = 0; i < 1; i++) {
        try {
            const res = request(url, { headers: HEADERS });
            if (!res || res.ok === false) throw new Error('http ' + (res && res.status));
            const c = res.content;
            const txt = typeof c === 'string' ? c : String(c || '');
            if (!txt) throw new Error('empty body');
            return txt;
        } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('fetch failed');
}

function fetchText(path) {
    // 绝对 URL 直接用，不参与轮换
    if (/^https?:\/\//.test(path)) return fetchOnce(path, '');

    const useHost = HOST_OK || BASE;
    try {
        const t = fetchOnce(path, useHost);
        HOST_OK = useHost;
        return t;
    } catch (e) {
        // 当前域名死了 -> 依次探候选
        const list = hostList();
        for (let i = 0; i < list.length; i++) {
            const h = list[i];
            if (h === useHost) continue;
            if (probe(h)) {
                HOST_OK = h;
                BASE = h;
                try { return fetchOnce(path, h); } catch (e2) { /* 继续 */ }
            }
        }
        throw e;
    }
}

// ---------- 工具 ----------

function cp(n) {
    if (!n || n < 0 || n > 0x10FFFF) return '';
    if (n <= 0xFFFF) return String.fromCharCode(n);
    n -= 0x10000;
    return String.fromCharCode(0xD800 + (n >> 10), 0xDC00 + (n & 0x3FF));
}

function unent(s) {
    return String(s || '')
        .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return cp(parseInt(h, 16)); })
        .replace(/&#(\d+);/g, function (_, d) { return cp(parseInt(d, 10)); })
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
    return unent(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function safeName(s) {
    return String(s || '').replace(/\$/g, '＄').replace(/#/g, '＃').trim();
}

function abs(u) {
    const s = String(u || '');
    if (!s) return '';
    if (/^https?:\/\//.test(s)) return s.replace(/\\\//g, '/');
    if (s.indexOf('//') === 0) return 'https:' + s;
    return BASE + (s.charAt(0) === '/' ? s : '/' + s);
}

// ---------- 列表解析 ----------

const ITEM_RE = /<li class="content-item[^"]*">([\s\S]*?)<\/li>/g;
const ITEM_ID_RE = /\/vod\/detail\/id\/(\d+)\.html/;
const ITEM_TITLE_RE = /<h5[^>]*class="[^"]*video-title[^"]*"[^>]*>([\s\S]*?)<\/h5>/;
const ITEM_PIC_RE = /background-image:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/;
const ITEM_NOTE_RE = /<span class="[^"]*note[^"]*"[^>]*>([\s\S]*?)<\/span>/;

function parseList(html) {
    const items = [];
    const seen = {};
    let m;
    ITEM_RE.lastIndex = 0;
    while ((m = ITEM_RE.exec(html))) {
        const block = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        const idm = block.match(ITEM_ID_RE);
        if (!idm) continue;
        const id = idm[1];
        if (seen[id]) continue;
        seen[id] = 1;
        const tm = block.match(ITEM_TITLE_RE);
        const pm = block.match(ITEM_PIC_RE);
        const nm = block.match(ITEM_NOTE_RE);
        const name = tm ? stripTags(tm[1]) : '';
        if (!name) continue;
        const note = nm ? stripTags(nm[1]) : '';
        items.push({
            vod_id: id,
            vod_name: name,
            vod_pic: pm ? abs(pm[1]) : '',
            vod_remarks: note,
            vod_year: /^\d{4}/.test(note) ? note.slice(0, 4) : ''
        });
    }
    return items;
}

function parseMaxPage(html) {
    let max = 1;
    // 搜索页的分页链接形如 /index.php/vod/search/page/2/wd/xxx.html（带 index.php 前缀和 wd 段），
    // 分类页是 /vod/type/id/96/page/2.html，所以路径中间不限定，只看 page/N。
    const re = /\/vod\/(?:type|search)\/[^"'<>]*?page\/(\d+)\/?[^"]*?\.html/g;
    let m;
    while ((m = re.exec(html))) {
        const n = Number(m[1]);
        if (n > max) max = n;
    }
    return max;
}

// ---------- 播放页解析 ----------

function parseTitle(html) {
    const m = html.match(/<title>([\s\S]*?)<\/title>/);
    if (!m) return '';
    let t = unent(stripTags(m[1]));
    const g = t.match(/《([^》]+)》/);
    if (g) return g[1].trim();
    t = t.replace(/^在线观看\s*/, '');
    const u = t.indexOf('_');
    if (u > 0) t = t.slice(0, u);
    t = t.replace(/\s*[-–—|｜]\s*色猫[^-–—|｜]*$/, '');
    t = t.replace(/\s+[-–—|｜]\s+[^-–—|｜]{1,16}$/, '');
    return t.trim();
}

function parsePlay(html) {
    const i = html.indexOf('player_aaaa=');
    if (i < 0) return null;
    const end = html.indexOf('</script>', i);
    let raw = html.slice(i + 'player_aaaa='.length, end < 0 ? undefined : end).trim();
    raw = raw.replace(/;\s*$/, '').trim();
    let j;
    try { j = JSON.parse(raw); } catch (e) { return null; }
    return {
        url: j.url ? String(j.url).replace(/\\\//g, '/') : '',
        from: j.from || 'semao',
        note: unent(j.note || ''),
        flag: j.flag || ''
    };
}

function classList() {
    const out = TYPES.map(function (t) {
        return { type_id: String(t[0]), type_name: t[1] };
    });
    out.push({ type_id: 'tag', type_name: '标签合集' });
    return out;
}

// 每个 type_id 都必须挂同一份筛选，漏一个客户端在该分类点筛选就崩（硬规范第 6 条）
function buildFilters() {
    const vals = [{ n: '全部', v: '' }];
    const words = tagList();
    for (let i = 0; i < words.length; i++) vals.push({ n: words[i], v: words[i] });
    const one = [{ key: 'tag', name: '标签', value: vals }];
    const out = {};
    out['tag'] = one;
    for (let i = 0; i < TYPES.length; i++) out[String(TYPES[i][0])] = one;
    return out;
}

// ---------- 首页 ----------

function home(filter) {
    let list = [];
    try {
        const html = fetchText('/index.php/vod/type/id/96.html');
        list = parseList(html);
    } catch (e) { list = []; }
    const out = { class: classList(), list: list, filters: buildFilters() };
    return JSON.stringify(out);
}

function homeVod() {
    try {
        const html = fetchText('/index.php/vod/type/id/96.html');
        return JSON.stringify({ list: parseList(html) });
    } catch (e) { return JSON.stringify({ list: [] }); }
}

// ---------- 分类 ----------

function category(tid, pg, filter, extend) {
    const page = Number(pg || 1) || 1;
    const t = String(tid === undefined || tid === null ? '' : tid).trim();

    // 标签筛选走站内搜索（站点无标签接口，见 TAG_WORDS 上方说明）。
    // 「标签合集」tab 未选标签时取第一个词，避免空白页。
    const tag = tagOf(extend, t);
    if (tag) {
        const path = page <= 1
            ? '/index.php/vod/search/wd/' + encodeURIComponent(tag) + '.html'
            : '/index.php/vod/search/page/' + page + '/wd/' + encodeURIComponent(tag) + '.html';
        let shtml = '';
        try { shtml = fetchText(path); } catch (e) { shtml = ''; }
        const slist = shtml ? parseList(shtml) : [];
        const spc = shtml ? parseMaxPage(shtml) : 1;
        return JSON.stringify({
            page: page,
            pagecount: spc,
            limit: slist.length || 24,
            total: spc * (slist.length || 24),
            list: slist
        });
    }

    const path = page <= 1
        ? '/index.php/vod/type/id/' + t + '.html'
        : '/index.php/vod/type/id/' + t + '/page/' + page + '.html';
    let html = '';
    try { html = fetchText(path); } catch (e) { html = ''; }
    const list = html ? parseList(html) : [];
    const pagecount = html ? parseMaxPage(html) : 1;
    return JSON.stringify({
        page: page,
        pagecount: pagecount,
        limit: list.length || 24,
        total: pagecount * (list.length || 24),
        list: list
    });
}

function tagOf(extend, tid) {
    let e = extend;
    if (typeof e === 'string') {
        try { e = JSON.parse(e); } catch (err) { e = null; }
    }
    let w = e && e.tag ? String(e.tag).trim() : '';
    if (!w && tid === 'tag') w = tagList()[0] || '';
    return w;
}

// ---------- 详情 ----------

function detail(id) {
    const sid = String(id || '');
    let html = '';
    try { html = fetchText('/index.php/vod/play/id/' + sid + '/sid/1/nid/1.html'); } catch (e) { html = ''; }
    const p = html ? parsePlay(html) : null;
    const name = html ? parseTitle(html) : '';
    if (!p || !p.url) {
        return JSON.stringify({
            list: [{
                vod_id: sid, vod_name: name || sid, vod_pic: '',
                vod_content: name, vod_play_from: '', vod_play_url: ''
            }]
        });
    }
    return JSON.stringify({
        list: [{
            vod_id: sid,
            vod_name: name || sid,
            vod_pic: '',
            vod_remarks: p.note,
            vod_content: name,
            vod_play_from: safeName(p.from),
            vod_play_url: '第1集$' + p.url
        }]
    });
}

// ---------- 搜索 ----------

function search(key, quick, pg) {
    const k = String(key || '').trim();
    if (!k) return JSON.stringify({ list: [], page: 1, pagecount: 1, limit: 0, total: 0 });
    let body = '';
    try {
        body = fetchText('/index.php/ajax/suggest?mid=1&wd=' + encodeURIComponent(k) + '&limit=30');
    } catch (e) { body = ''; }
    let arr = [];
    if (body) {
        try { arr = (JSON.parse(body) || {}).list || []; } catch (e) { arr = []; }
    }
    const list = arr.map(function (x) {
        return {
            vod_id: String(x.id),
            vod_name: String(x.name || ''),
            vod_pic: abs(x.pic || ''),
            vod_remarks: ''
        };
    });
    return JSON.stringify({
        list: list, page: 1, pagecount: 1,
        limit: list.length, total: list.length
    });
}

// ---------- 播放 ----------

function play(flag, id, vipFlags) {
    const s = String(id || '');
    if (/^https?:\/\//.test(s)) {
        return JSON.stringify({ parse: 0, jx: 0, url: s, header: HEADERS });
    }
    let d;
    try { d = JSON.parse(detail(s)); } catch (e) { d = { list: [] }; }
    const v = (d.list || [])[0];
    if (!v || !v.vod_play_url) {
        return JSON.stringify({ parse: 0, jx: 0, url: '' });
    }
    const seg = String(v.vod_play_url).split('#')[0] || '';
    const idx = seg.indexOf('$');
    const real = idx >= 0 ? seg.slice(idx + 1) : seg;
    return JSON.stringify({ parse: 0, jx: 0, url: real, header: HEADERS });
}

// ---------- 杂项（drpy2 同款，缺了客户端会抛） ----------

function isVideo(url) {
    return /\.(m3u8|mp4|flv|mkv|ts|mov)(\?|$)/i.test(String(url || ''));
}

function sniffer() { return false; }

function action(action) { return JSON.stringify({}); }

function proxy(params) { return JSON.stringify([]); }

function destroy() { }

// ---------- 导出（影视仓 spider.js 胶水：spider.default 为对象或函数） ----------

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
