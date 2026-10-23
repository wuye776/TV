// 真黄果短剧 type:3 spider v1
// 站点: li1q.h2na6qa39.cc (黄果短剧官网本体, 发布页 huangguoai.pages.dev)
// API: /api/videos/category/<ch> | /api/videos/tag/<slug> | /api/videos/<id>[?ep=N] | /api/search?q=
// 铁律: 分类/标签/子分类全部进影视仓筛选(extend=tab+tag)
var HOST = 'https://li1q.h2na6qa39.cc';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function s(x) { return x == null ? '' : String(x); }
function trim(x) { return s(x).replace(/^\s+|\s+$/g, ''); }
function num(x, d) { var n = parseInt(x, 10); return isNaN(n) ? (d || 0) : n; }

function stdHeaders(extra) {
    var h = { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', 'Referer': HOST + '/' };
    if (extra) { for (var k in extra) { h[k] = extra[k]; } }
    return h;
}

function request(url, opt) {
    var o = opt || {};
    o.headers = stdHeaders(o.headers);
    o.async = false;
    if (typeof http === 'function') return http(url, o);
    if (typeof net !== 'undefined' && net && typeof net.http === 'function') return net.http(url, o);
    return { code: 0, content: '' };
}

function getJSON(url) {
    try {
        var r = request(url, { method: 'GET' });
        var body = s(r && (r.content !== undefined ? r.content : r.body !== undefined ? r.body : r));
        var j = JSON.parse(body);
        if (j && (j.status === 1 || j.status === 200)) return j.data || {};
        return {};
    } catch (e) { return {}; }
}

// tag slug→中文名 映射（从站内卡片归并，前 30 个高频；其余 slug 原样显示）
var TAGS = [
    ['baihu','白虎'],['baixi','白皙'],['bazong','霸总'],['ceru','侧入'],['changfa','长发'],
    ['changtui','长腿'],['chaonengli','超能力'],['chongsheng','重生'],['chuanyue','穿越'],['dananzhu','大男主'],
    ['danvzhu','大女主'],['dayanjing','大眼睛'],['duanfa','短发'],['dushi','都市'],['fanzui','犯罪'],
    ['fengman','丰满'],['fenxue','粉穴'],['gaotiao','高挑'],['gaoyanzhi','高颜值'],['gongting','宫廷'],
    ['gufeng','古风'],['haomen','豪门'],['heisi','黑丝'],['hougong','后宫'],['houru','后入'],
    ['huangdao','荒岛'],['jiaoxiao','娇小'],['jiedi','姐弟'],['jiudian','酒店'],['juru','巨乳']
];

var TABS = [['latest','最新更新'],['hot','当前热播'],['original','独家原创'],['random','随机推荐']];
var CHANNELS = [
    ['recommend','真黄果·推荐'],
    ['ai-duanju','AI成人短剧'],
    ['ai-huanlian','AI换脸'],
    ['ai-manju','AI漫剧'],
    ['ai-mogai','AI摸改'],
    ['chigua','吃瓜']
];

function cardFromItem(it) {
    if (!it || !it.id) return null;
    var eps = num(it.total_episodes) || num(it.episode_count) || 1;
    return {
        vod_id: s(it.id),
        vod_name: s(it.title),
        vod_pic: s(it.cover),
        vod_remarks: (it.score ? s(it.score) + '分 · ' : '') + '全' + eps + '集' + (it.is_finished ? '·完结' : ''),
        vod_year: s(it.created_at || '').substring(0, 10),
        vod_class: (it.tags || []).join(',')
    };
}

function init(cfg) { return JSON.stringify({ code: 1, msg: 'ok' }); }

function home(filter) {
    var classes = [];
    var filters = {};
    for (var i = 0; i < CHANNELS.length; i++) {
        classes.push({ type_id: CHANNELS[i][0], type_name: CHANNELS[i][1] });
    }
    var tabVals = [{ n: '全部', v: '' }];
    for (var t = 0; t < TABS.length; t++) tabVals.push({ n: TABS[t][1], v: TABS[t][0] });
    var tagVals = [{ n: '全部标签', v: '' }];
    for (var g = 0; g < TAGS.length; g++) tagVals.push({ n: TAGS[g][1], v: TAGS[g][0] });
    for (var c = 0; c < CHANNELS.length; c++) {
        filters[CHANNELS[c][0]] = [
            { key: 'tab', name: '排序', value: tabVals },
            { key: 'tag', name: '标签筛选', value: tagVals }
        ];
    }
    return JSON.stringify({ class: classes, filters: filters });
}

function homeVod() {
    var list = [];
    try {
        var r = request(HOST + '/', { method: 'GET', headers: { 'Accept': 'text/html' } });
        var body = s(r && (r.content !== undefined ? r.content : r.body !== undefined ? r.body : r));
        var blocks = body.split('hg-drama-card');
        var seen = {};
        for (var i = 1; i < blocks.length && list.length < 24; i++) {
            var b = blocks[i].substring(0, 2600);
            var id = (b.match(/href="\/video\/(\d+)\//) || [])[1];
            var pic = (b.match(/(?:data-src|src)="([^"]+(?:jpg|png|webp)[^"]*)"/) || [])[1];
            var name = (b.match(/alt="([^"]+)"/) || [])[1];
            if (id && name && !seen[id]) {
                seen[id] = 1;
                list.push({ vod_id: id, vod_name: name, vod_pic: pic || '', vod_remarks: '推荐' });
            }
        }
    } catch (e) {}
    return JSON.stringify({ list: list });
}

function category(tid, pg, filter, extend) {
    pg = num(pg, 1);
    extend = extend || {};
    var tab = trim(extend.tab || '');
    var tag = trim(extend.tag || '');
    var list = [], pagecount = 1, total = 0;
    var d = {};
    if (tag) {
        d = getJSON(HOST + '/api/videos/tag/' + tag + '?page=' + pg + '&size=30');
    } else if (tid === 'recommend') {
        d = getJSON(HOST + '/api/videos/category/ai-duanju?page=' + pg + '&size=30&sort=' + (tab || 'hot'));
    } else {
        d = getJSON(HOST + '/api/videos/category/' + tid + '?page=' + pg + '&size=30&sort=' + (tab || 'latest'));
    }
    var items = d.items || [];
    var pag = d.pagination || {};
    total = num(pag.total, items.length);
    pagecount = Math.max(1, Math.ceil(total / (num(pag.size, 30) || 30)));
    var seen = {};
    for (var i = 0; i < items.length; i++) {
        var v = cardFromItem(items[i]);
        if (v && !seen[v.vod_id]) { seen[v.vod_id] = 1; list.push(v); }
    }
    if (!list.length) list.push({ vod_id: '_err_', vod_name: '暂无数据·换筛选或稍后再试', vod_pic: '', vod_remarks: '' });
    return JSON.stringify({ list: list, page: pg, pagecount: pagecount, total: total });
}

function detail(id) {
    var vid = trim(s(Array.isArray(id) ? id[0] : id).split(',')[0]);
    if (!vid || vid === '_err_') return JSON.stringify({ list: [] });
    var d = getJSON(HOST + '/api/videos/' + vid);
    if (!d.title) return JSON.stringify({ list: [] });
    var eps = num(d.total_episodes) || num(d.episode_count) || 1;
    var play = [];
    for (var e = 1; e <= eps; e++) {
        play.push('第' + e + '集$' + vid + '-' + e);
    }
    var v = {
        vod_id: vid,
        vod_name: s(d.title),
        vod_pic: s(d.cover),
        vod_year: s(d.created_at || '').substring(0, 10),
        vod_remarks: (d.score ? s(d.score) + '分 · ' : '') + '全' + eps + '集' + (d.is_finished ? '·完结' : ''),
        vod_actor: (d.actors || []).join(','),
        vod_director: s(d.author),
        vod_content: s(d.description),
        vod_class: (d.tags || []).join(','),
        vod_play_from: '黄果在线',
        vod_play_url: play.join('#')
    };
    return JSON.stringify({ list: [v] });
}

function play(flag, id, vipFlags) {
    var raw = trim(s(Array.isArray(id) ? id[0] : id).split(',')[0]);
    var m = raw.match(/^(\d+)-(\d+)$/);
    var hdr = JSON.stringify({ 'User-Agent': UA, 'Referer': HOST + '/' });
    if (!m) return JSON.stringify({ parse: 0, playUrl: '', url: '', header: hdr });
    var vid = m[1], ep = num(m[2], 1);
    var d = getJSON(HOST + '/api/videos/' + vid + '?ep=' + ep);
    var url = s(d.video_url);
    if (!url) url = 'https://li1q.h2na6qa39.cc/#取流失败-' + vid + '-ep' + ep;
    return JSON.stringify({ parse: 0, playUrl: '', url: url, header: hdr });
}

function search(wd, quick) {
    wd = trim(wd);
    if (!wd) return JSON.stringify({ list: [] });
    var list = [], pagecount = 1, total = 0;
    var d = getJSON(HOST + '/api/search?q=' + encodeURIComponent(wd) + '&size=30&page=1');
    var items = d.items || [];
    total = num((d.pagination || {}).total, items.length);
    pagecount = Math.max(1, Math.ceil(total / 30));
    var seen = {};
    for (var i = 0; i < items.length; i++) {
        var v = cardFromItem(items[i]);
        if (v && !seen[v.vod_id]) { seen[v.vod_id] = 1; list.push(v); }
    }
    return JSON.stringify({ list: list, page: 1, pagecount: pagecount, total: total });
}

export default {
    init: init,
    home: home,
    homeVod: homeVod,
    category: category,
    detail: detail,
    play: play,
    search: search,
    proxy: null,
    sniffer: null,
    drp: null,
    oheaders: null
};
