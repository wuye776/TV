// 真黄果短剧 type:3 spider v5
// 站点: *.h2na6qa39.cc (泛子域, CloudFront, CN=*.h2na6qa39.cc)
// 域名自愈: init 拉发布页 publish.js 解析 urls[] 插入池子, 探活切换
// API: /api/videos/category/<ch> | /api/videos/tag/<中文> | /api/videos/<id>[?ep=N] | /api/posts | /api/search?q=
// 铁律: 分类/标签/子分类全部进影视仓筛选(extend=tab+tag); tag 只吃中文不吃 slug
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
var PUB_PAGES = ['https://huangguoai.pages.dev', 'https://huang-guo.pages.dev'];
// 静态池: 实测快子域(nju/hit/fdu/zju 0.35-0.45s) + 官方 li1q
var HOST_POOL = ['https://nju.h2na6qa39.cc', 'https://hit.h2na6qa39.cc', 'https://fdu.h2na6qa39.cc', 'https://zju.h2na6qa39.cc', 'https://li1q.h2na6qa39.cc'];
var HOST = HOST_POOL[0];
var HOST_OK = false;
// 吃瓜预热缓存: init 时同步拉 page1-3, category/posts 直接吃缓存(3页*30=90条本地筛)
var POST_CACHE = null;

function s(x) { return x == null ? '' : String(x); }
function trim(x) { return s(x).replace(/^\s+|\s+$/g, ''); }
function num(x, d) { var n = parseInt(x, 10); return isNaN(n) ? (d || 0) : n; }

function stdHeaders(extra) {
    var h = { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*' };
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

// 域名探活: GET size=1 最小接口, 2xx 且 JSON 可解析 = 活
function hostAlive(h) {
    try {
        var r = request(h + '/api/videos/category/ai-manju?page=1&size=1', { method: 'GET' });
        var b = s(r && (r.content !== undefined ? r.content : r.body !== undefined ? r.body : r));
        return r.code === 200 && b.indexOf('"items"') >= 0;
    } catch (e) { return false; }
}

function pickHost() {
    if (HOST_OK) return HOST;
    for (var i = 0; i < HOST_POOL.length; i++) {
        if (hostAlive(HOST_POOL[i])) { HOST = HOST_POOL[i]; HOST_OK = true; return HOST; }
    }
    HOST_OK = false;
    return HOST;
}

function reqJSON(url) {
    var r = request(url, { method: 'GET' });
    var b = s(r && (r.content !== undefined ? r.content : r.body !== undefined ? r.body : r));
    try {
        var j = JSON.parse(b);
        if (j && (j.status === 1 || j.status === 200)) return j.data || {};
        return {};
    } catch (e) { return {}; }
}

function getJSON(path) {
    pickHost();
    var d = reqJSON(HOST + path);
    if (d && (d.items !== undefined || d.pagination !== undefined || d.title !== undefined)) return d;
    // 失败换域重试一轮
    HOST_OK = false;
    pickHost();
    return reqJSON(HOST + path);
}

// 发布页域名发现: 拉 publish.js 文本解析 urls=[ 'xxx.cc/', ... ]
// 命中新域 → 以大学子域+裸域形态插入池子头部
function discoverHosts() {
    var found = [];
    for (var p = 0; p < PUB_PAGES.length; p++) {
        try {
            var r = request(PUB_PAGES[p] + '/publish.js', { method: 'GET' });
            var b = s(r && (r.content !== undefined ? r.content : r.body !== undefined ? r.body : r));
            var m = b.match(/var\s+urls\s*=\s*\[([\s\S]*?)\]/);
            if (!m) continue;
            var re = /['"]([a-z0-9.-]+\.[a-z]{2,})\/?['"]/g, mm;
            while ((mm = re.exec(m[1])) !== null) {
                var dom = mm[1];
                if (dom.indexOf('h2na6qa39') >= 0 || dom.indexOf('pages.dev') >= 0) continue;
                if (found.indexOf(dom) < 0) found.push(dom);
            }
            if (found.length) break;
        } catch (e) { }
    }
    var added = [];
    for (var i = 0; i < found.length; i++) {
        var cands = ['https://nju.' + found[i], 'https://' + found[i].replace(/\/$/, '')];
        for (var c = 0; c < cands.length; c++) {
            // push 到尾部(不 unshift): 裸 .cc 域被污染, 探活 30s 超时会拖死换域链
            if (HOST_POOL.indexOf(cands[c]) < 0) { HOST_POOL.push(cands[c]); added.push(cands[c]); }
        }
    }
    return added;
}

// tag slug→中文（站内频道页锚文本全量 98 个；filters v 值直接传中文）
var TAGS = [
    ['baihu','白虎'],['baixi','白皙'],['bazong','霸总'],['ceru','侧入'],['changfa','长发'],
    ['changtui','长腿'],['chaonengli','超能力'],['chongsheng','重生'],['chuanyue','穿越'],['dananzhu','大男主'],
    ['danvzhu','大女主'],['dayanjing','大眼睛'],['duanfa','短发'],['dushi','都市'],['fanzui','犯罪'],
    ['fengman','丰满'],['fenxue','粉穴'],['gaotiao','高挑'],['gaoyanzhi','高颜值'],['gongting','宫廷'],
    ['gufeng','古风'],['haomen','豪门'],['heisi','黑丝'],['hougong','后宫'],['houru','后入'],
    ['huangdao','荒岛'],['jiaoxiao','娇小'],['jiedi','姐弟'],['jiudian','酒店'],['juru','巨乳'],
    ['koubao','口爆'],['koujiao','口交'],['lengyan','冷艳'],['luanlun','乱伦'],['luchu','露出'],
    ['luozu','裸足'],['lvmao','绿帽'],['majiaxian','马甲线'],['meiru','美乳'],['meitui','美腿'],
    ['mgdsj','魔改短剧'],['mgdy','魔改电影'],['miaotiao','苗条'],['mingxing','明星'],['mitaotun','蜜桃臀'],
    ['muzi','母子'],['nantong','男同'],['naodong','脑洞'],['nianxia','年下'],['nixi','逆袭'],
    ['ntr','NTR'],['nuelian','虐恋'],['nuli','女仆'],['qicheng','骑乘'],['qihuan','奇幻'],
    ['qingchun','清纯'],['quanmou','权谋'],['qunjiao','群交'],['renqi','人气'],['sangshi','丧尸'],
    ['shenhou','身后'],['shewen','舌吻'],['shoujiao','授教'],['shuangfei','双飞'],['shunv','熟女'],
    ['sm','SM'],['taitui','抬腿'],['tianchong','甜宠'],['tianmei','甜美'],['tongshi','同事'],
    ['tongxue','同学'],['waiguoren','外国人'],['waishe','外射'],['wanghong','网红'],['xiandai','现代'],
    ['xiangcun','乡村'],['xianxia','仙侠'],['xiaoyuan','校园'],['xingzhuan','性转'],['xiongmei','兄妹'],
    ['xitong','系统'],['xiuxian','修仙'],['xiyao','西妖'],['xuanhuan','玄幻'],['xuanyi','悬疑'],
    ['yanshe','颜射'],['youxi','游戏'],['yujie','御姐'],['yulequan','娱乐圈'],['yuzu','足浴'],
    ['zhanlihouru','站立后入'],['zhengchangwei','正常位'],['zhichang','职场'],['zhifu','制服'],['zhongxiong','重胸'],
    ['zhuixu','赘婿'],['ziranxiong','自然胸'],['zujiao','足交']
];

var TABS = [['latest','最新更新'],['hot','当前热播'],['original','独家原创'],['random','随机推荐']];
// 视频频道(走 /api/videos/category/) + 吃瓜(走 /api/posts/, key=posts)
var CHANNELS = [
    ['ai-duanju','AI成人短剧'],
    ['ai-huanlian','AI换脸'],
    ['ai-manju','AI漫剧'],
    ['ai-mogai','AI魔改'],
    ['posts','吃瓜爆料']
];

function cardFromItem(it) {
    if (!it || !it.id) return null;
    var eps = num(it.episode_count) || num(it.total_episodes) || 1;
    return {
        vod_id: s(it.id),
        vod_name: s(it.title),
        vod_pic: toHttp(s(it.cover)),
        vod_remarks: (it.score ? s(it.score) + '分 · ' : '') + '全' + eps + '集' + (it.is_finished ? '·完结' : ''),
        vod_year: s(it.created_at || '').substring(0, 10),
        vod_class: (it.tags || []).join(',')
    };
}

function postCard(it) {
    if (!it || !it.id) return null;
    return {
        vod_id: 'p' + s(it.id),
        vod_name: s(it.title),
        vod_pic: toHttp(s(it.cover)),
        vod_remarks: '吃瓜 · ' + s(it.publish_time || '').substring(5, 10),
        vod_year: s(it.publish_time || it.created_at || '').substring(0, 10),
        vod_class: (it.tags || []).join(',')
    };
}

function prefetchPosts() {
    if (POST_CACHE) return POST_CACHE;
    var pool = [], seen = {};
    for (var p = 1; p <= 3; p++) {
        try {
            var d = getJSON('/api/posts?page=' + p + '&size=30');
            var its = d.items || [];
            if (!its.length) break;
            for (var i = 0; i < its.length; i++) {
                var v = postCard(its[i]);
                if (v && !seen[v.vod_id]) { seen[v.vod_id] = 1; pool.push(v); }
            }
        } catch (e) { break; }
    }
    POST_CACHE = pool;
    return pool;
}

// 封面换血: pic.drleao.cn 吐 AES 密文(播放器当图=花屏/不显示)
// new2.drleao.cn 同 path 是明文 JPEG(站详情页 og 通道), 去 auth_key 照出
// 保留 http:// 前缀省 TLS 握手(该域 80/443 同速, https 偶发 10s 超时)
function toHttp(u) {
    var u2 = s(u);
    if (u2.indexOf('https://pic.drleao.cn') === 0) u2 = 'http://new2.drleao.cn' + u2.substring(21);
    if (u2.indexOf('http://pic.drleao.cn') === 0) u2 = 'http://new2.drleao.cn' + u2.substring(20);
    var q = u2.indexOf('?auth_key=');
    if (q > 0) u2 = u2.substring(0, q);
    return u2;
}

function init(cfg) {
    // 先静态池探活, 再发布页发现(异步补池)
    pickHost();
    try { discoverHosts(); } catch (e) { }
    // 吃瓜预热: 首次进入吃瓜频道 0 网络直出(3页已在手)
    try { prefetchPosts(); } catch (e) { }
    return JSON.stringify({ code: 1, msg: 'ok' });
}

function home(filter) {
    var classes = [];
    var filters = {};
    for (var i = 0; i < CHANNELS.length; i++) {
        classes.push({ type_id: CHANNELS[i][0], type_name: CHANNELS[i][1] });
    }
    var tabVals = [{ n: '全部', v: '' }];
    for (var t = 0; t < TABS.length; t++) tabVals.push({ n: TABS[t][1], v: TABS[t][0] });
    var ptagVals = [{ n: '全部标签', v: '' }];
    for (var g2 = 0; g2 < TAGS.length && g2 < 40; g2++) ptagVals.push({ n: TAGS[g2][1], v: TAGS[g2][1] });
    var tagVals = [{ n: '全部标签', v: '' }];
    for (var g = 0; g < TAGS.length; g++) tagVals.push({ n: TAGS[g][1], v: encodeURIComponent(TAGS[g][1]) });
    var dateVals = [{ n: '全部日期', v: '' }];
    var dy = 2026, dm = 10;
    for (var dd = 0; dd < 12; dd++) {
        dateVals.push({ n: dy + '-' + (dm < 10 ? '0' + dm : dm), v: dy + '-' + (dm < 10 ? '0' + dm : dm) });
        dm--; if (dm < 1) { dm = 12; dy--; }
    }
    for (var c = 0; c < CHANNELS.length; c++) {
        var fl = [{ key: 'tab', name: '排序', value: tabVals }, { key: 'tag', name: '标签筛选', value: tagVals }];
        if (CHANNELS[c][0] === 'posts') fl = [{ key: 'date', name: '日期', value: dateVals }, { key: 'ptag', name: '标签', value: ptagVals }];
        filters[CHANNELS[c][0]] = fl;
    }
    return JSON.stringify({ class: classes, filters: filters });
}

function homeVod() {
    var list = [];
    try {
        pickHost();
        var r = request(HOST + '/', { method: 'GET', headers: { 'Accept': 'text/html' } });
        var body = s(r && (r.content !== undefined ? r.content : r.body !== undefined ? r.body : r));
        var blocks = body.split('hg-drama-card');
        var seen = {};
        for (var i = 1; i < blocks.length && list.length < 24; i++) {
            var b = blocks[i].substring(0, 2600);
            var id = (b.match(/href="\/video\/(\d+)\//) || [])[1];
            var pic = (b.match(/(?:data-src|src)="([^"]+(?:jpg|png|webp|gif)[^"]*)"/) || [])[1];
            var name = (b.match(/alt="([^"]+)"/) || [])[1];
            if (id && name && !seen[id]) {
                seen[id] = 1;
                list.push({ vod_id: id, vod_name: name, vod_pic: toHttp(pic || ''), vod_remarks: '推荐' });
            }
        }
    } catch (e) { }
    if (!list.length) {
        var d = getJSON('/api/videos/category/ai-duanju?page=1&size=24&sort=hot');
        var items = d.items || [];
        for (var k = 0; k < items.length; k++) { var v = cardFromItem(items[k]); if (v) list.push(v); }
    }
    return JSON.stringify({ list: list });
}

function category(tid, pg, filter, extend) {
    pg = num(pg, 1);
    extend = extend || {};
    var tab = trim(extend.tab || '');
    var tag = trim(s(extend.tag || ''));
    try { tag = decodeURIComponent(tag); } catch (e) { }
    var list = [], pagecount = 1, total = 0;
    if (tid === 'posts') {
        // /api/posts 不吃任何筛参: init 已预热 page1-3 进 POST_CACHE, 本地过日期+标签
        var pdate = trim(s(extend.date || ''));
        var ptag = trim(s(extend.ptag || ''));
        var all = prefetchPosts();
        var pool = [];
        for (var iq = 0; iq < all.length; iq++) {
            var itq = all[iq];
            if (pdate && s(itq.vod_year || '').indexOf(pdate) !== 0) continue;
            if (ptag && s(itq.vod_class || '').split(',').indexOf(ptag) < 0) continue;
            pool.push(itq);
        }
        total = pool.length;
        pagecount = 1;
        var fromI = (pg - 1) * 30;
        for (var pz = fromI; pz < pool.length && pz < fromI + 30; pz++) list.push(pool[pz]);
    } else {
        var d;
        if (tag) {
            d = getJSON('/api/videos/tag/' + encodeURIComponent(tag) + '?page=' + pg + '&size=30' + (tab ? '&sort=' + tab : ''));
        } else {
            d = getJSON('/api/videos/category/' + tid + '?page=' + pg + '&size=30&sort=' + (tab || 'latest'));
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
    }
    if (!list.length) list.push({ vod_id: '_err_', vod_name: '暂无数据·换筛选或稍后再试', vod_pic: '', vod_remarks: '' });
    return JSON.stringify({ list: list, page: pg, pagecount: pagecount, total: total });
}

function detail(id) {
    var vid = trim(s(Array.isArray(id) ? id[0] : id).split(',')[0]);
    if (!vid || vid === '_err_') return JSON.stringify({ list: [] });
    if (vid.charAt(0) === 'p') {
        // 吃瓜帖子: /api/posts/<id> → video_url 即整片
        var pid = vid.substring(1);
        var pd = reqJSON(pickHost() + '/api/posts/' + pid);
        if (!pd || !pd.title) return JSON.stringify({ list: [] });
        var v = {
            vod_id: vid,
            vod_name: s(pd.title),
            vod_pic: toHttp(s(pd.cover)),
            vod_year: s(pd.created_at || '').substring(0, 10),
            vod_remarks: '吃瓜',
            vod_director: s((pd.author || {}).name),
            vod_content: s(pd.description || pd.intro || pd.content || pd.desc || '').replace(/[\r\n]+/g, ' ').replace(/<[^>]+>/g, ' ').substring(0, 500),
            vod_class: (pd.tags || []).join(','),
            vod_play_from: '黄果在线',
            vod_play_url: '正片$' + vid
        };
        return JSON.stringify({ list: [v] });
    }
    var d = getJSON('/api/videos/' + vid);
    if (!d.title) return JSON.stringify({ list: [] });
    var eps = d.episodes && d.episodes.length ? d.episodes : null;
    var count = eps ? eps.length : (num(d.episode_count) || num(d.total_episodes) || 1);
    var play = [];
    if (eps) {
        for (var e = 0; e < eps.length; e++) {
            play.push('第' + s(eps[e].ep_num) + '集$' + vid + '-' + s(eps[e].ep_num));
        }
    } else {
        for (var n = 1; n <= count; n++) play.push('第' + n + '集$' + vid + '-' + n);
    }
    var v2 = {
        vod_id: vid,
        vod_name: s(d.title),
        vod_pic: toHttp(s(d.cover)),
        vod_year: s(d.created_at || '').substring(0, 10),
        vod_remarks: (d.score ? s(d.score) + '分 · ' : '') + '全' + count + '集' + (d.is_finished ? '·完结' : ''),
        vod_actor: (d.actors || []).join(','),
        vod_director: s((d.author || {}).name || d.author),
        vod_content: s(d.description || d.intro || '').replace(/[\r\n]+/g, ' ').replace(/<[^>]+>/g, ' ').substring(0, 500),
        vod_class: (d.tags || []).join(','),
        vod_play_from: '黄果在线',
        vod_play_url: play.join('#')
    };
    return JSON.stringify({ list: [v2] });
}

function play(flag, id, vipFlags) {
    var raw = trim(s(Array.isArray(id) ? id[0] : id).split(',')[0]);
    var hdr = JSON.stringify({ 'User-Agent': UA, 'Referer': 'https://li1q.h2na6qa39.cc/' });
    if (raw.charAt(0) === 'p') {
        var pid = raw.substring(1);
        var pd = reqJSON(pickHost() + '/api/posts/' + pid);
        var pu = s(pd && pd.video_url);
        if (!pu) pu = 'https://li1q.h2na6qa39.cc/#吃瓜取流失败-' + pid;
        return JSON.stringify({ parse: 0, playUrl: '', url: pu, header: hdr });
    }
    var m = raw.match(/^(\d+)-(\d+)$/);
    if (!m) return JSON.stringify({ parse: 0, playUrl: '', url: '', header: hdr });
    var vid = m[1], ep = num(m[2], 1);
    var d = getJSON('/api/videos/' + vid + '?ep=' + ep);
    var url = s(d.video_url);
    if (!url) url = 'https://li1q.h2na6qa39.cc/#取流失败-' + vid + '-ep' + ep;
    return JSON.stringify({ parse: 0, playUrl: '', url: url, header: hdr });
}

function search(wd, quick) {
    wd = trim(wd);
    if (!wd) return JSON.stringify({ list: [] });
    var list = [], pagecount = 1, total = 0;
    var d = getJSON('/api/search?q=' + encodeURIComponent(wd) + '&size=30&page=1');
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
