// ============================================================
// 影视仓 / TVBox type:3 零服务器 spider
// 站：m-qat.itstar.tw（本色 Bense，React SPA + App API）
// 播放：OSS 公开 h265 fMP4，key 内联成 data URI —— 全程不需要任何服务器
//
// json:
//   { "type": 3, "api": "在线 js 地址", "ext": { "base": "https://m-qat.itstar.tw" } }
//
// 入口约定（影视仓 assets/js/lib/spider.js 胶水层实证）：
//   export default { init, home, homeVod, category, detail, search, play }
//   所有方法返回 **JSON 字符串**
// 网络：全局函数 http(url, {async:false}) -> { ok, status, content }
// 铁律：全同步。QuickJS 不 pump 微任务，Promise 永不 resolve。
// ============================================================

const DEF_BASE = 'https://m-qat.itstar.tw';
const OSS = 'https://pkm4-qat-vod-original.oss-accelerate.aliyuncs.com';
const PIC = 'https://pkm4-qat-vod-preview.oss-accelerate.aliyuncs.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DEVICE_ID = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
// device_id 固定的 AES-128-CBC 结果，恒定；无需在 QuickJS 里实现 AES
const CONECTION = 'KXUEmafncA8rBXPkhQs2wcKBargtbV9+bZREhW8MY1d4B8FFFkH5wsMMQpmchQfc';

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
    ['r:36919976124219395', '非欧美'],
    ['r:69211063744200707', '北海道'],
    ['r:275615047298977792', '地球'],
    ['t:48564968819261445', '潮吹'],
    ['t:48564769438826501', '口交'],
    ['t:60893248415072261', '重口味'],
    ['t:61229774772633603', '严选'],
    ['t:87309771035639811', '蒙面'],
    ['t:48564838760898561', '3P']
];

let BASE = DEF_BASE;
let TOKEN = '';
let TOKEN_EXP = 0;

// ---------- 网络 ----------

function request(url, options) {
    const o = Object.assign({ async: false }, options || {});
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

function fetchText(url, headers) {
    let lastErr = null;
    for (let i = 0; i < 3; i++) {
        try {
            const res = request(url, { headers: headers || apiHeaders() });
            const t = bodyOf(res);
            if (t) return t;
            lastErr = new Error('empty body');
        } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('fetch failed');
}

function fetchJson(url, headers) {
    const t = fetchText(url, headers);
    return JSON.parse(t);
}

function apiHeaders() {
    const h = {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Referer': BASE + '/',
        'Origin': BASE
    };
    if (TOKEN) h['AuthDog'] = 'Bearer ' + TOKEN;
    return h;
}

// ---------- 鉴权（免注册 establish） ----------

function token() {
    const now = Math.floor(Date.now() / 1000);
    if (TOKEN && TOKEN_EXP > now + 120) return TOKEN;
    const body = JSON.stringify({
        device_id: DEVICE_ID,
        device_type: 'cookie',
        invite_code: '',
        os_version: 'iOS 17.5',
        phone_device: 'iPhone 15 Pro',
        version: '1.2.441',
        is_first: 1
    });
    const res = request(BASE + '/api/v1/member/establish', {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Conection': CONECTION,
            'Referer': BASE + '/',
            'Origin': BASE
        },
        body: body
    });
    const j = JSON.parse(bodyOf(res));
    if (!j || !j.access_token) throw new Error('establish failed');
    TOKEN = j.access_token;
    TOKEN_EXP = j.expires_at ? Number(j.expires_at) : (Math.floor(Date.now() / 1000) + 3600);
    return TOKEN;
}

function apiGet(path) {
    for (let i = 0; i < 2; i++) {
        token();
        const t = fetchText(BASE + '/api/v1' + path, apiHeaders());
        let j;
        try { j = JSON.parse(t); } catch (e) { throw new Error('bad json'); }
        if (j && j.error) {
            // token 过期 / 无效 -> 重取一次
            TOKEN = '';
            TOKEN_EXP = 0;
            if (i === 0) continue;
            throw new Error(j.error.message || 'api error');
        }
        return j;
    }
    return {};
}

// ---------- 工具 ----------

function s(v) { return v === undefined || v === null ? '' : String(v); }

function fixPic(p) {
    let u = s(p).replace(/\\\//g, '/').trim();
    if (!u) return '';
    if (/^https?:\/\//.test(u)) return u;
    if (u.charAt(0) !== '/') u = '/' + u;
    return PIC + u;
}

function q1(v) { return encodeURIComponent(s(v)); }

// ---------- 映射 ----------

function toVod(v) {
    const id = s(v.id);
    return {
        vod_id: id,
        vod_name: s(v.title),
        vod_pic: fixPic(v.coverphoto_h || v.coverphoto_v),
        vod_remarks: s(v.source_name),
        vod_year: '',
        vod_area: '',
        vod_lang: '',
        vod_actor: '',
        vod_director: '',
        vod_content: s(v.title),
        vod_play_from: 'h265',
        vod_play_url: '正片$' + id
    };
}

function listOf(j) {
    const d = j && j.data;
    const out = [];
    if (d && d.length) {
        for (let i = 0; i < d.length; i++) out.push(toVod(d[i]));
    }
    return out;
}

function totalOf(j) {
    const p = j && j.page_result;
    return p && p.total ? Number(p.total) : 0;
}

// ---------- 接口 ----------

function init(ext) {
    let o = ext;
    if (typeof o === 'string') {
        try { o = JSON.parse(o); } catch (e) { o = null; }
    }
    // 客户端可能包一层 { stype, skey, ext }
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

function home(filter) {
    const cls = [];
    for (let i = 0; i < CLASSES.length; i++) {
        cls.push({ type_id: CLASSES[i][0], type_name: CLASSES[i][1] });
    }
    let list = [];
    try {
        list = listOf(apiGet('/video?state=2&current=1&pageSize=30'));
    } catch (e) { list = []; }
    return JSON.stringify({ class: cls, list: list });
}

function homeVod() {
    let list = [];
    try {
        list = listOf(apiGet('/video?state=2&current=1&pageSize=30'));
    } catch (e) { list = []; }
    return JSON.stringify({ list: list });
}

function category(tid, pg, filter, extend) {
    const page = parseInt(pg, 10) || 1;
    const t = s(tid);
    let q = '/video?state=2&current=' + page + '&pageSize=30';
    if (t.indexOf('r:') === 0) q += '&region_id=' + q1(t.slice(2));
    else if (t.indexOf('t:') === 0) q += '&tag_id=' + q1(t.slice(2));
    let j = {};
    try { j = apiGet(q); } catch (e) { j = {}; }
    const total = totalOf(j);
    return JSON.stringify({
        page: page,
        pagecount: total ? Math.ceil(total / 30) : 9999,
        limit: 30,
        total: total,
        list: listOf(j)
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
        const vid = ids[i].trim();
        if (!vid) continue;
        let v = null;
        try { v = getVideo(vid); } catch (e) { v = null; }
        if (!v) {
            list.push({ vod_id: vid, vod_name: vid, vod_pic: '', vod_play_from: 'h265', vod_play_url: '正片$' + vid });
            continue;
        }
        const item = toVod(v);
        // 详情页补充：标签、更新日期
        let tags = v.tag_names;
        if (tags && tags.length) {
            const arr = [];
            for (let k = 0; k < tags.length; k++) arr.push(s(tags[k]));
            item.vod_content = s(v.title) + '\n标签：' + arr.join(' / ');
        }
        if (v.updated_at) item.vod_pubdate = s(v.updated_at).slice(0, 10);
        list.push(item);
    }
    return JSON.stringify({ list: list });
}

function search(wd, quick) {
    const kw = s(wd).trim();
    if (!kw) return JSON.stringify({ list: [] });
    let j = {};
    try {
        j = apiGet('/video?state=2&title=' + q1(kw) + '&current=1&pageSize=30');
    } catch (e) { j = {}; }
    let list = listOf(j);
    // 关键词兜底本地过滤一次（服务端有时返回宽泛结果）
    if (!list.length) {
        try {
            const all = apiGet('/video?state=2&current=1&pageSize=30');
            list = listOf(all);
            const out = [];
            for (let i = 0; i < list.length; i++) {
                if (s(list[i].vod_name).toLowerCase().indexOf(kw.toLowerCase()) >= 0) out.push(list[i]);
            }
            list = out;
        } catch (e2) { list = []; }
    }
    return JSON.stringify({ list: list });
}

// ---------- 播放：把 OSS 上的 playlist 改写成自包含 m3u8 ----------

function absolutePlaylist(pl, dir, key) {
    const lines = String(pl).split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const ln = raw.replace(/\r$/, '');
        const t = ln.replace(/^\s+|\s+$/g, '');
        if (!t) { out.push(ln); continue; }
        if (t.charAt(0) === '#') {
            if (t.indexOf('#EXT-X-KEY') === 0) {
                // URI="hls.key" -> data URI 内联真实 key，播放器不必再请求
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

function play(flag, id) {
    let vid = s(id).replace(/^\s+|\s+$/g, '');
    // 直接给了地址
    if (/^https?:\/\//.test(vid)) return JSON.stringify({ parse: 0, jx: 0, url: vid });
    if (!vid) return JSON.stringify({ parse: 0, jx: 0, url: '' });

    let v = null;
    try { v = getVideo(vid); } catch (e) { v = null; }
    if (!v) return JSON.stringify({ parse: 0, jx: 0, url: '' });

    const key = s(v.h265_key);
    const path = s(v.h265_url) || s(v.highres_url);
    if (!path) return JSON.stringify({ parse: 0, jx: 0, url: '' });

    const dir = path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/')) : '';
    const plUrl = OSS + '/' + path;

    let pl = '';
    try { pl = fetchText(plUrl, { 'User-Agent': UA }); } catch (e) { pl = ''; }

    // playlist 拿不到：直返分片目录（极少数情况），交给播放器自己撞
    if (!pl || pl.indexOf('#EXTM3U') < 0) {
        return JSON.stringify({ parse: 0, jx: 0, url: plUrl });
    }

    const txt = absolutePlaylist(pl, dir, key);
    const dataUri = 'data:application/x-mpegURL;charset=UTF-8,' + encodeURIComponent(txt);
    return JSON.stringify({ parse: 0, jx: 0, url: dataUri, header: { 'User-Agent': UA } });
}

// ---------- 杂项（缺了客户端会抛） ----------

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
