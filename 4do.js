// ============================================================
// 影视仓 / TVBox · QuickJS spider —— 4do（vvmmyjs 通道）v6
// API：xn6.xn6oce.com:25118 · Web：4do.4do9dm.com:51888
//
// 形态：type:3，api 填本文件 URL，零服务器
//   { "key":"4do","name":"4do","type":3,"api":".../4do.js" }
//
// v6（2026-10-22 性能修复）：
//   1. 直播模块整体下线 —— 上游 PSCH 保护，master 每个 variant 都 302 到
//      /hls/cpa/v2/stream.m3u8 的 CPA 广告垫片，取不到真流，留着只是白等。
//   2. 删「探花」分类（360）—— 上游 total=0，永远空列表。
//   3. 筛选项懒加载 —— home() 不再拉 496 个标签（label/list 31KB）和
//      41 国直播列表（要先登录），首屏请求从 4 个砍到 1 个。
//   4. 全量标签只在真进「标签合集」时才拉。
//
// v3 能力保留：
//   视频线筛选：时长（videoType=short|long）+ 排序（order=point）
//   —— 服务端白名单很窄：order 仅 point 生效；year / area 实测被忽略。
//   分类 17 个 + 标签 496 个（懒加载）+ 标签合集 1 个
//
// 加密壳：{code,data(b64url),key} = b64url + key 循环 XOR → UTF-8 → JSON
// 封面：视频 thumb 是 .jpg.enc（AES-256-CBC 密文），QuickJS 无 AES，故留空
// ============================================================

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const API = 'https://xn6.xn6oce.com:25118';
const API2 = 'https://apissss.xn--d9u11dw2l41at78afwi.xn--fiqs8s';
const WEB = 'https://4do.4do9dm.com:51888';
const CHANNEL = 'vvmmyjs';
const LIMIT = 24;

// ---------------- token（指纹匿名登录，TTL≈1860s，内存缓存自续） ----------------
let TK = '';
let TK_EXP = 0;

function randHex(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    return s;
}

// ---------------- 加密壳解密：b64url → key 循环 XOR → UTF-8 → JSON ----------------
function b64uBytes(s) {
    const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    s = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const out = [];
    let buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
        const c = T.indexOf(s.charAt(i));
        if (c < 0) continue;
        buf = (buf << 6) | c;
        bits += 6;
        if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xFF); }
    }
    return out;
}

function utf8Decode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
        else if (b < 0xE0) { out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F)); i += 2; }
        else if (b < 0xF0) { out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F)); i += 3; }
        else {
            let cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F);
            cp -= 0x10000;
            out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
            i += 4;
        }
    }
    return out;
}

// 解密壳：{code,data(b64url),key} → 解出内层对象；非壳/失败返回 null
function dec2(raw) {
    let env;
    try { env = JSON.parse(raw); } catch (e) { return null; }
    if (!env || typeof env !== 'object') return null;
    if (typeof env.data === 'string' && typeof env.key === 'string' && env.key) {
        if (env.code !== 200) return null;
        const bytes = b64uBytes(env.data);
        const k = env.key;
        const plain = bytes.map(function (b, i) { return b ^ k.charCodeAt(i % k.length); });
        const s = utf8Decode(plain);
        try { return JSON.parse(s.replace(/^\s+|\s+$/g, '')); } catch (e) { return s; }
    }
    if (env.code === 200 || env.code === 0) return env.data;
    return null;
}

// ---------------- 网络：强制同步 ----------------
function request(url, options) {
    const o = Object.assign({ async: false }, options || {});
    o.async = false;
    if (typeof http === 'function') return http(url, o);
    if (typeof req === 'function') return req(url, o);
    if (typeof net !== 'undefined' && net && typeof net.http === 'function') return net.http(url, o);
    throw new Error('no http binding');
}

function bodyOf(r) {
    if (!r) return '';
    if (typeof r === 'string') return r;
    return r.content || r.body || r.data || '';
}

// api(method, path, bodyObj, needAuth) → 解密后的业务对象；失败返回 null
// 主 API 挂了才切备用域名。备用域只扛「不带鉴权」的请求，
// 带鉴权的请求不重放——重放会再触发一次 fingerprint 登录，
// 首屏就会打出 6 个请求（实测 23.7s），这是旧版最大性能坑。
function api(method, path, bodyObj, needAuth) {
    const out = api1(API, method, path, bodyObj, needAuth);
    if (out) return out;
    if (needAuth) return null;
    return api1(API2, method, path, bodyObj, needAuth);
}

function api1(host, method, path, bodyObj, needAuth) {
    const h = {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Origin': WEB,
        'Referer': WEB + '/'
    };
    let body = '';
    if (bodyObj) {
        h['Content-Type'] = 'application/json';
        body = JSON.stringify(bodyObj);
    }
    if (needAuth) {
        const tk = getTok();
        if (!tk) return null;
        h['Authorization'] = 'Bearer ' + tk;
    }
    let raw = '';
    try { raw = bodyOf(request(host + path, { method: method, headers: h, body: body })); } catch (e) { return null; }
    if (!raw) return null;
    const out = dec2(raw);
    if (out) return out;
    // token 失效重登一次
    if (needAuth) {
        TK = ''; TK_EXP = 0;
        const tk = getTok();
        if (!tk) return null;
        h['Authorization'] = 'Bearer ' + tk;
        try { raw = bodyOf(request(host + path, { method: method, headers: h, body: body })); } catch (e) { return null; }
        return dec2(raw);
    }
    return null;
}

function getTok() {
    if (TK && Date.now() < TK_EXP) return TK;
    const fp = randHex(32);
    let raw = '';
    try {
        raw = bodyOf(request(API + '/api-user/v2/login/fingerprint', {
            method: 'POST',
            headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Content-Type': 'application/json', 'Origin': WEB, 'Referer': WEB + '/' },
            body: JSON.stringify({ channel: CHANNEL, fingerPrint: fp })
        }));
    } catch (e) { }
    let d = raw ? dec2(raw) : null;
    if (!d || !d.accessToken) {
        try {
            raw = bodyOf(request(API2 + '/api-user/v2/login/fingerprint', {
                method: 'POST',
                headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Content-Type': 'application/json', 'Origin': WEB, 'Referer': WEB + '/' },
                body: JSON.stringify({ channel: CHANNEL, fingerPrint: fp })
            }));
            d = raw ? dec2(raw) : null;
        } catch (e) { }
    }
    if (d && d.accessToken) {
        TK = d.accessToken;
        const ttl = Number(d.accessTokenTtl) > 0 ? Number(d.accessTokenTtl) : 1800;
        TK_EXP = Date.now() + (ttl - 120) * 1000;
        return TK;
    }
    return '';
}

// ---------------- 分类：cate/list 18 个全量（含 新闻/其他） ----------------
const CATS = [
    ["358", "麻豆"], ["357", "新闻"], ["356", "擦边短剧"],
    ["269", "其他"], ["346", "VR"], ["345", "女主播"], ["344", "AV中字"],
    ["343", "AV无码"], ["342", "AI换脸"], ["341", "三级"], ["267", "动漫"],
    ["264", "欧美"], ["266", "传媒"], ["263", "日本AV"], ["347", "黑料"],
    ["262", "国产"], ["268", "热门"]
];

// 标签兜底：label/list 拉不到时用（id 均验证过存在）
const TAG_FALLBACK = [
    ["261", "多人运动"], ["262", "熟女"], ["263", "内衣"], ["287", "偶像艺人"],
    ["288", "恋物癖"], ["290", "情侣"], ["291", "跳舞"], ["293", "偷窥"],
    ["295", "性奴"], ["297", "姐妹"], ["298", "通奸"], ["299", "粗暴"],
    ["302", "妄想"], ["305", "美容院"], ["308", "处男"], ["309", "蛮横娇羞"],
    ["313", "温泉"], ["318", "家教"], ["319", "母亲"], ["321", "赛车女郎"]
];

let LB_CACHE = null; // 标签缓存 [[id,title]]
let HOME_CACHE = null; // home/index 缓存（home 与 homeVod 共用，省一次 5s 请求）
let HOME_EXP = 0;

function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/^\s+|\s+$/g, ''); }

function firstTitle(s) {
    const a = String(s || '').split(',');
    return a.length ? a[0] : '';
}

function mapItem(it) {
    if (!it) return null;
    return {
        vod_id: String(it.id),
        vod_name: String(it.title || '').replace(/^\s+|\s+$/g, ''),
        vod_pic: '',
        vod_remarks: firstTitle(it.labelTitles) || firstTitle(it.classifyTitles) || String(it.point || '')
    };
}

// 视频列表公共查询串拼装（只拼实测生效的参数）
function videoQuery(tid, ext) {
    let type = 'cate';
    let typeId = tid;
    if (tid === 'all') { type = 'last'; typeId = ''; }
    else if (tid === 'tag') { type = 'label'; typeId = (ext && ext.label) ? ext.label : ''; }
    let q = 'channel=' + CHANNEL + '&type=' + type;
    if (typeId) q += '&typeId=' + encodeURIComponent(String(typeId));
    if (ext && ext.videoType === 'short') q += '&videoType=short';
    if (ext && ext.videoType === 'long') q += '&videoType=long';
    if (ext && ext.order === 'point') q += '&order=point';
    return q;
}

function videoList(tid, ext, page) {
    const d = api('GET', '/api/v2/home/public/video/list?' + videoQuery(tid, ext) + '&page=' + page + '&limit=' + LIMIT, null, false);
    if (!d || !d.list) return { page: page, pagecount: 0, limit: LIMIT, total: 0, list: [] };
    const list = [];
    for (let i = 0; i < d.list.length; i++) { const v = mapItem(d.list[i]); if (v) list.push(v); }
    const total = parseInt(d.total, 10) || list.length;
    let pc = Math.ceil(total / LIMIT);
    if (pc < 1) pc = 1;
    return { page: page, pagecount: pc, limit: LIMIT, total: total, list: list };
}

// 标签全量：只在真进「标签合集」且需要更多标签时才拉，首屏不碰。
function getLabels() {
    if (LB_CACHE) return LB_CACHE;
    const d = api('GET', '/api/v2/home/public/video/label/list?channel=' + CHANNEL, null, false);
    const out = [];
    if (d && d.list) {
        for (let i = 0; i < d.list.length; i++) {
            const it = d.list[i];
            if (it && it.id && it.title) out.push([String(it.id), String(it.title)]);
        }
    }
    if (out.length) { LB_CACHE = out; return out; }
    return TAG_FALLBACK;
}

// ---------------- 对外方法 ----------------
function init(ext) { }

// 视频类目共用筛选项：时长 / 排序 / 标签
// 标签走懒加载策略：首屏只给内置 20 个，真进「标签合集」才去拉全量 496 个。
// 这样 home() 少打一次 31KB 的 label/list（实测 0.4~5.8s 波动），首屏快 5 秒以上。
function videoFilters() {
    const labels = TAG_FALLBACK;
    const lv = [{ n: '全部', v: '' }];
    for (let i = 0; i < labels.length; i++) lv.push({ n: labels[i][1], v: labels[i][0] });
    return [
        { key: 'videoType', name: '时长', value: [{ n: '全部', v: '' }, { n: '短视频', v: 'short' }, { n: '长视频', v: 'long' }] },
        { key: 'order', name: '排序', value: [{ n: '最新', v: '' }, { n: '高分', v: 'point' }] },
        { key: 'label', name: '标签', value: lv }
    ];
}

function home(filter) {
    const cls = [{ type_id: 'all', type_name: '最新' }];
    for (let i = 0; i < CATS.length; i++) cls.push({ type_id: CATS[i][0], type_name: CATS[i][1] });
    cls.push({ type_id: 'tag', type_name: '标签合集' });
    const vf = videoFilters();
    const filters = {};
    filters['all'] = vf;
    for (let i = 0; i < CATS.length; i++) filters[CATS[i][0]] = vf;
    filters['tag'] = [{ key: 'label', name: '标签', value: vf[2].value }];
    const list = [];
    const d = homeIndex();
    const secs = d && d.list;
    if (secs && secs.length && secs[0].list) {
        for (let i = 0; i < secs[0].list.length; i++) { const v = mapItem(secs[0].list[i]); if (v) list.push(v); }
    }
    if (!list.length) {
        const h = videoList('all', null, 1);
        return JSON.stringify({ class: cls, filters: filters, list: h.list });
    }
    return JSON.stringify({ class: cls, filters: filters, list: list });
}

// home/index 板块数据：home 与 homeVod 共用同一份，缓存 5 分钟。
// 这个接口实测 0.6~10.6s 波动，是首屏最大不确定源，绝不打第二次。
function homeIndex() {
    if (HOME_CACHE && Date.now() < HOME_EXP) return HOME_CACHE;
    const d = api('GET', '/api/v2/home/public/video/home/index?channel=' + CHANNEL, null, false);
    if (d && d.list) {
        HOME_CACHE = d;
        HOME_EXP = Date.now() + 300000;
        return d;
    }
    return HOME_CACHE || null;
}

function homeVod() {
    const list = [];
    const d = homeIndex();
    const secs = d && d.list;
    if (secs) {
        for (let s = 0; s < secs.length; s++) {
            const blk = secs[s].list || [];
            for (let i = 0; i < blk.length; i++) { const v = mapItem(blk[i]); if (v) list.push(v); }
        }
    }
    if (!list.length) return JSON.stringify({ list: videoList('all', null, 1).list });
    return JSON.stringify({ list: list });
}

function parseExt(extend) {
    if (!extend) return {};
    if (typeof extend === 'object') return extend;
    try { return JSON.parse(extend) || {}; } catch (e) { return {}; }
}

function category(tid, pg, filter, extend) {
    let page = parseInt(pg, 10);
    if (!page || page < 1) page = 1;
    const t = String(tid);
    const ext = parseExt(extend);
    // 标签合集：extend.label = 标签 id；未选时拉全量标签表取第一个
    if (t === 'tag' && !ext.label) ext.label = getLabels()[0][0];
    return JSON.stringify(videoList(t, ext, page));
}

function detail(id) {
    const vid = String(id || '');
    const d = api('GET', '/api/v2/home/public/video/long/detail?id=' + encodeURIComponent(vid) + '&channel=' + CHANNEL, null, false);
    if (!d || !d.id) return JSON.stringify({ list: [] });
    const tags = String(d.classifyTitles || '').split(',').filter(function (x) { return x; });
    let content = '';
    const plain = stripTags(d.content || '');
    if (plain) content += plain + '\n';
    if (tags.length) content += '标签：' + tags.join(' / ') + '\n';
    if (d.actor) content += '演员：' + d.actor + '\n';
    if (d.point) content += '评分：' + d.point + '\n';
    if (d.createdAt) content += '时间：' + String(d.createdAt).substring(0, 10) + '\n';
    const v = {
        vod_id: String(d.id),
        vod_name: String(d.title || '').replace(/^\s+|\s+$/g, ''),
        vod_pic: '',
        vod_content: content,
        vod_remarks: firstTitle(d.labelTitles) || '',
        vod_year: String(d.createdAt || '').substring(0, 4),
        vod_area: '',
        vod_actor: String(d.actor || ''),
        vod_director: '',
        vod_play_from: '4do',
        vod_play_url: 'HD$' + String(d.id)
    };
    return JSON.stringify({ list: [v] });
}

function search(key, quick, pg) {
    let page = parseInt(pg, 10);
    if (!page || page < 1) page = 1;
    const d = api('GET', '/api/v2/home/public/video/search?channel=' + CHANNEL + '&keyword=' + encodeURIComponent(String(key || '')) + '&page=' + page + '&limit=' + LIMIT, null, false);
    if (!d || !d.list) return JSON.stringify({ page: page, pagecount: 0, limit: LIMIT, total: 0, list: [] });
    const list = [];
    for (let i = 0; i < d.list.length; i++) { const v = mapItem(d.list[i]); if (v) list.push(v); }
    const total = parseInt(d.total, 10) || list.length;
    let pc = Math.ceil(total / LIMIT);
    if (pc < 1) pc = 1;
    return JSON.stringify({ page: page, pagecount: pc, limit: LIMIT, total: total, list: list });
}

function play(flag, id, vipFlags) {
    const vid = String(id || '');
    const d = api('GET', '/api/v2/home/user/video/play/url?id=' + encodeURIComponent(vid) + '&channel=' + CHANNEL, null, true);
    const hdr2 = JSON.stringify({ 'User-Agent': UA, 'Referer': WEB + '/', 'Origin': WEB });
    if (!d || !d.masterUrl) return JSON.stringify({ parse: 0, playUrl: '', url: '', header: hdr2 });
    let u = String(d.masterUrl);
    if (u.charAt(0) === '/') u = API + u;
    return JSON.stringify({ parse: 0, playUrl: '', url: u, header: hdr2 });
}

function isVideo(url) { return /\.m3u8|\.mp4|\.ts(\?|$)/i.test(String(url || '')); }
function sniffer() { return false; }
function action(a) { return JSON.stringify({}); }
function proxy(params) { return JSON.stringify([]); }
function destroy() { }

export default {
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    detail: detail,
    search: search,
    play: play,
    isVideoFormat: isVideo,
    manualVideoCheck: sniffer,
    action: action,
    proxy: proxy,
    destroy: destroy
};
