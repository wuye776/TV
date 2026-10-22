// ============================================================
// 影视仓 / TVBox · QuickJS spider —— 4do（vvmmyjs 通道）
// API：xn6.xn6oce.com:25118 · Web：4do.4do9dm.com:51888
//
// 形态：type:3，api 填本文件 URL，零服务器
//   { "key":"4do","name":"4do","type":3,"api":".../4do.js" }
//
// 全链路已实测打通：
//   指纹匿名登录(免账号) → Bearer → play/url(data+key 加密)
//   → b64url+循环XOR 解密 → 签名 m3u8(相对路径, 免 token 可播)
//   响应统一加密壳 {code,data(b64url),key} → XOR 解出 JSON
//   封面 .jpg.enc：官方 Web 端当前同样 423/425 张挂掉，v1 放弃封面
//
// 全同步：http() 必须 async:false；所有方法返回 JSON 字符串。
// ============================================================

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const API = 'https://xn6.xn6oce.com:25118';
const WEB = 'https://4do.4do9dm.com:51888';
const CHANNEL = 'vvmmyjs';
const LIMIT = 24;

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
    if (typeof env.data === 'string' && typeof env.key === 'string') {
        if (env.code !== 200) return null;
        const bytes = b64uBytes(env.data);
        const k = env.key;
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ^ k.charCodeAt(i % k.length));
        s = utf8Decode(bytes.map(function (b, i) { return b ^ k.charCodeAt(i % k.length); }));
        try { return JSON.parse(s.replace(/^\s+|\s+$/g, '')); } catch (e) { return s; }
    }
    if (env.code === 200) return env.data;
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

// ---------------- 分类（实测全量写死，冷启动 0 请求；sort 升序） ----------------
const CATS = [
    ["360", "探花"], ["358", "麻豆"], ["356", "擦边短剧"], ["346", "VR"],
    ["345", "女主播"], ["344", "AV中字"], ["343", "AV无码"], ["342", "AI换脸"],
    ["341", "三级"], ["267", "动漫"], ["264", "欧美"], ["266", "传媒"],
    ["263", "日本AV"], ["347", "黑料"], ["262", "国产"], ["268", "热门"]
];

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

// ---------------- 对外方法 ----------------
function init(ext) { }

function home(filter) {
    const cls = CATS.map(function (c) { return { type_id: c[0], type_name: c[1] }; });
    const list = [];
    const d = api('GET', '/api/v2/home/public/video/list?channel=' + CHANNEL + '&type=cate&typeId=268&page=1&limit=' + LIMIT, null, false);
    if (d && d.list) for (let i = 0; i < d.list.length; i++) { const v = mapItem(d.list[i]); if (v) list.push(v); }
    return JSON.stringify({ class: cls, filters: {}, list: list });
}

function homeVod() {
    const list = [];
    const d = api('GET', '/api/v2/home/public/video/list?channel=' + CHANNEL + '&type=cate&typeId=268&page=1&limit=' + LIMIT, null, false);
    if (d && d.list) for (let i = 0; i < d.list.length; i++) { const v = mapItem(d.list[i]); if (v) list.push(v); }
    return JSON.stringify({ list: list });
}

function category(tid, pg, filter, extend) {
    let page = parseInt(pg, 10);
    if (!page || page < 1) page = 1;
    const d = api('GET', '/api/v2/home/public/video/list?channel=' + CHANNEL + '&type=cate&typeId=' + encodeURIComponent(String(tid)) + '&page=' + page + '&limit=' + LIMIT, null, false);
    if (!d || !d.list) return JSON.stringify({ page: page, pagecount: 0, limit: LIMIT, total: 0, list: [] });
    const list = [];
    for (let i = 0; i < d.list.length; i++) { const v = mapItem(d.list[i]); if (v) list.push(v); }
    const total = parseInt(d.total, 10) || list.length;
    let pc = Math.ceil(total / LIMIT);
    if (pc < 1) pc = 1;
    return JSON.stringify({ page: page, pagecount: pc, limit: LIMIT, total: total, list: list });
}

function detail(id) {
    const d = api('GET', '/api/v2/home/public/video/long/detail?id=' + encodeURIComponent(String(id)) + '&channel=' + CHANNEL, null, false);
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
    const hdr = JSON.stringify({ 'User-Agent': UA, 'Referer': WEB + '/', 'Origin': WEB });
    if (!d || !d.masterUrl) return JSON.stringify({ parse: 0, playUrl: '', url: '', header: hdr });
    let u = String(d.masterUrl);
    if (u.charAt(0) === '/') u = API + u;
    return JSON.stringify({ parse: 0, playUrl: '', url: u, header: hdr });
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
