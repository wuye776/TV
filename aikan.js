// 爱看视频 (mm.9999999993.cc → 289xx.cc) · 影视仓 type:3 零服务器 spider
// 数据通道：MacCMS v10 JSON API（25 类）+ HTML 兜底（1/2/3/5 四类 API 屏蔽，走 /t/<id>-<pg>/）
// 封面：API 列表无图 → ac=detail 批量补图；HTML 类直接用 data-original（imgcdn 文本生图，实为 JPEG）
// v1 2026-10-25

var UA = 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/124.0.6367.82 Mobile Safari/537.36';

// 主域 289xx.cc（mm.9999999993.cc 是前台门，301 到根）。门域名轮换时自动跟随 301 换域。
var HOSTS = ['http://289xx.cc', 'http://mm.9999999993.cc'];
var HOST_OK = '';

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

// 跟 301/302 并做域名自愈：门域跳新域时改写 HOST_OK；无 Location 头则轮换 HOSTS 兜底
function reqSmart(url) {
    var cur = url;
    for (var i = 0; i < 3; i++) {
        var r = request(cur, {});
        var c = codeOf(r);
        if (c === 301 || c === 302) {
            var loc = locOf(r);
            var m = loc ? loc.match(/^(https?:\/\/[^\/\s]+)/i) : null;
            if (m) {
                HOST_OK = m[1];
                cur = cur.replace(/^(https?:\/\/[^\/\s]+)/i, function () { return m[1]; });
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
    var r = reqSmart(HOST_OK + APIP + '?' + qs);
    var b = r.body || '';
    if (b.length < 10) return null;
    var d = null;
    try { d = JSON.parse(b); } catch (e) { return null; }
    if (!d || d.code !== 1 || !d.list) return null;
    return d;
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

function pickHost() {
    var list = HOSTS.slice();
    for (var i = 0; i < list.length; i++) {
        var r = request(list[i] + APIP + '?ac=list', {});
        var c = codeOf(r);
        if (c === 301 || c === 302) {
            var loc = locOf(r);
            var m = loc ? loc.match(/^(https?:\/\/[^\/\s]+)/i) : null;
            if (m) { HOST_OK = m[1]; return; }
        }
        if (bodyOf(r).indexOf('"code":1') >= 0) { HOST_OK = list[i]; return; }
    }
    HOST_OK = HOSTS[0];
}

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
            list[j].vod_pic = v.vod_pic || '';
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
            vod_pic: v.vod_pic || '',
            vod_remarks: v.vod_remarks || dateOnly(v.vod_time)
        });
    }
    return out;
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
        if (cfg && cfg.base) {
            HOST_OK = String(cfg.base).replace(/\/+$/, '');
        } else {
            try { pickHost(); } catch (e) { HOST_OK = HOSTS[0]; }
        }
        if (!HOST_OK) HOST_OK = HOSTS[0];
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
                vod.vod_pic = v.vod_pic || vod.vod_pic;
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
