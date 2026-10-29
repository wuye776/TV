// 爱看视频 · 影视仓 type:3 零服务器 spider（主域 2026-10-29 起 = 217xx.cc；mm.9999999993.cc 为门域）
// 数据通道：MacCMS v10 JSON API（25 类）+ HTML 兜底（1/2/3/5 四类 API 屏蔽，走 /t/<id>-<pg>/）
// 封面：API 列表无图 → ac=detail 批量补图；HTML 类直接用 data-original（imgcdn 文本生图，实为 JPEG）
// v4 2026-10-26 换域自愈重写（289xx → 292xx 事故）
// v5 2026-10-29 主号再换：292xx 首页 301 → 217xx（跨度 -75，±15 换号扫够不着）。
// 217xx API 实测直出 JSON（{"code":1,...}），移入 HOSTS 首位；289 移出（292±15 扫描可再生 289）。

var UA = 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/124.0.6367.82 Mobile Safari/537.36';

// 2026-10-26 站方换域：289xx.cc 已 301 → 292xx.cc，且 301 丢路径（Location: http://292xx.cc）。
// 壳层若自动跟跳，API 请求会落到首页 HTML → JSON 解析失败 → 列表全空（"只有分类没有资源"）。
// v4 判据：主机必须"API 路径直出 JSON"才算可用（能看见 301 才自愈的老写法在自动跟跳壳层上是瞎的）。
// init 零网络；首次取数时惰性解析 + 失败重解析 + NNNxx.cc 换号扫。
var HOSTS = ['http://217xx.cc', 'http://292xx.cc', 'http://mm.9999999993.cc'];
var HOST_OK = '';
var DEEP_DONE = 0;
var FAILS = 0;   // 连续取数失败计数，防断网时每次点击都重扫

var APIP = '/api.php/provide/vod/';

// 分类：tid → {n:名, h:1=走HTML}
var CATS = [
    { id: 'all', name: '最近更新' },
    { id: '18', name: '自拍' },
    { id: '4', name: '欧M专区' },
    { id: '22', name: 'W曝黑L' },
    { id: '2', name: '国C专区', h: 1 },
    { id: '20', name: '主播网红' },
    { id: '25', name: 'X虐Z服' },
    { id: '3', name: '日h专区', h: 1 },
    { id: '24', name: '无M专区' },
    { id: '23', name: '中W字幕' },
    { id: '7', name: 'MD传媒' },
    { id: '21', name: 'L伦J情' },
    { id: '29', name: '激q动漫' },
    { id: '26', name: '中字动漫' },
    { id: '27', name: '3D次元' },
    { id: '1', name: 'C媒厂商', h: 1 },
    { id: '5', name: '次元动漫', h: 1 },
    { id: '17', name: '其他' },
    { id: '15', name: 'qq传媒' },
    { id: '16', name: 'TXVlog' },
    { id: '8', name: '蜜T传媒' },
    { id: '9', name: '星K无线' },
    { id: '10', name: '天M传媒' },
    { id: '11', name: 'H家华人' },
    { id: '12', name: 'SK传媒' },
    { id: '13', name: 'DX传媒' },
    { id: '14', name: 'XJ传媒' },
    { id: '28', name: '无M动漫' },
    { id: '30', name: 'JD影业' },
    { id: '31', name: 'id传媒' }
];

// 标签筛选（来源：站内 常用搜索，t+wd 组合已实测有效）
var TAGS = ['探花', '偷拍', '直播', '反差', '自拍', '女神', '网红', '模特', '主播', '教师', '巨乳', '盗摄', '潮吹', '骑乘', '护士', '野战', '调教', '奴隶', '群P', 'OL', '和服', '浴衣', '黒人', '美臀', '美乳', '美腿', '动画', '淫语', '颜射', '寝取', '姉妹', '自慰', '足交', '义母', '监禁', '丝袜', '看护', '接吻', '处女', '吃瓜', '人妖', '双性', '微乳', '萝莉', '温泉', '泳装', '同性', '吞精', '情趣', '玩具', '巨尻', '制服', '放尿', '巨根', '角色', '扮演', '妄想', '痴女', '痴汉', '白虎', '母乳', '乳交', '小柄', '人妻', '晒痕', '肛交', '女仆', '童颜', '超乳', '泥醉', 'SM', '近亲', '相奸', 'AI', '换脸', '国产', '麻豆', '传媒', '淫乱', '中出', '熟女', '学生', '素人', '尤物', '迷奸', '颜值'];

var DETAIL_CACHE = {};
var HTML_CACHE = {};
var CACHE_KEYS = [];
function cachePut(key, obj) {
    if (CACHE_KEYS.indexOf(key) < 0) {
        CACHE_KEYS.push(key);
        if (CACHE_KEYS.length > 800) {
            var old = CACHE_KEYS.shift();
            delete DETAIL_CACHE[old];
            delete HTML_CACHE[old];
        }
    }
    DETAIL_CACHE[key] = obj;
}

function request(url, options) {
    var o = Object.assign({ async: false, headers: { 'User-Agent': UA } }, options || {});
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

function codeOf(r) {
    if (!r || typeof r === 'string') return 0;
    return r.code || 0;
}

function locOf(r) {
    if (!r || typeof r === 'string' || !r.headers) return '';
    var h = r.headers;
    return h.location || h.Location || '';
}

// 跟 301/302 并做域名自愈：只改写主机名，路径原样保留（站方 301 丢路径，不能照抄 Location）
function reqSmart(url) {
    var cur = url;
    for (var i = 0; i < 3; i++) {
        var r = request(cur, {});
        var c = codeOf(r);
        if (c === 301 || c === 302) {
            var loc = locOf(r);
            var m = loc ? loc.match(/^(https?:\/\/[^\/\s]+)/i) : null;
            if (m) {
                HOST_OK = m[1].replace(/\/+$/, '');
                cur = cur.replace(/^(https?:\/\/[^\/\s]+)/i, function () { return HOST_OK; });
                continue;
            }
            var alt = altHost(url);
            if (alt) { HOST_OK = alt; cur = cur.replace(/^(https?:\/\/[^\/\s]+)/i, function () { return alt; }); continue; }
            return { code: c, body: '' };
        }
        return { code: c, body: bodyOf(r), raw: r };
    }
    return { code: c, body: '', raw: r };
}

function altHost(url) {
    var m = String(url).match(/^(https?:\/\/[^\/\s]+)/i);
    var cur = m ? m[1] : '';
    for (var i = 0; i < HOSTS.length; i++) {
        if (HOSTS[i] !== cur) return HOSTS[i];
    }
    return '';
}

function apiGet(qs) {
    ensureHost();
    var r = reqSmart(HOST_OK + APIP + '?' + qs);
    if (isApiJson(r.body)) { FAILS = 0; return JSON.parse(r.body); }
    // 主域失活 / 被壳层跟跳到首页 → 清空重解析（必要时深扫一次）再取一次
    if (FAILS >= 2) return null;   // 断网态：不再反复扫描，直接空返回
    HOST_OK = '';
    var ok = resolveHost(false);
    if (!ok && !DEEP_DONE) { DEEP_DONE = 1; ok = resolveHost(true); }
    if (!ok) { FAILS++; HOST_OK = HOSTS[0]; return null; }
    r = reqSmart(HOST_OK + APIP + '?' + qs);
    if (isApiJson(r.body)) { FAILS = 0; return JSON.parse(r.body); }
    FAILS++;
    return null;
}

// 手写 base64（urlsafe 优先，兼容标准表）+ UTF-8 还原（QuickJS 无 atob/TextDecoder）
var B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
var B64STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64dec(s) {
    s = String(s).replace(/=+$/, '');
    var bytes = [], acc = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
        var v = B64URL.indexOf(s.charAt(i));
        if (v < 0) v = B64STD.indexOf(s.charAt(i));
        if (v < 0) continue;
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xFF); }
    }
    var p = '';
    for (var j = 0; j < bytes.length; j++) p += '%' + ('0' + bytes[j].toString(16)).slice(-2);
    try { return decodeURIComponent(p); } catch (e) { return p; }
}

// 封面 URL → 标题：.../i/txt/<b64(源txt)>/<b64(标题)>.txt
function titleFromCover(cover) {
    if (!cover) return '';
    var i = cover.indexOf('/i/txt/');
    if (i < 0) return '';
    var tail = cover.substring(i + 7);
    var segs = tail.split('/');
    if (segs.length < 2) return '';
    var t = segs[1].replace(/\.txt$/i, '');
    return b64dec(t);
}

// API 响应必须是 JSON 且 code=1 才算真到达（HTML = 被跟跳落到首页，判死）
function isApiJson(b) {
    if (!b || b.length < 10) return false;
    if (String(b).replace(/^\s+/, '').charAt(0) !== '{') return false;
    try { var d = JSON.parse(b); return !!(d && d.code === 1 && d.list); } catch (e) { return false; }
}

function probeApi(host) {
    var h = String(host).replace(/\/+$/, '');
    var r = request(h + APIP + '?ac=list', {});
    if (isApiJson(bodyOf(r))) return h;
    var loc = locOf(r);
    var m = loc ? String(loc).match(/^(https?:\/\/[^\/\s]+)/i) : null;
    if (m) {
        var h2 = m[1].replace(/\/+$/, '');
        if (h2 !== h && isApiJson(bodyOf(request(h2 + APIP + '?ac=list', {})))) return h2;
    }
    return '';
}

// NNNxx.cc 换号网：289→292 这种相邻换号直接捞回来
function sweepHosts() {
    var base = [], out = [];
    for (var i = 0; i < HOSTS.length; i++) {
        var m = String(HOSTS[i]).match(/(\d{2,4})xx\.cc/i);
        if (m) base.push(parseInt(m[1], 10));
    }
    for (var d = 1; d <= 15; d++) {
        for (var k = 0; k < base.length; k++) {
            if (base[k] + d > 0) out.push('http://' + (base[k] + d) + 'xx.cc');
            if (base[k] - d > 0) out.push('http://' + (base[k] - d) + 'xx.cc');
        }
    }
    return out;
}

function resolveHost(deep) {
    var pool = HOSTS.slice();
    if (deep) pool = pool.concat(sweepHosts());
    var cap = deep ? 20 : pool.length;
    for (var i = 0; i < pool.length && i < cap; i++) {
        var h = probeApi(pool[i]);
        if (h) { HOST_OK = h; return true; }
    }
    return false;
}

function ensureHost() {
    // 乐观启动：直接押 HOSTS[0]，取数失败时由 apiGet 触发解析（正常态省一次探测请求）
    if (!HOST_OK) HOST_OK = HOSTS[0];
    return HOST_OK;
}

function pickHost() { return ensureHost(); }

function dateOnly(s) {
    return s ? String(s).substring(0, 10) : '';
}

// API 列表 → 卡片（补封面/时间）
function mergeDetails(list) {
    if (!list || !list.length) return list || [];
    var ids = [];
    for (var i = 0; i < list.length; i++) ids.push(list[i].vod_id);
    var d = apiGet('ac=detail&ids=' + ids.join(','));
    var map = {};
    if (d && d.list && d.list.length) {
        for (var k = 0; k < d.list.length; k++) map[d.list[k].vod_id] = d.list[k];
    }
    for (var j = 0; j < list.length; j++) {
        var v = map[list[j].vod_id];
        if (v) {
            list[j].vod_pic = picWrap(v.vod_pic || '');
            list[j].vod_remarks = dateOnly(v.vod_time);
            if (v.vod_class) list[j].vod_class = v.vod_class;
        }
        cachePut('n' + list[j].vod_id, list[j]);
    }
    return list;
}

function itemsOf(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var v = list[i];
        out.push({
            vod_id: String(v.vod_id),
            vod_name: v.vod_name || '',
            type_id: String(v.type_id || ''),
            type_name: v.type_name || '',
            vod_pic: picWrap(v.vod_pic || ''),
            vod_remarks: v.vod_remarks || dateOnly(v.vod_time)
        });
    }
    return out;
}

var IMGCDN = 'https://imgcdn.u8-jj1dth16b1n1aay.xyz';
var B64A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
var B64U = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// utf8 → urlsafe b64（无 pad）——QuickJS 无 Buffer/atob 时的封面包装编码
function b64enc(str) {
    var s = String(str), out = '', i, c1, c2, c3, e1, e2, e3, e4;
    var bytes = [];
    for (i = 0; i < s.length; i++) {
        var cc = s.charCodeAt(i);
        if (cc < 0x80) bytes.push(cc);
        else if (cc < 0x800) { bytes.push(0xC0 | (cc >> 6), 0x80 | (cc & 63)); }
        else if (cc >= 0xD800 && cc <= 0xDBFF && i + 1 < s.length) {
            var lo = s.charCodeAt(i + 1);
            if (lo >= 0xDC00 && lo <= 0xDFFF) {
                var u = 0x10000 + ((cc - 0xD800) << 10) + (lo - 0xDC00);
                bytes.push(0xF0 | (u >> 18), 0x80 | ((u >> 12) & 63), 0x80 | ((u >> 6) & 63), 0x80 | (u & 63));
                i++;
            } else bytes.push(0xEF, 0xBF, 0xBD);
        } else bytes.push(0xE0 | (cc >> 12), 0x80 | ((cc >> 6) & 63), 0x80 | (cc & 63));
    }
    for (i = 0; i < bytes.length; i += 3) {
        c1 = bytes[i]; c2 = bytes[i + 1]; c3 = bytes[i + 2];
        e1 = c1 >> 2;
        e2 = ((c1 & 3) << 4) | ((c2 === undefined ? 0 : c2) >> 4);
        e3 = c2 === undefined ? -1 : ((c2 & 15) << 2) | ((c3 === undefined ? 0 : c3) >> 6);
        e4 = c3 === undefined ? -1 : c3 & 63;
        out += B64U.charAt(e1) + B64U.charAt(e2);
        out += e3 < 0 ? '' : B64U.charAt(e3);
        out += e4 < 0 ? '' : B64U.charAt(e4);
    }
    return out;
}

// 站方封面两种形态：
//   ① aaa.img-xxx.xyz/text/<md5>.txt —— base64(JPEG) 伪装 .txt，CT=text/plain，电视不渲染
//   ② imgcdn.u8-xxx.xyz/pic/<md5>.jpg  —— 同一张图的正经 JPEG，CT=image/jpeg，电视可达✅
// 修法：正则抽 <md5> → 换 imgcdn /pic/<md5>.jpg（实测 4/4 200、magic FFD8FF、CF 缓存 HIT）
var PICC = 'https://imgcdn.u8-jj1dth16b1n1aay.xyz';
var PIC_MODE = 'direct';   // 'direct'=imgcdn/pic 真JPEG | 'wp' | 'wsrv' | 'none'
function picWrap(pic) {
    var p = String(pic || '');
    if (!p) return '';
    if (PIC_MODE === 'none') return '';
    // 已经是正经图域，幂等直返
    if (p.indexOf(PICC + '/pic/') === 0) return p;
    if (PIC_MODE === 'wp') return 'https://i0.wp.com/' + p.replace(/^https?:\/\//, '') + '?strip=all';
    if (PIC_MODE === 'wsrv') return 'https://wsrv.nl/?url=' + encodeURIComponent(p) + '&output=jpg&w=300';
    // direct：抽 md5 换装
    var md5 = p.match(/([0-9a-f]{32})(?:\.txt)?$/i) || p.match(/([0-9a-f]{32})/i);
    if (!md5) return p;
    return PICC + '/pic/' + md5[1].toLowerCase() + '.jpg';
}

function emptyPage(page) {
    return JSON.stringify({ page: page || 1, pagecount: 1, limit: 20, total: 0, list: [] });
}

function isHtmlCat(tid) {
    for (var i = 0; i < CATS.length; i++) {
        if (CATS[i].id === String(tid) && CATS[i].h) return true;
    }
    return false;
}

// ---------- HTML 通道（API 屏蔽的 1/2/3/5 类） ----------
function htmlList(code, page) {
    ensureHost();
    var url = HOST_OK + '/t/' + code + (page > 1 ? '-' + page : '') + '/';
    var r = reqSmart(url);
    var body = r.body || '';
    var items = [];
    var re = /<a class="card[^"]*"[^>]*?data-original="([^"]+)"[^>]*?href="\/p\/([A-Za-z0-9]+)-1-1\/"/g;
    var m;
    while ((m = re.exec(body)) !== null) {
        var cover = m[1];
        var cid = 'h' + m[2];
        var name = titleFromCover(cover);
        HTML_CACHE[cid] = { name: name, pic: cover };
        items.push({ vod_id: cid, vod_name: name, vod_pic: cover, vod_remarks: '' });
    }
    var pcre = /(\d+)\s*\/\s*(\d+)/;
    var pm = body.match(pcre);
    var pagecount = pm ? parseInt(pm[2]) : (items.length ? page : 1);
    return { pagecount: pagecount, list: items };
}

function htmlDetail(code) {
    ensureHost();
    var cid = 'h' + code;
    var cached = HTML_CACHE[cid] || null;
    var r = reqSmart(HOST_OK + '/p/' + code + '-1-1/');
    var body = r.body || '';
    var pm = body.match(/MacPlayer\s*=\s*\{\s*PlayUrl\s*:\s*'([^']+)'/);
    var m3u8 = pm ? pm[1] : '';
    return {
        vod_id: cid,
        vod_name: cached ? cached.name : ('视频 ' + code),
        vod_pic: cached ? cached.pic : '',
        vod_remarks: '',
        type_name: '',
        vod_play_url: m3u8 ? ('第1集$' + m3u8) : ''
    };
}

// ---------- 输出 ----------
function classList() {
    var cls = [], filters = {};
    for (var i = 0; i < CATS.length; i++) {
        var c = CATS[i];
        cls.push({ type_id: c.id, type_name: c.name });
        if (c.h) {
            filters[c.id] = [];
        } else {
            var vals = [{ n: '全部', v: '' }];
            for (var j = 0; j < TAGS.length; j++) vals.push({ n: TAGS[j], v: TAGS[j] });
            filters[c.id] = [{ key: '1', name: '标签', value: vals }];
        }
    }
    return { class: cls, filters: filters };
}

function extWd(ext) {
    if (!ext) return '';
    var o = ext;
    if (typeof o === 'string') {
        try { o = JSON.parse(o); } catch (e) { return ''; }
    }
    if (!o) return '';
    return o['1'] || o.wd || '';
}

function extPg(ext) {
    if (!ext) return 1;
    var o = ext;
    if (typeof o === 'string') {
        try { o = JSON.parse(o); } catch (e) { return 1; }
    }
    return (o && o.pg) || 1;
}

export default {
    init(cfg) {
        // 零网络：主机解析挪到首次取数（ensureHost），init 只在给了 base 时记账
        if (cfg && cfg.base) HOST_OK = String(cfg.base).replace(/\/+$/, '');
        return '';
    },
    home() {
        var c = classList();
        return JSON.stringify({ class: c.class, filters: c.filters });
    },
    homeVod() {
        var d = apiGet('ac=list&h=24&pg=1');
        var list = d && d.list ? mergeDetails(d.list) : [];
        return JSON.stringify({ list: itemsOf(list) });
    },
    category(tid, pg, ext) {
        var page = parseInt(pg || '1') || 1;
        var wd = extWd(ext);
        var tidS = String(tid);
        if (tidS.charAt(0) === 'h' || isHtmlCat(tidS)) {
            var html = htmlList(tidS.charAt(0) === 'h' ? tidS.substring(1) : tidS, page);
            return JSON.stringify({ page: page, pagecount: html.pagecount, limit: 42, total: 0, list: html.list });
        }
        var qs = 'ac=list&pg=' + page;
        if (tidS !== 'all') qs += '&t=' + tidS;
        if (wd) qs += '&wd=' + encodeURIComponent(wd);
        var d = apiGet(qs);
        if (!d || !d.list || !d.list.length) return emptyPage(page);
        return JSON.stringify({
            page: page,
            pagecount: d.pagecount || 1,
            limit: 20,
            total: d.total || 0,
            list: itemsOf(mergeDetails(d.list))
        });
    },
    detail(id) {
        var idS = String(id);
        var vod;
        if (idS.charAt(0) === 'h') {
            vod = htmlDetail(idS.substring(1));
        } else {
            var cached = DETAIL_CACHE['n' + idS];
            if (cached && cached.vod_name) {
                vod = {
                    vod_id: idS,
                    vod_name: cached.vod_name,
                    vod_pic: cached.vod_pic || '',
                    vod_remarks: cached.vod_remarks || '',
                    type_name: cached.type_name || '',
                    vod_play_url: ''
                };
            } else {
                vod = { vod_id: idS, vod_name: '', vod_pic: '', vod_remarks: '', type_name: '', vod_play_url: '' };
            }
            var d = apiGet('ac=detail&ids=' + idS);
            if (d && d.list && d.list.length) {
                var v = d.list[0];
                vod.vod_name = v.vod_name || vod.vod_name;
                vod.vod_pic = picWrap(v.vod_pic || vod.vod_pic);
                vod.vod_remarks = dateOnly(v.vod_time) || vod.vod_remarks;
                vod.type_name = v.type_name || vod.type_name;
                vod.vod_play_url = v.vod_play_url || '';
                vod.vod_content = v.vod_content || '';
                vod.vod_actor = v.vod_actor || '';
                vod.vod_area = v.vod_area || '';
                vod.vod_year = v.vod_year || '';
                cachePut('n' + idS, { vod_id: idS, vod_name: vod.vod_name, vod_pic: vod.vod_pic, vod_remarks: vod.vod_remarks, type_name: vod.type_name });
            }
        }
        if (vod.vod_play_url && vod.vod_play_url.indexOf('第1集$') < 0) {
            var urls = String(vod.vod_play_url).split('#');
            var parts = [];
            for (var i = 0; i < urls.length; i++) {
                var seg = urls[i].split('$');
                parts.push((seg[0] || ('第' + (i + 1) + '集')) + '$' + (seg[1] || ''));
            }
            vod.vod_play_url = parts.join('#');
        }
        if (!vod.vod_play_from) vod.vod_play_from = '爱看在线';
        return JSON.stringify({ list: [vod] });
    },
    play(flag, id) {
        var url = String(id || '');
        if (url.indexOf('$') >= 0) url = url.split('$').pop();
        return JSON.stringify({
            parse: 0,
            url: url,
            header: { 'User-Agent': UA }
        });
    },
    search(wd, quick, pg) {
        var page = parseInt(pg || '1') || 1;
        if (!wd) return emptyPage(page);
        var d = apiGet('ac=list&wd=' + encodeURIComponent(wd) + '&pg=' + page);
        if (!d || !d.list || !d.list.length) return emptyPage(page);
        return JSON.stringify({
            page: page,
            pagecount: d.pagecount || 1,
            limit: 20,
            total: d.total || 0,
            list: itemsOf(mergeDetails(d.list))
        });
    }
};
