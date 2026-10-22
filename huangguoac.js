// ============================================================
// 影视仓 / TVBox 本地包 · QuickJS spider (type:3 零服务器)
// 目标站：huangguoac.com（黄果短剧 · 前后端分离 JSON API）
//
// api.json:
//   { "type": 3, "api": "./js/huangguoac.js",
//     "ext": { "base": "https://huangguoac.com" } }
//
// API 测绘结论（2026-10 实测）：
//   GET /api/videos?page=N                      全库分页（122页/20条）
//   GET /api/videos/category/duanju?page=N&sort=new|hot|score|updated
//   GET /api/videos/<id>                        详情：episodes/tags/description
//   GET /api/videos/<id>/play?ep=N              分集播放（token TTL≈2h，现取）
//   GET /api/search?q=<kw>&page=N               搜索（tag 浏览已废弃，降级走这里）
//   GET /api/tags                               标签树（16 分类）
//
// vod_play_url 约定：分集存伪 id `<vid>-<ep>`，play() 现打 play 接口换新鲜 m3u8。
//
// 网络：全局函数 http(url, {headers}) -> { ok, status, content }（同 semao375 实证）
// ============================================================

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

let BASE = 'https://huangguoac.com';
let HEADERS = { 'User-Agent': UA, 'Referer': BASE + '/' };

// 可用 API 域名（按优先级；github.io / pages.dev 为静态镜像无 API，不参与）
const API_HOSTS = [
    'https://huangguoac.com',
    'https://huangguoac.net',
    'https://huangguoac6.com',
    'https://wy60j19s.cc'
];
let HOST_OK = '';

// 标签兜底（/api/tags 挂掉时保底菜单）
const FALLBACK_TAGS = [
    '校园', '古风', '都市', '大女主', '重生', '穿越', '赘婿', '霸总',
    '甜宠', '豪门', '逆袭', '系统', '修仙', '悬疑', '神医', '战神'
];

const MAX_TAG_MENU = 40; // 菜单长度上限，防分类列表过长

// ---------- 网络 ----------

function request(url, options) {
    const o = Object.assign({ async: false }, options || {});
    o.async = false;
    if (typeof http === 'function') return http(url, o);
    if (typeof req === 'function') return req(url, o);
    if (typeof net !== 'undefined' && net && typeof net.http === 'function') return net.http(url, o);
    throw new Error('no http binding');
}

function probe(host) {
    try {
        const res = request(host + '/api/tags', { headers: HEADERS });
        if (!res || res.ok === false) return false;
        const c = String(res.content || '');
        return c.charAt(0) === '{' && /"data"/.test(c);
    } catch (e) { return false; }
}

function fetchOnce(path, host) {
    const url = /^https?:\/\//.test(path) ? path : host + path;
    let lastErr = null;
    for (let i = 0; i < 2; i++) {
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

function fetchJson(path) {
    if (/^https?:\/\//.test(path)) return JSON.parse(fetchOnce(path, ''));
    const useHost = HOST_OK || BASE;
    try {
        const t = fetchOnce(path, useHost);
        HOST_OK = useHost;
        return JSON.parse(t);
    } catch (e) {
        for (let i = 0; i < API_HOSTS.length; i++) {
            const h = API_HOSTS[i];
            if (h === useHost) continue;
            if (probe(h)) {
                HOST_OK = h;
                BASE = h;
                HEADERS.Referer = h + '/';
                try { return JSON.parse(fetchOnce(path, h)); } catch (e2) { /* 下一个 */ }
            }
        }
        throw e;
    }
}

function dig(obj, keys) {
    for (let i = 0; i < keys.length; i++) {
        const v = obj && obj[keys[i]];
        if (v !== undefined && v !== null) return v;
    }
    return undefined;
}

// 列表响应取数组：data.items / data.list / data.videos / data 即数组
function pickList(j) {
    if (!j) return [];
    const d = j.data !== undefined ? j.data : j;
    if (Array.isArray(d)) return d;
    return dig(d, ['items', 'list', 'videos', 'rows', 'data']) || [];
}

// 分页元信息：实测信封 data.pagination{page,pages,size,total}
function pickPages(j, listLen) {
    if (!j) return 1;
    const d = j.data !== undefined ? j.data : j;
    const pg = d && d.pagination ? d.pagination : d;
    if (pg) {
        const p = dig(pg, ['pages', 'last_page', 'page_count', 'total_pages', 'totalPage']);
        if (p) return Number(p) || 1;
        const total = dig(pg, ['total', 'count', 'total_count']);
        if (total) return Math.max(1, Math.ceil(Number(total) / 20));
    }
    return listLen >= 20 ? 2 : 1; // 拿不到元信息时保守给下一页机会
}

// ---------- 工具 ----------

function stripTags(s) {
    return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function safeEp(s) {
    return String(s || '').replace(/[$#]/g, ' ').trim() || '正片';
}

function item(v) {
    const tags = Array.isArray(v.tags) ? v.tags : [];
    const tagNames = tags.map(function (t) {
        return typeof t === 'string' ? t : String(t.name || '');
    }).filter(Boolean);
    let remark = tagNames.slice(0, 3).join('·');
    const epn = Number(v.episode_count || v.total_episodes || 0);
    if (epn > 0) remark += (remark ? '·' : '') + epn + '集';
    if (Number(v.is_finished) === 1 || v.is_finished === true) remark += (remark ? '·' : '') + '完结';
    return {
        vod_id: String(v.id),
        vod_name: stripTags(v.title) || String(v.id),
        vod_pic: String(v.cover || ''),
        vod_remarks: remark,
        vod_year: /^\d{4}/.test(String(v.created_at || '')) ? String(v.created_at).slice(0, 4) : ''
    };
}

// ---------- 分类菜单 ----------

// 实测 /api/tags：data.categories[16]{code,id,name,sort,tags[]}，tag{name,is_hot,...}；data.hot=[]
function tagMenu() {
    const names = [];
    const hot = [];
    try {
        const j = fetchJson('/api/tags');
        const d = j.data !== undefined ? j.data : j;
        const cates = Array.isArray(d) ? d : (dig(d, ['categories', 'cates', 'tags', 'items', 'list']) || []);
        for (let i = 0; i < cates.length; i++) {
            const g = cates[i];
            if (Array.isArray(g && g.tags)) {
                for (let k = 0; k < g.tags.length; k++) {
                    const t = g.tags[k];
                    const n = typeof t === 'string' ? t : String(t.name || '');
                    if (!n) continue;
                    if (t.is_hot) hot.push(n); else names.push(n);
                }
            } else {
                const n = typeof g === 'string' ? g : String(g.name || '');
                if (n) names.push(n);
            }
        }
    } catch (e) { /* FALLBACK_TAGS 兜底 */ }
    const merged = hot.concat(names).filter(function (n, i, a) { return a.indexOf(n) === i; });
    if (!merged.length) return FALLBACK_TAGS.slice();
    return merged.slice(0, MAX_TAG_MENU);
}

function classList() {
    const cls = [
        { type_id: 'c:duanju', type_name: '短剧' },
        { type_id: 'all', type_name: '全部' }
    ];
    const tags = tagMenu();
    for (let i = 0; i < tags.length; i++) {
        cls.push({ type_id: 't:' + tags[i], type_name: tags[i] });
    }
    return cls;
}

function filtersFor(tid) {
    if (tid && tid.indexOf('c:') === 0) {
        return {
            sort: {
                key: 'sort', name: '排序',
                value: [
                    { n: '最新', v: 'new' },
                    { n: '最热', v: 'hot' },
                    { n: '评分', v: 'score' },
                    { n: '更新', v: 'updated' }
                ]
            }
        };
    }
    return {};
}

// ---------- 列表抓取 ----------

function listPage(path) {
    try {
        const j = fetchJson(path);
        const raw = pickList(j);
        const list = raw.map(item).filter(function (v) { return v.vod_id && v.vod_name; });
        return { list: list, pages: pickPages(j, list.length) };
    } catch (e) {
        return { list: [], pages: 1 };
    }
}

// ---------- 入口 ----------

function init(ext) {
    try {
        const o = typeof ext === 'string' ? JSON.parse(ext) : (ext || {});
        if (o.base) {
            BASE = String(o.base).replace(/\/+$/, '');
            HEADERS.Referer = BASE + '/';
            HOST_OK = '';
        }
    } catch (e) { /* 默认域名 */ }
}

function home(filter) {
    const r = listPage('/api/videos/category/duanju?page=1&sort=new');
    const cls = classList();
    // filters 按 class 组装（type:3 约定 filters[type_id]）
    const filters = {};
    for (let i = 0; i < cls.length; i++) filters[cls[i].type_id] = filtersFor(cls[i].type_id);
    return JSON.stringify({ class: cls, list: r.list, filters: filters });
}

function homeVod() {
    const r = listPage('/api/videos/category/duanju?page=1&sort=new');
    return JSON.stringify({ list: r.list });
}

function category(tid, pg, filter, extend) {
    const page = Number(pg || 1) || 1;
    const t = String(tid || '');
    let path = '';
    const sort = (extend && extend.sort) ? String(extend.sort) : 'new';
    if (t.indexOf('c:') === 0) {
        const slug = t.slice(2);
        path = '/api/videos/category/' + encodeURIComponent(slug) + '?page=' + page + '&sort=' + sort;
    } else if (t === 'all') {
        path = '/api/videos?page=' + page;
    } else if (t.indexOf('t:') === 0) {
        // 标签浏览接口已废弃（total=0），降级为站内搜索
        const kw = t.slice(2);
        path = '/api/search?q=' + encodeURIComponent(kw) + '&page=' + page;
    } else {
        // 兼容裸 id / 裸关键词
        if (/^\d+$/.test(t)) path = '/api/videos?page=' + page;
        else path = '/api/search?q=' + encodeURIComponent(t) + '&page=' + page;
    }
    const r = listPage(path);
    return JSON.stringify({
        page: page,
        pagecount: r.pages,
        limit: r.list.length || 20,
        total: r.pages * (r.list.length || 20),
        list: r.list
    });
}

function detail(id) {
    const sid = String(id || '');
    if (sid.indexOf('-') > 0) { // 伪分集 id 直接还原
        const p = sid.split('-');
        return detailVid(p[0]);
    }
    return detailVid(sid);
}

function detailVid(vid) {
    let d = null;
    try {
        const j = fetchJson('/api/videos/' + encodeURIComponent(vid));
        d = (j && j.data) ? j.data : j;
    } catch (e) { d = null; }
    if (!d) {
        return JSON.stringify({
            list: [{ vod_id: vid, vod_name: vid, vod_pic: '', vod_content: '', vod_play_from: '', vod_play_url: '' }]
        });
    }
    const eps = Array.isArray(d.episodes) ? d.episodes : [];
    const tags = Array.isArray(d.tags) ? d.tags.map(function (t) {
        return typeof t === 'string' ? t : String(t.name || '');
    }).filter(Boolean) : [];
    const parts = [];
    if (eps.length) {
        for (let i = 0; i < eps.length; i++) {
            const ep = eps[i];
            const n = Number(ep.ep_num || (i + 1));
            const title = stripTags(ep.title) || ('第' + n + '集');
            parts.push(safeEp(title) + '$' + vid + '-' + n);
        }
    } else {
        parts.push('第1集$' + vid + '-1');
    }
    const actors = Array.isArray(d.actors) ? d.actors.map(stripTags).filter(Boolean).join(',') : '';
    let remark = tags.slice(0, 3).join('·');
    const epn = Number(d.episode_count || d.total_episodes || eps.length || 0);
    if (epn > 0) remark += (remark ? '·' : '') + epn + '集';
    return JSON.stringify({
        list: [{
            vod_id: String(d.id || vid),
            vod_name: stripTags(d.title) || vid,
            vod_pic: String(d.cover || ''),
            vod_remarks: remark,
            vod_year: /^\d{4}/.test(String(d.created_at || '')) ? String(d.created_at).slice(0, 4) : '',
            vod_area: '短剧',
            vod_actor: actors,
            vod_director: (d.author && d.author.name) ? stripTags(d.author.name) : '',
            vod_class: tags.join(','),
            vod_content: stripTags(d.description),
            vod_play_from: 'huangguo',
            vod_play_url: parts.join('#')
        }]
    });
}

function search(key, quick, pg) {
    const k = String(key || '').trim();
    const page = Number(pg || 1) || 1;
    if (!k) return JSON.stringify({ list: [], page: 1, pagecount: 1, limit: 0, total: 0 });
    const r = listPage('/api/search?q=' + encodeURIComponent(k) + '&page=' + page);
    return JSON.stringify({
        page: page,
        pagecount: r.pages,
        limit: r.list.length || 0,
        total: r.pages * (r.list.length || 0),
        list: r.list
    });
}

// ---------- 播放 ----------

function play(flag, id, vipFlags) {
    const s = String(id || '');
    if (/^https?:\/\//.test(s)) {
        return JSON.stringify({ parse: 0, jx: 0, url: s, header: HEADERS });
    }
    const dash = s.indexOf('-');
    if (dash < 0) {
        return JSON.stringify({ parse: 0, jx: 0, url: '', header: HEADERS });
    }
    const vid = s.slice(0, dash);
    const ep = s.slice(dash + 1).replace(/[^0-9]/g, '') || '1';
    try {
        const j = fetchJson('/api/videos/' + encodeURIComponent(vid) + '/play?ep=' + ep);
        const d = (j && j.data) ? j.data : j;
        const url = String((d && d.video_url) || '');
        if (!url) throw new Error('no video_url');
        return JSON.stringify({ parse: 0, jx: 0, url: url, header: HEADERS });
    } catch (e) {
        // token 过期兜底：重探域名再取一次
        try {
            HOST_OK = '';
            const j2 = fetchJson('/api/videos/' + encodeURIComponent(vid) + '/play?ep=' + ep);
            const d2 = (j2 && j2.data) ? j2.data : j2;
            const url2 = String((d2 && d2.video_url) || '');
            return JSON.stringify({ parse: 0, jx: 0, url: url2, header: HEADERS });
        } catch (e2) {
            return JSON.stringify({ parse: 0, jx: 0, url: '', header: HEADERS });
        }
    }
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
