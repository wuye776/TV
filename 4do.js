// ============================================================
// 影视仓 / TVBox · QuickJS spider —— 4do（vvmmyjs 通道）v3
// API：xn6.xn6oce.com:25118 · Web：4do.4do9dm.com:51888
//
// 形态：type:3，api 填本文件 URL，零服务器
//   { "key":"4do","name":"4do","type":3,"api":".../4do.js" }
//
// v3 增强（2026-10-22 实测取证后落地）：
//   1. 视频线筛选：时长（videoType=short|long）+ 排序（order=point）
//      —— 服务端白名单很窄：order 仅 point 生效，其余值一律返空；
//         year / area 实测被忽略（total 恒定 22216），故不下发，避免空页。
//   2. 直播线国家筛选：POST /api/live/index body {page,limit,country}
//      —— countries 列表接口自带 41 国 + 数量，直接作为筛选项源。
//   3. 分类 18 个 + 标签 496 个（label/list）+ 直播 1 个
//
// v2 已有能力保留：
//   · 标签线 type=label&typeId=<labelId>
//   · 直播 HLS：https://edge-hls.doppiocdn.live/hls/{id}/master/{id}_auto.m3u8（免 token）
//   · homeVod 走 /home/index 板块
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
const LIVE_M3U8 = 'https://edge-hls.doppiocdn.live/hls/{id}/master/{id}_auto.m3u8';

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
// 主 API 挂了自动切备用域名再试一次
function api(method, path, bodyObj, needAuth) {
    let out = api1(API, method, path, bodyObj, needAuth);
    if (out) return out;
    out = api1(API2, method, path, bodyObj, needAuth);
    return out;
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
    ["360", "探花"], ["358", "麻豆"], ["357", "新闻"], ["356", "擦边短剧"],
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

// 国家码 → 中文（直播 countries 41 国）
const CC = {
    CO: '哥伦比亚', US: '美国', IN: '印度', CN: '中国', RO: '罗马尼亚',
    VN: '越南', BR: '巴西', AR: '阿根廷', RU: '俄罗斯', ZA: '南非',
    MX: '墨西哥', VE: '委内瑞拉', CL: '智利', KE: '肯尼亚', UA: '乌克兰',
    PH: '菲律宾', LK: '斯里兰卡', PE: '秘鲁', DE: '德国', FR: '法国',
    JP: '日本', IT: '意大利', GB: '英国', TR: '土耳其', AU: '澳大利亚',
    CA: '加拿大', EC: '厄瓜多尔', ES: '西班牙', HU: '匈牙利', NL: '荷兰',
    TH: '泰国', ZW: '津巴布韦', AT: '奥地利', BD: '孟加拉', BG: '保加利亚',
    CH: '瑞士', DO: '多米尼加', EG: '埃及', LS: '莱索托', MA: '摩洛哥',
    NG: '尼日利亚', TW: '台湾'
};

let LB_CACHE = null; // 标签缓存 [[id,title]]
let CT_CACHE = null; // 国家缓存 [[code,label]]

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

function mapLive(it) {
    if (!it || !it.id) return null;
    return {
        vod_id: 'L' + String(it.id),
        vod_name: (String(it.title || '').replace(/^\s+|\s+$/g, '') || ('@' + String(it.username || ''))),
        vod_pic: String(it.cover || ''),
        vod_remarks: String(it.viewerCount || 0) + '人观看' + (it.isPaid ? ' · 门票' : '')
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

function liveList(page, country) {
    const body = { page: page, limit: LIMIT };
    if (country) body.country = String(country);
    const d = api('POST', '/api/live/index', body, true);
    const list = [];
    const lives = d && (d.lives || d.list);
    if (lives) for (let i = 0; i < lives.length; i++) { const v = mapLive(lives[i]); if (v) list.push(v); }
    const total = (d && parseInt(d.total, 10)) || list.length;
    let pc = Math.ceil(total / LIMIT);
    if (pc < 1) pc = list.length ? page : 1;
    return { page: page, pagecount: pc, limit: LIMIT, total: total, list: list };
}

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

// 国家列表：优先从 live/index 的 countries 拿（带数量），失败用内置 41 国
function getCountries() {
    if (CT_CACHE) return CT_CACHE;
    const d = api('POST', '/api/live/index', { page: 1, limit: 1 }, true);
    const out = [];
    const cs = d && d.countries;
    if (cs && cs.length) {
        for (let i = 0; i < cs.length; i++) {
            const c = cs[i];
            const code = String(c.code || c.country || '');
            if (!code) continue;
            const n = parseInt(c.count, 10) || 0;
            out.push([code, (CC[code] || code) + '(' + n + ')']);
        }
    }
    if (!out.length) {
        for (const k in CC) out.push([k, CC[k]]);
    }
    CT_CACHE = out;
    return out;
}

// ---------------- 对外方法 ----------------
function init(ext) { }

// 视频类目共用筛选项：时长 / 排序 / 标签
function videoFilters() {
    const labels = getLabels();
    const lv = [{ n: '全部', v: '' }];
    for (let i = 0; i < labels.length; i++) lv.push({ n: labels[i][1], v: labels[i][0] });
    return [
        { key: 'videoType', name: '时长', value: [{ n: '全部', v: '' }, { n: '短视频', v: 'short' }, { n: '长视频', v: 'long' }] },
        { key: 'order', name: '排序', value: [{ n: '最新', v: '' }, { n: '高分', v: 'point' }] },
        { key: 'label', name: '标签', value: lv }
    ];
}

function liveFilters() {
    const cs = getCountries();
    const cv = [{ n: '全球', v: '' }];
    for (let i = 0; i < cs.length; i++) cv.push({ n: cs[i][1], v: cs[i][0] });
    return [{ key: 'country', name: '国家', value: cv }];
}

function home(filter) {
    const cls = [{ type_id: 'all', type_name: '最新' }];
    for (let i = 0; i < CATS.length; i++) cls.push({ type_id: CATS[i][0], type_name: CATS[i][1] });
    cls.push({ type_id: 'live', type_name: '美女直播' });
    cls.push({ type_id: 'tag', type_name: '标签合集' });
    const vf = videoFilters();
    const filters = {};
    filters['all'] = vf;
    for (let i = 0; i < CATS.length; i++) filters[CATS[i][0]] = vf;
    filters['tag'] = [{ key: 'label', name: '标签', value: vf[2].value }];
    filters['live'] = liveFilters();
    const list = [];
    const d = api('GET', '/api/v2/home/public/video/home/index?channel=' + CHANNEL, null, false);
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

function homeVod() {
    const list = [];
    const d = api('GET', '/api/v2/home/public/video/home/index?channel=' + CHANNEL, null, false);
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
    // 直播：POST /api/live/index，支持国家筛选
    if (t === 'live') return JSON.stringify(liveList(page, ext.country || ''));
    // 标签合集：extend.label = 标签 id
    if (t === 'tag' && !ext.label) ext.label = getLabels()[0][0];
    return JSON.stringify(videoList(t, ext, page));
}

function detail(id) {
    const vid = String(id || '');
    // 直播条目：id = L<liveId>
    if (vid.charAt(0) === 'L' && /^\d+$/.test(vid.substring(1))) {
        const lid = vid.substring(1);
        const v = {
            vod_id: vid,
            vod_name: '直播 ' + lid,
            vod_pic: '',
            vod_content: '4do 美女直播（stripchat 源，边玩边聊实时流）\n直播间：' + lid,
            vod_play_from: '4do直播',
            vod_play_url: '直播$' + vid
        };
        // 拉一次详情补标题/封面，失败不阻塞
        const d = api('POST', '/api/live/detail', { id: parseInt(lid, 10) }, true);
        if (d && d.id) {
            v.vod_name = String(d.title || '').replace(/^\s+|\s+$/g, '') || ('@' + String(d.username || '直播 ' + lid));
            v.vod_pic = String(d.cover || '');
            v.vod_content = '主播：@' + String(d.username || '') + '\n人气：' + String(d.popularity || 0) + ' · 观看：' + String(d.viewerCount || 0) + '\n' + v.vod_content;
        }
        return JSON.stringify({ list: [v] });
    }
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
    const hdr = JSON.stringify({ 'User-Agent': UA });
    // 直播：拼接 doppiocdn 边缘 HLS（实测免 token 200）
    if (vid.charAt(0) === 'L' && /^\d+$/.test(vid.substring(1))) {
        const u = LIVE_M3U8.replace(/\{id\}/g, vid.substring(1));
        return JSON.stringify({ parse: 0, playUrl: '', url: u, header: hdr });
    }
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
