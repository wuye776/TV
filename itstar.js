// ============================================================
// 影视仓 / TVBox type:3 零服务器 spider  v2
// 站：m-qat.itstar.tw（本色 Bense，React SPA + App API）
// 播放：OSS h265 fMP4，key 内联 data URI —— 全程不需要服务器
// v2 改动：
//   1. playlist 必须拿到 #EXT-X-ENDLIST 才算成功（修「5 分钟就没了」）
//   2. 多层次重试 + 截断行清理（修「缓冲完提示暂无播放数据」）
//   3. 双线路 H265 / H264 自动降级
//   4. 分类补到 21 个（含中文字幕/无码/有码等）
//   5. 全分类挂「地区 + 标签」筛选（实测参数 region_id / tag_ids 有效）
//   6. token 缓存 + 失败降级，抗限流
//
// json:
//   { "type": 3, "api": "在线 js 地址", "ext": "{\"base\":\"https://m-qat.itstar.tw\"}" }
// 铁律：全同步。QuickJS 不 pump 微任务，Promise 永不 resolve。
// ============================================================

const DEF_BASE = 'https://m-qat.itstar.tw';
const OSS = 'https://pkm4-qat-vod-original.oss-accelerate.aliyuncs.com';
const PIC = 'https://pkm4-qat-vod-preview.oss-accelerate.aliyuncs.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DEVICE_ID = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const CONECTION = 'KXUEmafncA8rBXPkhQs2wcKBargtbV9+bZREhW8MY1d4B8FFFkH5wsMMQpmchQfc';

// ---------- 分类（左侧一级） ----------
const CLASSES = [
    ['new', '最新'],
    ['r:130655315342393347', '动漫'],
    ['r:38583208249393155', '日本'],
    ['r:70822867645759491', '欧美'],
    ['r:114554707938115587', '华语'],
    ['r:49674684282699779', '亚洲'],
    ['r:49674605111017475', '北美'],
    ['r:49674592544882691', '东南亚'],
    ['r:49674646970171395', '北欧'],
    ['r:69211063744200707', '北海道'],
    ['r:36919976124219395', '综合'],
    ['t:59660874054369299', '中文字幕'],
    ['t:59660853787492371', '无码'],
    ['t:59660831624790035', '有码'],
    ['t:61229774772633603', '严选'],
    ['t:88194152214298643', '自拍'],
    ['t:88194178269315091', '流出'],
    ['t:94570344681046035', 'FC2'],
    ['t:87465457090560019', 'OnlyFans'],
    ['t:60893248415072261', '重口味'],
    ['t:87309771035639811', '蒙面'],
    ['t:48564968819261445', '潮吹'],
    ['t:48564769438826501', '口交'],
    ['t:48565173702623237', '多P']
];

// ---------- 筛选：地区 ----------
const REGIONS = [
    ['38583208249393155', '日本'],
    ['70822867645759491', '欧美'],
    ['114554707938115587', '华语'],
    ['49674684282699779', '亚洲'],
    ['49674605111017475', '北美'],
    ['49674592544882691', '东南亚'],
    ['49674646970171395', '北欧'],
    ['130655315342393347', '动漫'],
    ['69211063744200707', '北海道'],
    ['36919976124219395', '综合'],
    ['49750539008737283', '希腊'],
    ['275615047298977792', '地球'],
    ['38142675265781763', '火星'],
    ['109357766958645251', '水星'],
    ['58528458212376579', '所罗门群岛'],
    ['133700757198209027', 'PDM']
];

// ---------- 筛选：标签 ----------
const TAGS = [
    ['59660874054369299', '中文字幕'],
    ['59660853787492371', '无码'],
    ['59660831624790035', '有码'],
    ['88194152214298643', '自拍'],
    ['88194178269315091', '流出'],
    ['94570344681046035', 'FC2'],
    ['87465457090560019', 'OnlyFans'],
    ['60893248415072261', '重口味'],
    ['61229774772633603', '严选名貘'],
    ['87309771035639811', '蒙面僧人'],
    ['48564968819261445', '潮吹'],
    ['48564769438826501', '口交'],
    ['69843653337546757', '吞精'],
    ['48565173702623237', '多P'],
    ['59661363160547347', 'NTR'],
    ['48567244363399173', '人妻'],
    ['60889399453286419', '痴女'],
    ['95711835101069331', 'JK'],
    ['73245891800072197', 'OL'],
    ['48563781713788933', '校服'],
    ['48565621771730949', 'SM'],
    ['94435029890891795', '肉便器'],
    ['48564315917123589', '巨乳'],
    ['48564611129016325', '美腿'],
    ['48564923571109893', '中出'],
    ['94570642174640147', '时间停止'],
    ['94570547265929235', '泰国'],
    ['94570472741535763', '韩国']
];

let BASE = DEF_BASE;
let TOKEN = '';
let TOKEN_EXP = 0;

// ---------- 网络 ----------

function request(url, options) {
    const o = Object.assign({ async: false, timeout: 35 }, options || {});
    o.async = false;
    if (typeof http === 'function') return http(url, o);
    if (typeof req === 'function') return req(url, o);
    if (typeof net !== 'undefined' && net && typeof net.http === 'function') return net.http(url, o);
    throw new Error('no http binding');
}

function bodyOf(res) {
    if (!res) return '';
    if (res.ok === false) throw new Error('http ' + res.status);
    const c = res.content;
    if (c === undefined || c === null) return '';
    if (typeof c === 'string') return c;
    try { return String(c); } catch (e) { return ''; }
}

function fetchOnce(url, headers) {
    const res = request(url, { headers: headers || {} });
    return bodyOf(res);
}

function fetchText(url, headers, tries) {
    const n = tries || 3;
    let last = '';
    for (let i = 0; i < n; i++) {
        try {
            const t = fetchOnce(url, headers);
            if (t) return t;
        } catch (e) { }
    }
    return last;
}

function s(v) { return v === undefined || v === null ? '' : String(v); }
function q1(v) { return encodeURIComponent(s(v)); }
function trim(v) { return s(v).replace(/^\s+|\s+$/g, ''); }

function apiHeaders() {
    return { 'User-Agent': UA, 'Referer': BASE + '/', 'Accept': 'application/json' };
}

// ---------- 鉴权 ----------

function doEstablish() {
    const body = '{"device_id":"' + DEVICE_ID + '","device_type":"cookie","invite_code":"",' +
        '"os_version":"iOS 17.5","phone_device":"iPhone 15 Pro","version":"1.2.441","is_first":1}';
    for (let i = 0; i < 3; i++) {
        try {
            const res = request(BASE + '/api/v1/member/establish', {
                method: 'POST',
                headers: {
                    'User-Agent': UA,
                    'Content-Type': 'application/json',
                    'Conection': CONECTION,
                    'Referer': BASE + '/'
                },
                body: body
            });
            const j = JSON.parse(bodyOf(res) || '{}');
            if (j && j.access_token) {
                TOKEN = s(j.access_token);
                TOKEN_EXP = parseInt(j.expires_at, 10) || 0;
                return TOKEN;
            }
        } catch (e) { }
    }
    return TOKEN;
}

function token() {
    const now = Math.floor(Date.now() / 1000);
    if (TOKEN && (!TOKEN_EXP || TOKEN_EXP - 60 > now)) return TOKEN;
    return doEstablish() || TOKEN;
}

function apiGet(path) {
    const url = BASE + '/api/v1' + path;
    for (let i = 0; i < 2; i++) {
        const tk = token();
        if (!tk) continue;
        try {
            const t = fetchOnce(url, {
                'User-Agent': UA, 'Referer': BASE + '/',
                'AuthDog': 'Bearer ' + tk, 'Accept': 'application/json'
            });
            const j = JSON.parse(t || '{}');
            if (j && j.error && j.error.code) {
                TOKEN = ''; TOKEN_EXP = 0;
                continue;
            }
            return j || {};
        } catch (e) {
            TOKEN = ''; TOKEN_EXP = 0;
        }
    }
    return {};
}

function listOf(j) {
    const d = j && j.data;
    if (!d) return [];
    const out = [];
    for (let i = 0; i < d.length; i++) out.push(toVod(d[i]));
    return out;
}

function totalOf(j) {
    const p = j && j.page_result;
    return p ? (parseInt(p.total, 10) || 0) : 0;
}

// ---------- 映射 ----------

function fixPic(p) {
    let u = s(p).replace(/\\\//g, '/').trim();
    if (!u) return '';
    if (/^https?:\/\//.test(u)) return u;
    if (u.charAt(0) !== '/') u = '/' + u;
    return PIC + u;
}

function toVod(v) {
    const id = s(v.id);
    return {
        vod_id: id,
        vod_name: s(v.title),
        vod_pic: fixPic(v.coverphoto_h || v.coverphoto_v),
        vod_remarks: s(v.source_name) || s(v.updated_at).slice(0, 10),
        vod_year: '',
        vod_area: '',
        vod_lang: '',
        vod_actor: '',
        vod_director: '',
        vod_content: s(v.title),
        vod_play_from: 'H265',
        vod_play_url: '正片$' + id
    };
}

// ---------- 初始化 ----------

function init(ext) {
    let o = ext;
    if (typeof o === 'string') {
        try { o = JSON.parse(o); } catch (e) { o = null; }
    }
    if (o && o.ext !== undefined && !o.base) {
        o = o.ext;
        if (typeof o === 'string') {
            try { o = JSON.parse(o); } catch (e) { o = null; }
        }
    }
    if (o && o.base) BASE = String(o.base).replace(/\/+$/, '');
    TOKEN = '';
    TOKEN_EXP = 0;
}

// ---------- 筛选 ----------

function buildFilters() {
    const ropts = [{ n: '全部', v: '' }];
    for (let i = 0; i < REGIONS.length; i++) ropts.push({ n: REGIONS[i][1], v: REGIONS[i][0] });
    const topts = [{ n: '全部', v: '' }];
    for (let j = 0; j < TAGS.length; j++) topts.push({ n: TAGS[j][1], v: TAGS[j][0] });
    const out = {};
    for (let k = 0; k < CLASSES.length; k++) {
        out[CLASSES[k][0]] = [
            { key: 'region', name: '地区', value: ropts },
            { key: 'tag', name: '标签', value: topts }
        ];
    }
    return out;
}

function extOf(filter, extend) {
    let o = extend;
    if (typeof o === 'string') {
        try { o = JSON.parse(o); } catch (e) { o = null; }
    }
    if (!o) o = filter;
    if (typeof o === 'string') {
        try { o = JSON.parse(o); } catch (e) { o = null; }
    }
    return o || {};
}

// ---------- 列表 ----------

function home(filter) {
    const cls = [];
    for (let i = 0; i < CLASSES.length; i++) {
        cls.push({ type_id: CLASSES[i][0], type_name: CLASSES[i][1] });
    }
    return JSON.stringify({ class: cls, filters: buildFilters(), list: homeList() });
}

function homeList() {
    const qs = [
        '/video?state=2&current=1&pageSize=30',
        '/video?state=2&current=1&pageSize=18',
        '/video?state=2&current=1&pageSize=12',
        '/video?state=2&current=1&pageSize=8'
    ];
    for (let i = 0; i < qs.length; i++) {
        try {
            const list = listOf(apiGet(qs[i]));
            if (list.length) return list;
        } catch (e) { }
    }
    return [];
}

function homeVod() {
    return JSON.stringify({ list: homeList() });
}

function category(tid, pg, filter, extend) {
    const page = parseInt(pg, 10) || 1;
    const t = trim(tid);
    let rid = '';
    let tids = '';
    if (t.indexOf('r:') === 0) rid = t.slice(2);
    else if (t.indexOf('t:') === 0) tids = t.slice(2);

    const e = extOf(filter, extend);
    if (s(e.region)) rid = s(e.region);
    if (s(e.tag)) tids = s(e.tag);

    let q = '/video?state=2&current=' + page + '&pageSize=30';
    if (rid) q += '&region_id=' + q1(rid);
    if (tids) q += '&tag_ids=' + q1(tids);

    let j = {};
    try { j = apiGet(q); } catch (err) { j = {}; }
    const total = totalOf(j);
    const list = listOf(j);
    let pagecount = 9999;
    if (total) pagecount = Math.ceil(total / 30);
    else if (list.length < 30) pagecount = page;
    return JSON.stringify({
        page: page,
        pagecount: pagecount,
        limit: 30,
        total: total,
        list: list
    });
}

function getVideo(id) {
    const j = apiGet('/video?id=' + q1(id));
    const d = j && j.data;
    if (d && d.length) return d[0];
    return null;
}

function detail(id) {
    const ids = s(id).split(',');
    const list = [];
    for (let i = 0; i < ids.length; i++) {
        const vid = trim(ids[i]);
        if (!vid) continue;
        let v = null;
        try { v = getVideo(vid); } catch (e) { v = null; }
        if (!v) {
            list.push({
                vod_id: vid, vod_name: vid, vod_pic: '',
                vod_play_from: 'H265', vod_play_url: '正片$' + vid
            });
            continue;
        }
        const item = toVod(v);
        let tags = v.tag_names;
        let content = s(v.title);
        if (tags && tags.length) {
            const arr = [];
            for (let k = 0; k < tags.length; k++) arr.push(s(tags[k]));
            content += '\n标签：' + arr.join(' / ');
        }
        if (v.source_name) content += '\n来源：' + s(v.source_name);
        if (v.updated_at) {
            item.vod_pubdate = s(v.updated_at).slice(0, 10);
            content += '\n更新：' + s(v.updated_at).replace('T', ' ').slice(0, 16);
        }
        item.vod_content = content;
        list.push(item);
    }
    return JSON.stringify({ list: list });
}

function search(wd, quick) {
    const kw = trim(wd);
    if (!kw) return JSON.stringify({ list: [] });
    let j = {};
    try {
        j = apiGet('/video?state=2&title=' + q1(kw) + '&current=1&pageSize=30');
    } catch (e) { j = {}; }
    let list = listOf(j);
    if (!list.length) {
        try {
            const all = apiGet('/video?state=2&current=1&pageSize=30');
            const src = listOf(all);
            const low = kw.toLowerCase();
            list = [];
            for (let i = 0; i < src.length; i++) {
                if (s(src[i].vod_name).toLowerCase().indexOf(low) >= 0) list.push(src[i]);
            }
        } catch (e2) { list = []; }
    }
    return JSON.stringify({ list: list });
}

// ---------- 播放 ----------

function b64(bytes) {
    const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += T.charAt((n >> 18) & 63) + T.charAt((n >> 12) & 63) + T.charAt((n >> 6) & 63) + T.charAt(n & 63);
    }
    const rest = bytes.length - i;
    if (rest === 1) {
        const n = bytes[i] << 16;
        out += T.charAt((n >> 18) & 63) + T.charAt((n >> 12) & 63) + '==';
    } else if (rest === 2) {
        const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
        out += T.charAt((n >> 18) & 63) + T.charAt((n >> 12) & 63) + T.charAt((n >> 6) & 63) + '=';
    }
    return out;
}

function utf8Bytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) {
            out.push(0xC0 | (c >> 6));
            out.push(0x80 | (c & 63));
        } else if (c >= 0xD800 && c <= 0xDBFF) {
            const c2 = str.charCodeAt(++i);
            const cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
            out.push(0xF0 | (cp >> 18));
            out.push(0x80 | ((cp >> 12) & 63));
            out.push(0x80 | ((cp >> 6) & 63));
            out.push(0x80 | (cp & 63));
        } else {
            out.push(0xE0 | (c >> 12));
            out.push(0x80 | ((c >> 6) & 63));
            out.push(0x80 | (c & 63));
        }
    }
    return out;
}

function absolutePlaylist(pl, dir, key) {
    const lines = pl.split(/\r?\n/);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const t = trim(ln);
        if (!t) continue;
        if (t.charAt(0) === '#') {
            if (t.indexOf('#EXT-X-KEY') === 0) {
                if (key) {
                    out.push(ln.replace(/URI="[^"]*"/, 'URI="data:application/octet-stream;base64,' + key + '"'));
                } else {
                    out.push(ln);
                }
            } else if (t.indexOf('#EXT-X-MAP') === 0) {
                out.push(ln.replace(/URI="([^"]*)"/, function (m, u) {
                    if (/^(https?:)?\/\//.test(u) || u.indexOf('data:') === 0) return 'URI="' + u + '"';
                    return 'URI="' + OSS + '/' + dir + '/' + u + '"';
                }));
            } else {
                out.push(ln);
            }
        } else {
            if (/^(https?:)?\/\//.test(t)) out.push(t);
            else out.push(OSS + '/' + dir + '/' + t);
        }
    }
    return out.join('\n') + '\n';
}

// 死磕完整 playlist：必须见到 #EXT-X-ENDLIST
function fetchPlaylistHard(url, tries) {
    const n = tries || 6;
    let best = '';
    for (let i = 0; i < n; i++) {
        try {
            const t = fetchOnce(url, { 'User-Agent': UA });
            if (t && t.indexOf('#EXTM3U') >= 0) {
                best = t;
                if (t.indexOf('#EXT-X-ENDLIST') >= 0) return t;
            }
        } catch (e) { }
    }
    return '';
}

function play(flag, id) {
    let vid = trim(id);
    if (/^https?:\/\//.test(vid)) return JSON.stringify({ parse: 0, jx: 0, url: vid });
    if (!vid) return JSON.stringify({ parse: 0, jx: 0, url: '' });

    const wantH264 = trim(flag).toLowerCase().indexOf('h264') >= 0;
    const bare = vid.replace(/^h264:/, '');

    let v = null;
    try { v = getVideo(bare); } catch (e) { v = null; }
    if (!v) return JSON.stringify({ parse: 0, jx: 0, url: '' });

    if (wantH264) {
        const hp = s(v.highres_url);
        if (hp) {
            const hu = OSS + '/' + (hp.charAt(0) === '/' ? hp.slice(1) : hp);
            return JSON.stringify({ parse: 0, jx: 0, url: hu, header: { 'User-Agent': UA } });
        }
    }

    const key = s(v.h265_key);
    const path = s(v.h265_url);
    if (!path) {
        const hp = s(v.highres_url);
        if (hp) return JSON.stringify({ parse: 0, jx: 0, url: OSS + '/' + (hp.charAt(0) === '/' ? hp.slice(1) : hp), header: { 'User-Agent': UA } });
        return JSON.stringify({ parse: 0, jx: 0, url: '' });
    }

    const dir = path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/')) : '';
    const plUrl = OSS + '/' + (path.charAt(0) === '/' ? path.slice(1) : path);

    const pl = fetchPlaylistHard(plUrl, 6);
    if (!pl) {
        // 兜底：给 h264 原链，壳若认 key:// 还能救
        const hp = s(v.highres_url);
        if (hp) return JSON.stringify({ parse: 0, jx: 0, url: OSS + '/' + (hp.charAt(0) === '/' ? hp.slice(1) : hp), header: { 'User-Agent': UA } });
        return JSON.stringify({ parse: 0, jx: 0, url: plUrl, header: { 'User-Agent': UA } });
    }

    const txt = absolutePlaylist(pl, dir, key);
    const dataUri = 'data:application/x-mpegURL;base64,' + b64(utf8Bytes(txt));
    return JSON.stringify({ parse: 0, jx: 0, url: dataUri, header: { 'User-Agent': UA } });
}

// ---------- 杂项 ----------

function isVideo(url) { return /\.(m3u8|mp4|flv|mkv|ts|mov|m4s)(\?|$)/i.test(s(url)); }
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
    isVideo: isVideo,
    sniffer: sniffer,
    action: action,
    proxy: proxy,
    destroy: destroy
};
