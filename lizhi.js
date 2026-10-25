import { _http } from 'assets://js/lib/cat.js';

/*
 * 荔枝短剧 liz03.com —— 影视仓 spider (type:3 / .js)
 * 站方：Nuxt3 SPA + JSON API (/api/v1)
 * 列表：/api/v1/drama/list?categoryId=&page=&size=50&sort=hot|latest
 * 标签：/api/v1/tag/<slug>?page=&size=     全标签 /api/v1/tag/list
 * 专题：/api/v1/topic/<slug>?page=&tab=new|hot
 * 详情：/api/v1/drama/<id>                  集表：/api/v1/drama/<id>/episodes
 * 播放：/api/v1/drama/<id>/ep/<n> → data.videoUrl (m3u8 + AES-128)
 * 搜索：/api/v1/search?keyword=&page=
 * 换域：liz03/liz04/liz05.com 同一 CloudFront，init 时探活切换
 */

const UA = 'Mozilla/5.0 (Linux; Android 13; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const BASE0 = 'https://liz03.com';
const HOSTS = ['https://liz03.com', 'https://liz04.com', 'https://liz05.com'];
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

let HOST = BASE0;

// ---------------- 底层请求 ----------------

function req(url, opt) {
    const o = Object.assign({
        method: 'GET',
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Referer': HOST + '/'
        }
    }, opt || {});
    try {
        const r = _http(url, o);
        if (r && (r.code === 302 || r.status === 302) && r.headers && r.headers.location) {
            return null;
        }
        if (!r || !r.content) return null;
        return String(r.content);
    } catch (e) {
        return null;
    }
}

function busyWait(ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { /* throttle */ }
}

function json(url) {
    // 站方有频率闸：1 秒内多次请求会回 500「请求过于频繁」，必须退避重试
    for (let attempt = 0; attempt < 4; attempt++) {
        const t = req(url);
        if (!t) continue;
        let j = null;
        try { j = JSON.parse(t); } catch (e) { j = null; }
        if (!j) continue;
        if (j.success === false) {
            if (String(j.message || '').indexOf('频繁') >= 0) { busyWait(250); continue; }
            return null;
        }
        return j.data !== undefined ? j.data : j;
    }
    return null;
}

function hostAlive(h) {
    const t = req(h + '/api/v1/drama/list?page=1&size=1', {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    });
    if (!t) return false;
    try {
        const j = JSON.parse(t);
        return !!(j && j.data);
    } catch (e) {
        return false;
    }
}

function pickHost() {
    for (let i = 0; i < HOSTS.length; i++) {
        if (hostAlive(HOSTS[i])) { HOST = HOSTS[i]; return HOST; }
    }
    return HOST;
}

// ---------------- 数据整形 ----------------

function tagNames(it) {
    if (!it.tags || !it.tags.length) return '';
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
    const tags = tagNames(it);
    const eps = Number(it.totalEpisodes || 0);
    const cur = Number(it.publishedEpisodeCount || 0);
    let rem = '';
    if (it.coverBadge) rem = it.coverBadge;
    if (it.coverProgress && rem.length < 14) rem = rem ? rem + ' · ' + it.coverProgress : it.coverProgress;
    if (!rem) rem = (it.partial && cur ? '更新至' + cur + '集' : (eps ? '全' + eps + '集' : ''));
    const year = it.publishedAt ? String(it.publishedAt).slice(0, 4) : '';
    return {
        vod_id: String(it.id),
        vod_name: it.title || '',
        vod_pic: cover(it.coverUrl),
        vod_remarks: rem,
        vod_year: year,
        vod_actor: '',
        vod_director: '',
        vod_content: it.description || '',
        vod_class: tags
    };
}

function listOf(d) {
    if (!d) return [];
    const arr = d.dramas || (d.page && d.page.items) || (d.items) || [];
    const out = [];
    for (let i = 0; i < arr.length; i++) out.push(vod(arr[i]));
    return out;
}

// ---------------- 类目参数 ----------------

function mod(tid) {
    return String(tid || 'all_latest');
}


const TAG_SLUG = {"魔改":"mogai","萝莉":"luoli","母女":"munv","NTR":"ntr","兄妹":"xiong","邻居":"linju","车震":"che","SM":"sm","滥交":"lajiao","淫乱":"yingluan","农村":"nong","绿帽":"lvmao","专属母狗":"zhuanshu","乱伦":"luanlun","大学生活":"daxue","女神":"nvshen","父女":"funv","母子":"muzi","后宫":"hougong","乡村":"xiangcun","人妻":"renqi","校园":"xiaoyuan","超能力":"chaonengli","女总裁":"nvzongcai","霸总":"bazong","丧尸":"sangshi","娱乐圈":"yulequan","同性":"tongxing","熟女":"shunv","短发":"duanfa","虐恋":"nuelian","同事":"tongshi","职场":"zhichang","年下":"nianxia","求生":"qiusheng","武侠":"wuxia","民国":"minguo","玄幻":"xuanhuan","仙侠":"xianxia","奇幻":"qihuan","科幻":"kehuan","脑洞":"naodong","志怪":"zhiguai","悬疑":"xuanyi","犯罪":"fanzui","刑侦":"xingzhen","种田":"zhongtian","灵异":"lingyi","恐怖":"kongbu","惊悚":"jingsong","恋爱":"lianai","古风":"gufeng","搞笑":"gaoxiao","今日更新":"jinrigengxin","本周上新":"benzhoushangxin","连载中":"lianzaizhong","已完结":"yiwanjie","女性成长":"nvxingchengzhang","商战":"shangzhan","战神":"zhanshen","赘婿":"zhuixu","逆袭":"nixi","动作":"dongzuo","喜剧":"xiju","现言":"xianyan","爱情":"aiqing","甜宠":"tianchong","青春":"qingchun","都市":"dushi","家庭":"jiating","复仇":"fuchou","穿越":"chuanyue","重生":"chongsheng","男同":"nantong","女同":"nvtong","古装":"guzhuang","古言":"guyuan","宫斗":"gongdou","权谋":"quanmou","女性向":"nvxingxiang"};

function tagSlugOf(name) {
    if (TAG_SLUG[name]) return TAG_SLUG[name];
    const t = json(HOST + '/api/v1/tag/list');
    if (!Array.isArray(t)) return '';
    for (let i = 0; i < t.length; i++) {
        if (t[i] && t[i].name === name) {
            TAG_SLUG[name] = t[i].slug;
            return t[i].slug;
        }
    }
    return '';
}

function listPath(m, p, sort) {
    const s = sort || 'hot';
    const tm = m.match(/^tag_(.+)$/);
    if (tm) {
        const name = decodeURIComponent(tm[1]);
        const slug = tagSlugOf(name);
        if (!slug) return '/api/v1/tag/__none__?page=' + p + '&size=1';
        return '/api/v1/tag/' + slug + '?page=' + p + '&size=' + SIZE;
    }
    if (m.indexOf('topic_') === 0) return '/api/v1/topic/' + m.slice(6) + '?page=' + p + '&tab=' + (s === 'latest' ? 'new' : s === 'hot' ? 'hot' : 'new') + '&size=' + SIZE;
    if (m.indexOf('cat_') === 0) return '/api/v1/drama/list?categoryId=' + m.slice(4) + '&page=' + p + '&size=' + SIZE + '&sort=' + (s === 'latest' ? 'latest' : 'hot');
    return '/api/v1/drama/list?page=' + p + '&size=' + SIZE + '&sort=' + (s === 'latest' ? 'latest' : 'hot');
}

function classes() {
    const out = [
        { type_id: 'hot_all', type_name: '🔥 全站最热' },
        { type_id: 'all_latest', type_name: '🆕 全站最新' }
    ];
    for (let i = 0; i < CATS.length; i++) {
        out.push({ type_id: 'cat_' + CATS[i][0], type_name: CATS[i][1] });
    }
    for (let i = 0; i < TOPICS.length; i++) {
        out.push({ type_id: 'topic_' + TOPICS[i][0], type_name: '📚 ' + TOPICS[i][1] });
    }
    return out;
}

// ---------------- 主接口 ----------------

export default {
    init(cfg) {
        if (cfg && cfg.base) HOST = cfg.base;
        pickHost();
        return '';
    },

    home() {
        const d = json(HOST + '/api/v1/homepage');
        const hp = (d && d.homepage) ? d.homepage : d;
        let list = [];
        if (hp && hp.topics && hp.topics.length) {
            const seen = {};
            for (let i = 0; i < hp.topics.length && list.length < 40; i++) {
                const ds = hp.topics[i].dramas || [];
                for (let k = 0; k < ds.length && list.length < 40; k++) {
                    const v = vod(ds[k]);
                    if (seen[v.vod_id]) continue;
                    seen[v.vod_id] = 1;
                    list.push(v);
                }
            }
        }
        return JSON.stringify({ class: classes(), filters: FILTERS, list: list });
    },

    homeVod() {
        const d = json(HOST + '/api/v1/homepage');
        const hp = (d && d.homepage) ? d.homepage : d;
        const list = [];
        if (hp && hp.topics && hp.topics.length) {
            const seen = {};
            for (let i = 0; i < hp.topics.length && list.length < 40; i++) {
                const ds = hp.topics[i].dramas || [];
                for (let k = 0; k < ds.length && list.length < 40; k++) {
                    const v = vod(ds[k]);
                    if (seen[v.vod_id]) continue;
                    seen[v.vod_id] = 1;
                    list.push(v);
                }
            }
        }
        return JSON.stringify({ list: list });
    },

    category(tid, pg, filter, extend) {
        const p = Number(pg) || 1;
        const ext = extend || {};
        const m = mod(tid);
        const d = json(HOST + listPath(m, p, ext.sort));
        let list = listOf(d);
        if (ext.tags) {
            const keep = [];
            for (let i = 0; i < list.length; i++) {
                if ((list[i].vod_class || '').indexOf(ext.tags) >= 0) keep.push(list[i]);
            }
            list = keep;
        }
        const meta = (d && (d.page || {})) || {};
        const hasMore = meta.hasMore;
        const pagecount = hasMore === false ? p : 9999;
        return JSON.stringify({ page: p, pagecount: pagecount, limit: SIZE, total: 9999, list: list });
    },

    detail(id) {
        const did = String(id).replace(/[^0-9]/g, '');
        const d = json(HOST + '/api/v1/drama/' + did);
        if (!d) return JSON.stringify({ list: [] });
        let eps = json(HOST + '/api/v1/drama/' + did + '/episodes');
        if (eps && eps.episodes) eps = eps.episodes;
        if (!Array.isArray(eps)) eps = [];
        // 只列 available !== false 的集（未上架集点开会 302 跳 SSR 页）
        if (eps.length) {
            const ok = [];
            for (let i = 0; i < eps.length; i++) {
                if (!eps[i] || eps[i].available === false) continue;
                ok.push(eps[i]);
            }
            eps = ok;
        }
        if (!eps.length) {
            const n = Number(d.publishedEpisodeCount || 0) || 0;
            for (let i = 1; i <= n; i++) eps.push({ epNo: i });
        }
        const names = [], urls = [];
        for (let i = 0; i < eps.length; i++) {
            const no = Number(eps[i].epNo || eps[i].episodeNumber || (i + 1));
            names.push('第' + no + '集');
            urls.push(did + '|' + no);
        }
        if (!names.length) { names.push('第1集'); urls.push(did + '|1'); }
        const v = vod(d);
        v.vod_id = did;
        v.vod_remarks = (d.coverBadge ? d.coverBadge + ' · ' : '') + (d.partial ? '更新至' + (eps.length || d.publishedEpisodeCount || 0) + '集' : '全' + (d.totalEpisodes || eps.length) + '集');
        v.vod_play_from = 'lizhi';
        v.vod_play_url = names.join('#') + '$$$' + urls.join('#');
        if (d.related && d.related.length) {
            const rel = [];
            for (let i = 0; i < d.related.length && i < 20; i++) rel.push(vod(d.related[i]));
            v.vod_relevance = rel;
        }
        return JSON.stringify({ list: [v] });
    },

    play(flag, id, flags) {
        let raw = String(id || '');
        try { raw = decodeURIComponent(raw); } catch (e) { }
        let did = '', no = 1;
        const p = raw.split('|');
        if (p.length === 2) { did = p[0].replace(/[^0-9]/g, ''); no = Number(p[1]) || 1; }
        else {
            const q = raw.match(/^(\d+)[-_]?(\d+)?$/);
            if (q) { did = q[1]; no = Number(q[2] || 1); }
        }
        if (!did) return JSON.stringify({ parse: 0, jx: 0, url: '' });
        const d = json(HOST + '/api/v1/drama/' + did + '/ep/' + no);
        let url = (d && (d.playbackUrl || d.videoUrl || d.manifestUrl)) || '';
        if (!d || !d.playbackUrl) return JSON.stringify({ parse: 0, jx: 0, url: '' });

        if (url && url.charAt(0) === '/') url = HOST + url;
        if (!url) return JSON.stringify({ parse: 0, jx: 0, url: '' });
        url = String(url).replace(/&amp;/g, '&');
        const hdr = { 'User-Agent': UA, 'Referer': HOST + '/', 'Origin': HOST };
        return JSON.stringify({ parse: 0, jx: 0, url: url, header: hdr });
    },

    search(wd, quick) {
        const key = encodeURIComponent(String(wd || ''));
        const d = json(HOST + '/api/v1/search?keyword=' + key + '&page=1');
        const list = listOf(d && d.result ? d.result : d);
        const out = [];
        for (let i = 0; i < list.length; i++) out.push(list[i].vod_name);
        return JSON.stringify({ list: out });
    },

    searchVod(wd, quick) {
        const key = encodeURIComponent(String(wd || ''));
        const d = json(HOST + '/api/v1/search?keyword=' + key + '&page=1');
        return JSON.stringify({ list: listOf(d && d.result ? d.result : d) });
    },

    isVideo(url) {
        return /m3u8|\.mp4/i.test(String(url || ''));
    }
};
