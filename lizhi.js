/*
 * 荔枝短剧 liz03.com —— 影视仓 spider (type:3 / .js)
 * 站方：Nuxt3 SPA + JSON API (/api/v1)
 * 列表：/api/v1/drama/list?categoryId=&page=&size=50&sort=hot|latest
 * 标签：/api/v1/tag/<slug>?page=&size=     全标签 /api/v1/tag/list
 * 专题：/api/v1/topic/<slug>?page=&tab=new|hot
 * 详情：/api/v1/drama/<id>                  集表：/api/v1/drama/<id>/episodes
 * 播放：/api/v1/drama/<id>/ep/<n> → data.playbackUrl (m3u8 + AES-128)
 * 搜索：/api/v1/search?keyword=&page=
 *
 * 硬规则（v2 修复）：
 *   · init() 内绝不发网络请求 —— 电视端一超时整站无分类
 *   · 分类表在 home() 里静态返回，先出分类再拉内容
 *   · 导出扁平函数，键名 isVideoFormat（不是 isVideo）
 *   · 全站单域名 liz03.com，不做多域探活
 */

const UA = 'Mozilla/5.0 (Linux; Android 13; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const HOST = 'https://liz03.com';
const SIZE = 50;

const CATS = [
    [376, '都市'], [486, 'cos'], [377, '情感'], [378, '古风'],
    [379, '玄幻'], [380, '悬疑'], [381, '漫剧'], [389, '更新']
];

const TOPICS = [
    ['jin-bo', '新剧推荐'], ['lizhi-original', '最骚原创'],
    ['xianzhe', '贤者时间'], ['guess', '猜你喜欢']
];

const TAGLIST = [
    '魔改', '萝莉', '母女', 'NTR', '兄妹', '邻居', '车震', 'SM', '滥交', '淫乱',
    '农村', '绿帽', '专属母狗', '乱伦', '大学生活', '女神', '父女', '母子', '后宫', '乡村',
    '人妻', '校园', '超能力', '女总裁', '霸总', '丧尸', '娱乐圈', '同性', '熟女', '短发',
    '虐恋', '同事', '职场', '年下', '求生', '武侠', '民国', '玄幻', '仙侠', '奇幻',
    '科幻', '脑洞', '志怪', '悬疑', '犯罪', '刑侦', '种田', '灵异', '恐怖', '惊悚',
    '恋爱', '古风', '搞笑', '今日更新', '本周上新', '连载中', '已完结', '女性成长', '商战', '战神',
    '赘婿', '逆袭', '动作', '喜剧', '现言', '爱情', '甜宠', '青春', '都市', '家庭',
    '复仇', '穿越', '重生', '男同', '女同', '古装', '古言', '宫斗', '权谋', '女性向'
];

// 中文标签 → 站方 slug（站方 API 只认 slug，中文直传 404）
const TAGSLUG = {
    '魔改': 'moga', '萝莉': 'loli', '母女': 'munv', 'NTR': 'ntr', '兄妹': 'xiongmei',
    '邻居': 'linju', '车震': 'chezhen', 'SM': 'sm', '滥交': 'lanjiao', '淫乱': 'yinluan',
    '农村': 'nongcun', '绿帽': 'lvmao', '专属母狗': 'zhuanshumugou', '乱伦': 'luanlun',
    '大学生活': 'daxueshenghuo', '女神': 'nvshen', '父女': 'funv', '母子': 'muzi',
    '后宫': 'hougong', '乡村': 'xiangcun', '人妻': 'renqi', '校园': 'xiaoyuan',
    '超能力': 'chaonengli', '女总裁': 'nvzongcai', '霸总': 'bazong', '丧尸': 'sangshi',
    '娱乐圈': 'yulequan', '同性': 'tongxing', '熟女': 'shunv', '短发': 'duanfa',
    '虐恋': 'nuelian', '同事': 'tongshi', '职场': 'zhichang', '年下': 'nianxia',
    '求生': 'qiusheng', '武侠': 'wuxia', '民国': 'minguo', '玄幻': 'xuanhuan',
    '仙侠': 'xianxia', '奇幻': 'qihuan', '科幻': 'kehuan', '脑洞': 'naodong',
    '志怪': 'zhiguai', '悬疑': 'xuanyi', '犯罪': 'fanzui', '刑侦': 'xingzhen',
    '种田': 'zhongtian', '灵异': 'lingyi', '恐怖': 'kongbu', '惊悚': 'jingsong',
    '恋爱': 'lianai', '古风': 'gufeng', '搞笑': 'gaoxiao', '今日更新': 'jinrigengxin',
    '本周上新': 'benzhoushangxin', '连载中': 'lianzai', '已完结': 'yiwanjie',
    '女性成长': 'nvxingchengzhang', '商战': 'shangzhan', '战神': 'zhanshen',
    '赘婿': 'zhuixu', '逆袭': 'nixi', '动作': 'dongzuo', '喜剧': 'xiju',
    '现言': 'xianyan', '爱情': 'aiqing', '甜宠': 'tianchong', '青春': 'qingchun',
    '都市': 'dushi', '家庭': 'jiating', '复仇': 'fuchou', '穿越': 'chuanyue',
    '重生': 'chongsheng', '男同': 'nantong', '女同': 'nvtong', '古装': 'guzhuang',
    '古言': 'guyan', '宫斗': 'gongdou', '权谋': 'quanmou', '女性向': 'nvxingxiang'
};

const FILTERS = {
    sort: {
        key: 'sort', name: '排序',
        value: [{ n: '最新', v: 'latest' }, { n: '最热', v: 'hot' }]
    },
    tags: {
        key: 'tags', name: '标签',
        value: TAGLIST.map(function (t) { return { n: t, v: t }; })
    }
};

// ---------------- 底层请求（自适应影视仓/猫影视/其他壳子） ----------------

function request(url, opt) {
    var o = Object.assign({ async: false, method: 'GET' }, opt || {});
    o.async = false;
    if (typeof http === 'function') return http(url, o);
    if (typeof req === 'function') return req(url, o);
    if (typeof net !== 'undefined' && net && typeof net.http === 'function') return net.http(url, o);
    throw new Error('no http binding');
}

function req(url) {
    try {
        const r = request(url, {
            method: 'GET',
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Origin': HOST,
                'Referer': HOST + '/'
            }
        });
        if (r === null || r === undefined) return null;
        if (typeof r === 'string') return r;
        if (typeof r === 'object') {
            if (typeof r.content === 'string') return r.content;
            if (typeof r.body === 'string') return r.body;
            if (typeof r.data === 'string') return r.data;
            if (typeof r.text === 'string') return r.text;
            if (typeof r === 'string') return r;
            try { return JSON.stringify(r); } catch (e) { return null; }
        }
        return null;
    } catch (e) {
        return null;
    }
}

function wait(ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { /* 站方有频率闸，只能忙等 */ }
}

function json(url) {
    // 站方 1 秒内多请求回 500「请求过于频繁」，罚期可能跨秒——退避爬梯铺到 ~7 秒
    const back = [0, 400, 1000, 2000, 3500];
    for (let attempt = 0; attempt < back.length; attempt++) {
        if (back[attempt]) wait(back[attempt]);
        const t = req(url);
        if (!t) continue;
        let j = null;
        try { j = JSON.parse(t); } catch (e) { j = null; }
        if (!j) continue;
        if (j.success === false) {
            if (String(j.message || '').indexOf('频繁') >= 0) continue;
            return null;
        }
        return j.data !== undefined ? j.data : j;
    }
    return null;
}

// ---------------- 数据整形 ----------------

function tagNames(it) {
    if (!it || !it.tags || !it.tags.length) return '';
    const out = [];
    for (let i = 0; i < it.tags.length; i++) out.push(it.tags[i].name);
    return out.join(',');
}

function cover(c) {
    if (!c) return '';
    let u = String(c).replace(/&amp;/g, '&');
    if (u.indexOf('//') === 0) u = 'https:' + u;
    return u;
}

function vod(it) {
    if (!it) return null;
    const tags = tagNames(it);
    const eps = Number(it.totalEpisodes || 0);
    const cur = Number(it.publishedEpisodeCount || 0);
    let rem = it.coverBadge ? String(it.coverBadge) : '';
    if (it.coverProgress) rem = rem ? rem + ' · ' + it.coverProgress : String(it.coverProgress);
    if (!rem) {
        if (it.partial && cur) rem = '更新至' + cur + '集';
        else if (eps) rem = '全' + eps + '集';
    }
    return {
        vod_id: String(it.id),
        vod_name: it.title || '',
        vod_pic: cover(it.coverUrl),
        vod_remarks: rem,
        vod_year: it.publishedAt ? String(it.publishedAt).slice(0, 4) : '',
        vod_content: it.description || '',
        vod_class: tags
    };
}

function listOf(d) {
    if (!d) return [];
    const arr = d.dramas || (d.page && d.page.items) || d.items || [];
    const out = [];
    if (!arr || !arr.length) return out;
    for (let i = 0; i < arr.length; i++) {
        const v = vod(arr[i]);
        if (v) out.push(v);
    }
    return out;
}

// ---------------- 类目 ----------------

function classList() {
    const out = [
        { type_id: 'hot_all', type_name: '全站最热' },
        { type_id: 'all_latest', type_name: '全站最新' }
    ];
    for (let i = 0; i < CATS.length; i++) {
        out.push({ type_id: 'cat_' + CATS[i][0], type_name: CATS[i][1] });
    }
    for (let i = 0; i < TOPICS.length; i++) {
        out.push({ type_id: 'topic_' + TOPICS[i][0], type_name: TOPICS[i][1] });
    }
    return out;
}

function listPath(tid, p, sort) {
    const id = String(tid || 'all_latest');
    const s = sort === 'hot' ? 'hot' : 'latest';
    if (id.indexOf('cat_') === 0) {
        return '/api/v1/drama/list?categoryId=' + id.slice(4) + '&page=' + p + '&size=' + SIZE + '&sort=' + s;
    }
    if (id.indexOf('topic_') === 0) {
        const tab = s === 'hot' ? 'hot' : 'new';
        return '/api/v1/topic/' + id.slice(6) + '?page=' + p + '&size=' + SIZE + '&tab=' + tab;
    }
    if (id === 'hot_all') {
        return '/api/v1/drama/list?page=' + p + '&size=' + SIZE + '&sort=hot';
    }
    return '/api/v1/drama/list?page=' + p + '&size=' + SIZE + '&sort=' + s;
}

function homeList() {
    const d = json(HOST + '/api/v1/homepage');
    const hp = (d && d.homepage) ? d.homepage : d;
    const seen = {};
    const list = [];
    if (hp && hp.topics && hp.topics.length) {
        for (let i = 0; i < hp.topics.length && list.length < 40; i++) {
            const ds = hp.topics[i].dramas || [];
            for (let k = 0; k < ds.length && list.length < 40; k++) {
                const v = vod(ds[k]);
                if (!v || seen[v.vod_id]) continue;
                seen[v.vod_id] = 1;
                list.push(v);
            }
        }
    }
    if (!list.length) {
        const d2 = json(HOST + '/api/v1/drama/list?page=1&size=' + SIZE + '&sort=hot');
        const l2 = listOf(d2);
        for (let i = 0; i < l2.length; i++) list.push(l2[i]);
    }
    return list;
}

// ---------------- 主接口（扁平导出，QuickJS 友好） ----------------

function init(ext) { return ''; }

function home(filter) {
    return JSON.stringify({
        class: classList(),
        filters: FILTERS,
        list: homeList()
    });
}

function homeVod() {
    return JSON.stringify({ list: homeList() });
}

function category(tid, pg, filter, extend) {
    const p = Number(pg) || 1;
    const ext = extend || {};
    const sort = ext.sort || 'latest';
    const d = json(HOST + listPath(tid, p, sort));
    let list = listOf(d);

    const tag = ext.tags || '';
    if (tag && list.length) {
        const keep = [];
        for (let i = 0; i < list.length; i++) {
            if (String(list[i].vod_class || '').indexOf(tag) >= 0) keep.push(list[i]);
        }
        list = keep;
        if (!list.length) {
            const slug = TAGSLUG[tag] || tag;
            const td = json(HOST + '/api/v1/tag/' + encodeURIComponent(slug) + '?page=1&size=' + SIZE);
            list = listOf(td);
        }
    }

    const meta = (d && d.page) ? d.page : {};
    const hasMore = meta.hasMore;
    const pagecount = (hasMore === false || !list.length) ? p : p + 1;
    return JSON.stringify({
        page: p,
        pagecount: pagecount,
        limit: SIZE,
        total: 9999,
        list: list
    });
}

function detail(id) {
    const did = String(id || '').replace(/[^0-9]/g, '');
    if (!did) return JSON.stringify({ list: [] });
    const d = json(HOST + '/api/v1/drama/' + did);
    if (!d) return JSON.stringify({ list: [] });

    let eps = json(HOST + '/api/v1/drama/' + did + '/episodes');
    if (eps && eps.episodes) eps = eps.episodes;
    if (!eps || !eps.length || typeof eps.length !== 'number') eps = [];

    // 只列 available !== false（未上架集点开会 302 跳网页）
    const ok = [];
    for (let i = 0; i < eps.length; i++) {
        if (eps[i] && eps[i].available === false) continue;
        ok.push(eps[i]);
    }
    eps = ok;

    if (!eps.length) {
        const n = Number(d.publishedEpisodeCount || 0) || Number(d.totalEpisodes || 0) || 0;
        for (let i = 1; i <= n; i++) eps.push({ epNo: i });
    }

    const eps2 = [];
    for (let i = 0; i < eps.length; i++) {
        const no = Number(eps[i].epNo || eps[i].episodeNumber || (i + 1)) || (i + 1);
        eps2.push('第' + no + '集$' + did + '-' + no);
    }
    if (!eps2.length) eps2.push('第1集$' + did + '-1');

    const v = vod(d) || { vod_id: did, vod_name: '' };
    v.vod_id = did;
    const cur = Number(d.publishedEpisodeCount || 0) || eps.length;
    v.vod_remarks = (d.partial ? '更新至' + cur + '集' : '全' + (Number(d.totalEpisodes || 0) || eps.length) + '集');
    v.vod_play_from = 'lizhi';
    // 单线路：分集结构必须是 集名$id 成对串（$$$ 是线路分隔符，不是名称/地址分栏）
    v.vod_play_url = eps2.join('#');

    if (d.related && d.related.length) {
        const rel = [];
        for (let i = 0; i < d.related.length && i < 20; i++) {
            const r = vod(d.related[i]);
            if (r) rel.push(r);
        }
        if (rel.length) v.vod_relevance = rel;
    }
    return JSON.stringify({ list: [v] });
}

const EP_CACHE = {}; // did-no -> playbackUrl，进程级缓存：同集二次播放零请求

// master.m3u8 带多码率变体时，壳子对变体跳转的容错很差；直接解析成变体直链交出去（miji followMaster 同法）
function followMaster(m, base) {
    if (!m || m.indexOf('#EXT-X-STREAM-INF') < 0) return '';
    const lines = m.split('\n');
    let best = '', bestBw = -1;
    for (let i = 0; i < lines.length; i++) {
        const L = lines[i];
        if (L.indexOf('#EXT-X-STREAM-INF') !== 0) continue;
        const bw = Number((L.match(/BANDWIDTH=(\d+)/) || [])[1] || 0);
        let nx = '';
        for (let j = i + 1; j < lines.length; j++) {
            const c = lines[j].replace(/^\s+|\s+$/g, '');
            if (c && c.charAt(0) !== '#') { nx = c; break; }
        }
        if (!nx) continue;
        // 优先 480p 档（约 1.38Mbps），没有就取带宽中位——别贪最高码率，电视端 3 倍速差
        if (/480p/i.test(L) && !best) { best = nx; bestBw = bw; break; }
        if (bw > bestBw && bw <= 2000000) { bestBw = bw; best = nx; }
    }
    if (!best) return '';
    if (best.charAt(0) === '/') {
        const o = String(base || HOST).match(/^https?:\/\/[^\/]+/);
        best = (o ? o[0] : HOST) + best;
    }
    return best;
}

function play(flag, id, flags) {
    let raw = String(id === undefined || id === null ? '' : id);
    const cut = raw.indexOf('$');
    if (cut >= 0) raw = raw.slice(cut + 1); // 壳子可能传 集名$id 整串（miji 先例），取末段
    raw = raw.trim();
    try { raw = decodeURIComponent(raw); } catch (e) { }
    let did = '', no = 1;
    const p = raw.split('|');
    if (p.length >= 2) {
        did = p[0].replace(/[^0-9]/g, '');
        no = Number(p[1]) || 1;
    } else {
        const q = raw.match(/^(\d+)[-_](\d+)$/);
        if (q) { did = q[1]; no = Number(q[2]) || 1; }
        else { did = raw.replace(/[^0-9]/g, ''); no = 1; }
    }
    if (!did) return JSON.stringify({ parse: 0, jx: 0, url: '' });

    const ck = did + '-' + no;
    let url = EP_CACHE[ck] || '';
    if (!url) {
        const d = json(HOST + '/api/v1/drama/' + did + '/ep/' + no);
        url = (d && (d.playbackUrl || d.videoUrl || d.manifestUrl)) || '';
        if (!url) return JSON.stringify({ parse: 0, jx: 0, url: '' });
        if (url.charAt(0) === '/') url = HOST + url;
        url = String(url).replace(/&amp;/g, '&');
        EP_CACHE[ck] = url;
    }

    // 只对 master 拉一次（带 3 次重试）：变体直链直接交出去，省掉壳子一跳
    let finalUrl = url;
    if (url.indexOf('manifest.m3u8') >= 0) {
        for (let i = 0; i < 3; i++) {
            const m = req(url);
            if (m && m.indexOf('#EXTM3U') >= 0) {
                const v = followMaster(m, url);
                if (v) finalUrl = v;
                break;
            }
            wait(250);
        }
    }

    return JSON.stringify({
        parse: 0,
        playUrl: '',
        jx: 0,
        url: finalUrl,
        header: JSON.stringify({ 'User-Agent': UA, 'Referer': HOST + '/' })
    });
}

function search(wd, quick, pg) {
    const key = encodeURIComponent(String(wd || ''));
    const d = json(HOST + '/api/v1/search?keyword=' + key + '&page=' + (Number(pg) || 1));
    const list = listOf(d && d.result ? d.result : d);
    const out = [];
    for (let i = 0; i < list.length; i++) out.push(list[i].vod_name);
    return JSON.stringify({ list: out });
}

function searchVod(wd, quick, pg) {
    const key = encodeURIComponent(String(wd || ''));
    const d = json(HOST + '/api/v1/search?keyword=' + key + '&page=' + (Number(pg) || 1));
    return JSON.stringify({ list: listOf(d && d.result ? d.result : d) });
}

function isVideoFormat(url) {
    return /m3u8|\.mp4|\.ts/i.test(String(url || ''));
}

function manualVideoCheck() { return false; }
function action(a) { return JSON.stringify({}); }
function proxy(params) { return JSON.stringify([]); }
function destroy() { }

export default {
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    detail: detail,
    play: play,
    search: search,
    searchVod: searchVod,
    isVideoFormat: isVideoFormat,
    manualVideoCheck: manualVideoCheck,
    action: action,
    proxy: proxy,
    destroy: destroy
};
