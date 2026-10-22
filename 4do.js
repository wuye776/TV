// ============================================================
// 影视仓 / TVBox · QuickJS spider —— 4do（vvmmyjs 通道）v2
// API：xn6.xn6oce.com:25118 · Web：4do.4do9dm.com:51888
//
// 形态：type:3，api 填本文件 URL，零服务器
//   { "key":"4do","name":"4do","type":3,"api":".../4do.js" }
//
// v2 全量补齐（实测）：
//   1. 类目 18 个全量（v1 漏了 新闻357 / 其他269）
//   2. 标签线：/api/v2/home/public/video/label/list 共 496 个
//      列表接口 type=label&typeId=<labelId> 可按标签出片（多人运动=572）
//      type=last&typeId=... 为全站最新池（total 22216）
//   3. 直播线：POST /api/live/index {page,limit}（需登录，指纹匿名即可）
//      detail 无 streams，但拼接 doppiocdn 边缘 HLS 实测 200 可播：
//      https://edge-hls.doppiocdn.live/hls/{id}/master/{id}_auto.m3u8
//      免 token，master 里是多码率，播放器自动选
//   4. homeVod 改用 /home/index 板块（探花/黑料/日本/ai换脸 各 10 条）
//
// 加密壳不变：{code,data(b64url),key} = b64url + key 循环 XOR
// 封面 .jpg.enc 依旧官方端自挂，v1 决策维持：视频条目空 cover
// ============================================================

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const API = 'https://xn6.xn6oce.com:25118';
const WEB = 'https://4do.4do9dm.com:51888';
const CHANNEL = 'vvmmyjs';
const LIMIT = 24;
const LIVE_M3U8 = 'https://edge-hls.doppiocdn.live/hls/{id}/master/{id}_auto.m3u8';

let HEADERS = { 'User-Agent': UA, 'Accept': 'application/json', 'Origin': WEB, 'Referer': WEB + '/' };

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
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ^ k.charCodeAt(i % k.length));
        s = utf8Decode(bytes.map(function (b, i) { return b ^ k.charCodeAt(i % k.length); }));
        try { return JSON.parse(s.replace(/^\s+|\s+$/g, '')); } catch (e) { return s; }
    }
    if (env.code === 200 || env.code === 0) return env.data;
    return null;
}

// ---------------- 网络：强制同步 ----------------
function request(url, options) {
    const o = Object.assign({ async: false, headers: HEADERS }, options || {});
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
function api(method, path, bodyObj, needAuth) {
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
    try { raw = bodyOf(request(API + path, { method: method, headers: h, body: body })); } catch (e) { return null; }
    if (!raw) return null;
    const out = dec2(raw);
    if (out) return out;
    // token 失效重登一次
    if (needAuth) {
        TK = ''; TK_EXP = 0;
        const tk = getTok();
        if (!tk) return null;
        h['Authorization'] = 'Bearer ' + tk;
        try { raw = bodyOf(request(API + path, { method: method, headers: h, body: body })); } catch (e) { return null; }
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
    } catch (e) { return ''; }
    const d = dec2(raw);
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

// 标签兜底：label/list 拉不到时用（实测常见标签，id 均验证过存在）
const TAG_FALLBACK = [
    ["261", "多人运动"], ["262", "熟女"], ["263", "内衣"], ["287", "偶像艺人"],
    ["288", "恋物癖"], ["290", "情侣"], ["291", "跳舞"], ["293", "偷窥"],
    ["295", "性奴"], ["297", "姐妹"], ["298", "通奸"], ["299", "粗暴"],
    ["302", "妄想"], ["305", "美容院"], ["308", "处男"], ["309", "蛮横娇羞"],
    ["313", "温泉"], ["318", "家教"], ["319", "母亲"], ["321", "赛车女郎"]
];

let LB_CACHE = null; // 标签缓存 [{id,title}]

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

function videoList(query, page) {
    const d = api('GET', '/api/v2/home/public/video/list?channel=' + CHANNEL + '&' + query + '&page=' + page + '&limit=' + LIMIT, null, false);
    if (!d || !d.list) return { page: page, pagecount: 0, limit: LIMIT, total: 0, list: [] };
    const list = [];
    for (let i = 0; i < d.list.length; i++) { const v = mapItem(d.list[i]); if (v) list.push(v); }
    const total = parseInt(d.total, 10) || list.length;
    let pc = Math.ceil(total / LIMIT);
    if (pc < 1) pc = 1;
    return { page: page, pagecount: pc, limit: LIMIT, total: total, list: list };
}

function liveList(page) {
    const d = api('POST', '/api/live/index', { page: page, limit: LIMIT }, true);
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

// ---------------- 对外方法 ----------------
function init(ext) { }

function home(filter) {
    const cls = CATS.map(function (c) { return { type_id: c[0], type_name: c[1] }; });
    cls.push({ type_id: 'live', type_name: '美女直播' });
    cls.push({ type_id: 'tag', type_name: '标签合集' });
    const filters = { tag: [{ key: 'label', name: '标签', value: getLabels().map(function (t) { return { n: t[1], v: t[0] }; }) }] };
    const list = [];
    const d = api('GET', '/api/v2/home/public/video/home/index?channel=' + CHANNEL, null, false);
    const secs = d && d.list;
    if (secs && secs.length && secs[0].list) {
        for (let i = 0; i < secs[0].list.length; i++) { const v = mapItem(secs[0].list[i]); if (v) list.push(v); }
    }
    if (!list.length) {
        const h = videoList('type=cate&typeId=268', 1);
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
    if (!list.length) return JSON.stringify({ list: videoList('type=cate&typeId=268', 1).list });
    return JSON.stringify({ list: list });
}

function category(tid, pg, filter, extend) {
    let page = parseInt(pg, 10);
    if (!page || page < 1) page = 1;
    const t = String(tid);
    // 标签合集：extend.label = 标签 id
    if (t === 'tag') {
        let lid = '';
        if (extend) {
            try {
                const e = typeof extend === 'string' ? JSON.parse(extend) : extend;
                if (e && e.label) lid = String(e.label);
            } catch (err) { }
        }
        if (!lid) lid = getLabels()[0][0];
        return JSON.stringify(videoList('type=label&typeId=' + encodeURIComponent(lid), page));
    }
    // 直播：POST /api/live/index
    if (t === 'live') return JSON.stringify(liveList(page));
    // 普通类目
    return JSON.stringify(videoList('type=cate&typeId=' + encodeURIComponent(t), page));
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
