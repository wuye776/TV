// ============================================================
// 影视仓 / TVBox · QuickJS spider —— 4do 网关直播 v2
// 源：4do（stripchat 白标中文站）API 网关 —— 裸网直连，免VPN
//
// 形态：type:3，api 填本文件 URL，零服务器零 jar
//   { "key":"scg","name":"4do直播","type":3,"api":".../scg.js" }
//
// 数据链路（全部无VPN直连实测，2026-10-23）：
//   自举  POST /api-user/v2/login/fingerprint {channel,fingerPrint}
//         → 响应 XOR(data,key)（key 为明文字符串按字节循环 XOR data 的 base64url）
//         → accessToken(TTL 31min) + refreshToken(10天)，401 时自动重自举
//   列表  POST /api/live/index {country,page,limit} → data.lives[]（total/limit/page）
//         country 缺省=全部 2600+；countries[] 42 国统计
//   播放  GET https://go.whitetrafsa.com/api/models?landing=Player&strict=1
//         &sortBy=paidUsers&modelsList=<username>&stripcashR=0&forceCl=
//         （免鉴权）→ models[0].stream.url
//         = https://edge-hls.growcdnssedge.com/hls/<id>/master/<id>_480p.m3u8
//         master → media m3u8 → mp4 分片，全程无需 header
//
// 坑位（实测）：
//   · 网关域名是中文 punycode（apissss.xn--…），无 JS 挑战，绕过 4do 页面直打
//   · status/sortBy/gender/query 参数全部无效，列表内自过滤 public
//   · groupShow/private 房间 go models 无 stream 字段（列表下标越界）
//   · limit 上限 100（给 200 也只回 100）
//   · 下播房间 stream.url 仍在（缓存），m3u8 302→cpa 广告流：判活=master 200 且无 MOUFLON-ADVERT
// ============================================================

'use strict';

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
var WEB = 'https://4do.4do9dm.com:51888';
var TIMEOUT = 60;

// 网关池：主域（中文 punycode 无挑战）+ 备用端口域
var GWS = [
    'https://xn6.xn6oce.com:25118',
    'https://apissss.xn--d9u11dw2l41at78afwi.xn--fiqs8s',
    'https://i7r.i7r1x7.com:25118'
];
var CHANNEL = 'vvmmyjs';
var MODELS_API = 'https://go.whitetrafsa.com/api/models';

// 分类：全部 + 热门国家。country 参数实测有效（total 精确）
var CATS = [
    ['', '全部直播'],
    ['CN', '中国'],
    ['CO', '哥伦比亚'],
    ['IN', '印度'],
    ['RO', '罗马尼亚'],
    ['US', '美国'],
    ['RU', '俄罗斯'],
    ['VN', '越南'],
    ['JP', '日本'],
    ['DE', '德国'],
    ['FR', '法国'],
    ['GB', '英国'],
    ['KR', '韩国'],
    ['TH', '泰国'],
    ['PH', '菲律宾']
];

// ---------------- 基础工具 ----------------
function s(v) { return v === null || v === undefined ? '' : String(v); }
function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function trim(x) { return String(x || '').replace(/^\s+|\s+$/g, ''); }

// base64url → bytes（内置 atob；无 atob 时手写解码表，老电视 QuickJS 可能没有 atob）
var B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64d(x) {
    var b = s(x).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    if (typeof atob === 'function') {
        var n = atob(b);
        var u = new Uint8Array(n.length);
        for (var i = 0; i < n.length; i++) u[i] = n.charCodeAt(i);
        return u;
    }
    // 手写 fallback：查表解码
    var len = b.length, pad = 0;
    if (len >= 1 && b.charAt(len - 1) === '=') pad++;
    if (len >= 2 && b.charAt(len - 2) === '=') pad++;
    var blen = len / 4 * 3 - pad;
    var u2 = new Uint8Array(blen);
    var oi = 0, buf = 0, bits = 0;
    for (var j = 0; j < len; j++) {
        var ch = b.charAt(j);
        if (ch === '=') break;
        var v = B64C.indexOf(ch);
        if (v < 0) continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            if (oi < blen) u2[oi++] = (buf >> bits) & 0xFF;
        }
    }
    return u2;
}
// XOR 响应解包：data(b64url) XOR key(明文字节循环) → JSON
function xorJson(d, k) {
    var dd = b64d(d), kb = [];
    var ks = s(k);
    for (var i = 0; i < ks.length; i++) kb.push(ks.charCodeAt(i));
    var out = '';
    for (var j = 0; j < dd.length; j++) out += String.fromCharCode(dd[j] ^ kb[j % kb.length]);
    return JSON.parse(out);
}

// ---------------- 网络层：绑定探测 + 网关自愈 + token ----------------
var BIND = null;
var GW_OK = '';
var GW_DEAD = {};
var MELTDOWN = 0;
var TOK = '';            // accessToken
var TOK_RF = '';         // refreshToken
var TOK_EXP = 0;         // 本地时间戳 ms

function request(url, opt) {
    var o = Object.assign({ async: false }, opt || {});
    o.async = false;
    if (typeof http === 'function') return http(url, o);
    if (typeof req === 'function') return req(url, o);
    if (typeof net !== 'undefined' && net && typeof net.http === 'function') return net.http(url, o);
    throw new Error('no http binding');
}
// 老 4do.js 电视端验证过的请求头：UA + Origin + Referer（网关有来源校验）
function stdHeaders(extra) {
    var h = {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Origin': WEB,
        'Referer': WEB + '/'
    };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
}
function bodyOf(r) {
    if (r === null || r === undefined) return '';
    if (typeof r === 'string') return r;
    if (typeof r !== 'object') return '';
    if (typeof r.content === 'string') return r.content;
    if (typeof r.body === 'string') return r.body;
    if (typeof r.data === 'string') return r.data;
    if (typeof r.text === 'string') return r.text;
    return '';
}
function resCode(r) {
    if (r === null || r === undefined) return 0;
    if (typeof r === 'number') return r;
    if (typeof r === 'object') {
        var c = r.code || r.status || r.statusCode || 0;
        return parseInt(c, 10) || 0;
    }
    return 0;
}

function fetchOnce(url, opt) {
    var r = request(url, opt || {});
    return { code: resCode(r), body: bodyOf(r) };
}

function gwList() {
    var out = [];
    if (GW_OK) out.push(GW_OK);
    for (var i = 0; i < GWS.length; i++) if (GWS[i] !== GW_OK && !GW_DEAD[GWS[i]]) out.push(GWS[i]);
    for (var k = 0; k < GWS.length; k++) if (out.indexOf(GWS[k]) < 0) out.push(GWS[k]);
    return out;
}

// 游客自举：fingerprint 随机生成，每次 401 后重新走
function bootToken() {
    var fp = 'fp-' + Math.floor(Math.random() * 1e12).toString(16) + Math.floor(Math.random() * 1e12).toString(16);
    var gws = gwList();
    for (var i = 0; i < gws.length; i++) {
        var gw = gws[i];
        try {
            var r = fetchOnce(gw + '/api-user/v2/login/fingerprint?channel=' + CHANNEL, {
                method: 'POST',
                headers: stdHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ channel: CHANNEL, fingerPrint: fp })
            });
            if (r.code !== 200 || !r.body) { GW_DEAD[gw] = 1; continue; }
            var j = JSON.parse(r.body);
            if (!j || !j.data || !j.key) continue;
            var t = xorJson(j.data, j.key);
            if (t && t.accessToken) {
                GW_OK = gw; GW_DEAD = {}; MELTDOWN = 0;
                TOK = s(t.accessToken);
                TOK_RF = s(t.refreshToken);
                TOK_EXP = Date.now() + (num(t.accessTokenTtl) || 1860) * 1000 - 60000;
                return true;
            }
        } catch (e) { GW_DEAD[gw] = 1; }
    }
    MELTDOWN = Date.now() + 30000;
    return false;
}

function haveToken() { return TOK && Date.now() < TOK_EXP; }

// 首选 GET：无鉴权直接打（models API / m3u8 判活）
// gwApi：走网关的 POST（自动带 token，401 自举重试一次）
function gwApi(path, body, retry) {
    if (!haveToken()) { if (!bootToken()) return null; }
    var gws = gwList();
    for (var i = 0; i < gws.length; i++) {
        var gw = gws[i];
        try {
            var r = fetchOnce(gw + path + '?channel=' + CHANNEL, {
                method: 'POST',
                headers: stdHeaders({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOK }),
                body: JSON.stringify(body || {})
            });
            if (r.code === 401) {
                TOK = ''; TOK_EXP = 0;
                if (retry !== false && bootToken()) return gwApi(path, body, false);
                continue;
            }
            if (r.code !== 200 || !r.body) { GW_DEAD[gw] = 1; continue; }
            GW_OK = gw;
            var j = JSON.parse(r.body);
            if (j && j.code === 0) return j.data;
            return null;
        } catch (e) {
            GW_DEAD[gw] = 1;
        }
    }
    MELTDOWN = Date.now() + 30000;
    return null;
}

// go models：免鉴权拿流地址。返回 stream.url 或 ''
function modelsStream(username) {
    var url = MODELS_API + '?landing=Player&strict=1&sortBy=paidUsers&modelsList=' +
        encodeURIComponent(s(username)) + '&stripcashR=0&forceCl=';
    try {
        var r = fetchOnce(url, { headers: stdHeaders() });
        if (r.code !== 200 || !r.body) return '';
        var j = JSON.parse(r.body);
        var ms = (j && j.models) || [];
        if (!ms.length) return '';
        var st = ms[0].stream;
        return st && st.url ? s(st.url) : '';
    } catch (e) { return ''; }
}

// ---------------- 映射 ----------------
function mapItem(m) {
    if (!m || !m.username) return null;
    var rm = '';
    var pv = num(m.viewerCount);
    if (pv > 0) rm = pv + '人';
    if (m.status === 'groupShow') rm = (rm ? rm + ' · ' : '') + '群秀';
    else if (m.status === 'private') rm = (rm ? rm + ' · ' : '') + '私秀';
    return {
        vod_id: s(m.username),
        vod_name: s(m.username),
        vod_pic: s(m.cover),
        vod_remarks: rm || '直播'
    };
}

// ---------------- 对外方法 ----------------
function init(ext) {
    if (!ext) return;
    var o = ext;
    if (typeof ext === 'string') { try { o = JSON.parse(ext); } catch (e) { return; } }
    if (o && o.ext !== undefined && !o.base) {
        o = o.ext;
        if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return; } }
    }
    // ext.base = 自定义网关（可选），插队最前
    if (o && o.base) {
        var b = trim(s(o.base)).replace(/\/+$/, '');
        if (b && GWS.indexOf(b) < 0) GWS.unshift(b);
    }
}

function home(filter) {
    var cls = [], filters = {};
    for (var i = 0; i < CATS.length; i++) {
        cls.push({ type_id: CATS[i][0], type_name: CATS[i][1] });
        filters[CATS[i][0]] = [];
    }
    var list = [];
    var d = gwApi('/api/live/index', { page: 1, limit: 30 });
    if (d && d.lives) {
        for (var j = 0; j < d.lives.length; j++) {
            var v = mapItem(d.lives[j]);
            if (v) list.push(v);
        }
    }
    if (!list.length) {
        var dbg2 = '空(' + (TOK ? 'tok✓' : 'tok✗') + '/' + (GW_OK ? 'gw✓' : 'gw✗') + ')';
        list.push({ vod_id: '_err_', vod_name: '网关不可达，稍后重试', vod_pic: '', vod_remarks: dbg2 });
    }
    return JSON.stringify({ class: cls, filters: filters, list: list });
}

function category(tid, pg, filter, extend) {
    var page = num(pg) || 1;
    var country = s(tid) === 'all' ? '' : s(tid);
    var LIMIT = 100;   // 实测上限
    var body = { page: page, limit: LIMIT };
    if (country) body.country = country;
    var d = gwApi('/api/live/index', body);
    var list = [], total = 0;
    if (d && d.lives) {
        total = num(d.total);
        var seen = {};
        for (var j = 0; j < d.lives.length; j++) {
            var v = mapItem(d.lives[j]);
            if (v && !seen[v.vod_id]) { seen[v.vod_id] = 1; list.push(v); }
        }
    }
    if (!list.length) {
        var dbg = '空(' + (TOK ? 'tok✓' : 'tok✗') + '/' + (GW_OK ? GW_OK.replace('https://', '').substring(0, 14) : 'gw✗') + '/p' + pg + ')';
        list.push({ vod_id: '_err_', vod_name: '该分类暂无直播或网关超时', vod_pic: '', vod_remarks: dbg });
    }
    var pc = Math.ceil((total || list.length) / LIMIT);
    if (pc < 1) pc = 1;
    if (pc > 27) pc = 27;
    return JSON.stringify({ page: page, pagecount: pc, limit: LIMIT, total: total, list: list });
}

function detail(id) {
    var un = trim(s(Array.isArray(id) ? id[0] : id).split(',')[0]);
    if (!un || un === '_err_') return JSON.stringify({ list: [] });
    // detail 只做展示信息，不拉流不判活（网络耗时是"一直加载中"元凶），播放时 play() 再取流
    var v = {
        vod_id: un,
        vod_name: un,
        vod_pic: '',
        vod_content: '4do(4do9dm.com) 直播 · 走 growcdnssedge 直链 · 无需VPN',
        vod_remarks: '在线直播',
        vod_play_from: '直播',
        vod_play_url: '线路$' + encodeURIComponent(un)
    };
    return JSON.stringify({ list: [v] });
}

function search(key, quick, pg) {
    var kw = trim(key);
    if (!kw) return JSON.stringify({ page: 1, pagecount: 1, limit: 0, total: 0, list: [] });
    // 网关无搜索端点（实测 404）——拉前 3 页本地过滤 username
    var page = num(pg) || 1;
    var LIMIT = 100;
    var list = [], seen = {};
    for (var p = 1; p <= 3 && list.length < LIMIT * page; p++) {
        var d = gwApi('/api/live/index', { page: p, limit: LIMIT });
        if (!d || !d.lives) break;
        var total = num(d.total);
        for (var j = 0; j < d.lives.length; j++) {
            var un = s(d.lives[j].username);
            if (un.toLowerCase().indexOf(kw.toLowerCase()) >= 0) {
                var v = mapItem(d.lives[j]);
                if (v && !seen[v.vod_id]) { seen[v.vod_id] = 1; list.push(v); }
            }
        }
        if (p * LIMIT >= total) break;
    }
    if (!list.length) list.push({ vod_id: '_err_', vod_name: '未找到「' + kw + '」（仅搜房间名，前300条，' + (TOK ? 'tok✓' : 'tok✗') + '）', vod_pic: '', vod_remarks: '' });
    var pc = Math.max(1, Math.ceil(list.length / LIMIT));
    return JSON.stringify({ page: page, pagecount: pc, limit: LIMIT, total: list.length, list: list });
}

function play(flag, id, vipFlags) {
    var hdr = JSON.stringify({ 'User-Agent': UA, 'Origin': WEB, 'Referer': WEB + '/' });
    var raw = trim(s(Array.isArray(id) ? id[0] : id).split(',')[0]);
    if (!raw || raw === '_err_') return JSON.stringify({ parse: 0, playUrl: '', url: '', header: hdr });
    // play 收到的可能是 detail 里 encodeURIComponent 过的 username，也可能直接是 username——两种都接
    var un = raw;
    try { un = decodeURIComponent(raw); } catch (e) { un = raw; }
    if (un.indexOf('http') === 0) {
        return JSON.stringify({ parse: 0, playUrl: '', url: un, header: hdr });
    }
    var url = modelsStream(un) || '';
    if (!url) url = 'https://4do.4do9dm.com:51888/#未开播或已下播-' + un + '-' + Date.now();
    return JSON.stringify({ parse: 0, playUrl: '', url: url, header: hdr });
}

function homeVod(params) {
    try {
        var o = JSON.parse(home(''));
        return JSON.stringify({ list: o.list || [] });
    } catch (e) { return JSON.stringify({ list: [] }); }
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
