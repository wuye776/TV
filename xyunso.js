// ============================================================
// 影视仓 / TVBox · QuickJS spider —— Xyunso在线（A5hot 模板）
// 目标站：xy05.cc（永久域名） + cdn{1019-1023}.永久地址xyunso点com卍.xyso{025-027}.hair 镜像群
//
// 形态：type:3，api 填本文件 URL（.js 结尾 → 不需要 jar，不需要服务器）
// 订阅示例：
//   { "key":"xy05.cc","name":"Xyunso在线","type":3,
//     "api":"https://cdn.jsdelivr.net/gh/wuye776/TV@main/xyunso.js" }
//
// 全同步：QuickJS 宿主不 pump 微任务，http() 必须 async:false。
// 所有方法返回 JSON 字符串。
// ============================================================

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 主域名：站方自称「永久域名」，短且稳定；抓不到时自动跳镜像
let BASE = 'https://xy05.cc';
let HEADERS = { 'User-Agent': UA };

// jump 门禁：不带这两个参数会返回 3 秒跳转中转页（正文仅 3.9KB）
const JUMP = '?mod=jump&jump_count=1';

// ---------------- 分类表（16 大类 / 339 子标签，实测全量写死，冷启动 0 请求） ----------------
const CATS = [
    ["Porn91", "91Porn", [["latest","最近更新"], ["hd","高清视频"], ["recent-favorite","最近加精"], ["hot-list","当前最热"], ["recent-rating","最近得分"], ["nonpaid","非付费"], ["ori","91原创"], ["long-list","10分钟以上"], ["longer-list","20分钟以上"], ["month-discuss","本月讨论"], ["top-favorite","本月收藏"], ["most-favorite","收藏最多"], ["top-list","本月最热"], ["top-last","上月最热"]]],
    ["miss", "M限时回归", [["chinese-subtitle","中文字幕"], ["new","最近更新"], ["release","新作上市"], ["uncensored-leak","無碼流出"], ["today-hot","今日熱門"], ["weekly-hot","本週熱門"], ["monthly-hot","本月熱門"], ["siro","SIRO"], ["luxu","LUXU"], ["gana","GANA"], ["maan","PRESTIGE PREMIUM"], ["scute","S-CUTE"], ["ara","ARA"], ["fc2","FC2"], ["heyzo","HEYZO"], ["tokyohot","東京熱"], ["1pondo","一本道"], ["caribbeancom","Caribbeancom"], ["caribbeancompr","Caribbeancompr"], ["10musume","10musume"], ["pacopacomama","pacopacomama"], ["gachinco","Gachinco"], ["xxxav","XXX-AV"], ["marriedslash","人妻斬"], ["naughty0930","頑皮 0930"], ["madou","麻豆傳媒"]]],
    ["17cuk", "新无码仓库", [["latest-insert","最新更新"], ["recent-release","最近发布"], ["studio-44Ko44K544Ov44OzIOODiuODs-ODkOODvOODr-ODs-OCueOCv-OCpOODqw","S1 NO.1 STYLE"], ["studio-44Og44O844OH44Kj44O844K6","MOODYZ"], ["studio-44Oe44OJ44Oz44OK","Madonna"], ["studio-44Ki44Kk44OH44Ki44Od44Kx44OD44OI","IDEA POCKET"], ["studio-U09E44Kv44Oq44Ko44Kk44OI","SOD CREATE"], ["studio-44OA44K544OD77yB","DAS!"], ["studio-RkFMRU5P","FALENO"], ["studio-44Ov44Oz44K644OV44Kh44Kv44OI44Oq44O8","WANZ FACTORY"], ["studio-44OX44Os44K544OG44O844K4","PRESTIGE"], ["studio-RS1CT0RZ","E-BODY"], ["studio-5rqc5rGg44K044Ot44O8","溜池ゴロー"], ["studio-44OX44Os44Of44Ki44Og","プレミアム"], ["studio-44Ki44K_44OD44Kr44O844K6","アタッカーズ"], ["studio-REFITElB","DAHLIA"], ["studio-Rml0Y2g","Fitch"], ["studio-T1BQQUk","OPPAI"], ["studio-5pys5Lit","本中"], ["studio-44K744Os44OW44Gu5Y-L","セレブの友"], ["studio-44OX44Op44ON44OD44OI44OX44Op44K5","プラネットプラス"], ["studio-44Kw44Ot44O844Oq44O844Kv44Ko44K544OI","グローリークエスト"], ["4K","4K"], ["OL","OL"]]],
    ["AV18", "AV18", [["chinese","中文字幕AV"], ["censored","有码AV"], ["uncensored","无码AV"], ["reducing-mosaic","无码破解"], ["amateurjav","素人AV"], ["animation","H动画"], ["dt","国产自拍"]]],
    ["AvDB", "AvDB仓库", [["recent-release","最近发布"], ["early-leak","提前泄露"], ["latest-insert","最新更新"], ["hot-blended-day","今日热榜"], ["hot-blended-month","月度热榜"], ["hot-blended-quarter","季度热榜"], ["hot-blended-year","年度热榜"]]],
    ["Magnets", "BT磁力库", [["recent-release","最近发布"], ["early-leak","提前泄露"], ["latest-insert","最新更新"], ["hot-blended-day","今日热榜"], ["hot-blended-month","月度热榜"], ["hot-blended-quarter","季度热榜"], ["hot-blended-year","年度热榜"]]],
    ["Xvideos", "Xvideos", [["2026-09","2026年09月"], ["2026-08","2026年08月"], ["2026-07","2026年07月"], ["2026-06","2026年06月"], ["2026-05","2026年05月"], ["2026-04","2026年04月"], ["2026-03","2026年03月"], ["2026-02","2026年02月"], ["2026-01","2026年01月"], ["2025-12","2025年12月"], ["2025-11","2025年11月"], ["2025-10","2025年10月"], ["2025-09","2025年09月"], ["2025-08","2025年08月"], ["2025-07","2025年07月"], ["2025-06","2025年06月"]]],
    ["Xnxx", "Xnxx", [["2026-09","2026年09月"], ["2026-08","2026年08月"], ["2026-07","2026年07月"], ["2026-06","2026年06月"], ["2026-05","2026年05月"], ["2026-04","2026年04月"], ["2026-03","2026年03月"], ["2026-02","2026年02月"], ["2026-01","2026年01月"], ["2025-12","2025年12月"], ["2025-11","2025年11月"], ["2025-10","2025年10月"], ["2025-09","2025年09月"], ["2025-08","2025年08月"], ["2025-07","2025年07月"], ["2025-06","2025年06月"]]],
    ["Hsck", "黄色淘宝", [["8","中文步兵"], ["9","中文骑兵"], ["10","日本无码"], ["7","日本有码"], ["15","国产视频"], ["21","欧美巨炮"], ["22","激情动漫"]]],
    ["Bus", "磁力巴士", [["62","折磨"], ["5g","嘔吐"], ["52","處男"], ["4d","運動"], ["3x","殘忍畫面"], ["3v","惡作劇"], ["3t","學校作品"], ["3r","粗暴"], ["3g","通姦"], ["3e","姐妹"], ["3d","雙性人"], ["3b","性奴"], ["37","倒追"], ["35","性騷擾"], ["2x","戀腿癖"], ["2v","偷窥"], ["2r","男同性恋"], ["2e","情侶"], ["2d","戀乳癖"], ["1y","其他戀物癖"]]],
    ["xingba", "杏吧资源", [["1","视频一区"], ["54","日韩无码"], ["55","国产主播"], ["56","视频三区"], ["57","日韩精品"], ["58","欧美劲爆"], ["59","成人动漫"], ["60","自拍偷拍"], ["61","伦理影片"], ["62","中文字幕"], ["63","人妻系列"], ["64","制服诱惑"], ["65","强奸乱伦"], ["66","AV明星"], ["68","SM重味"], ["69","视频二区"], ["70","巨乳尤物"], ["71","颜射系列"], ["72","口交视频"], ["73","自慰系列"], ["74","教师学生"], ["75","群P换妻"], ["76","AI换脸"], ["78","AV解说"], ["79","视频四区"], ["80","吃瓜黑料"], ["81","酒店探花"], ["82","直播裸聊"], ["83","反差母狗"], ["84","颜值正义"], ["85","熟女少妇"], ["86","人兽乱交"], ["89","国产传媒"], ["90","视频五区"], ["91","野战车震"], ["92","SM调教"], ["93","家庭乱伦"], ["94","百合女同"], ["95","学生空姐"], ["96","撸管必看"], ["97","偷情少妇"], ["98","小说专区"], ["99","都市激情"], ["100","校园情色"], ["101","少妇縱情"], ["102","国風倫理"], ["103","恋情偷情"], ["104","玄幻仙侠"], ["105","连淫幻想"], ["106","图片专区"], ["107","唯美写真"], ["108","网友自拍"], ["109","露出激情"], ["110","街拍偷拍"], ["111","丝袜美腿"], ["112","卡通漫画"], ["113","欧美风情"]]],
    ["bp", "白嫖资源", []],
    ["lj", "辣椒资源", [["1","国产自拍"], ["2","欧美极品"], ["3","日韩无码"], ["4","AV明星"], ["17","公告"], ["18","头条"], ["20","中文字幕"], ["21","动漫精品"], ["22","极骚萝莉"], ["23","人妖视频"], ["24","重咸口味"], ["25","三级自慰"], ["26","强奸乱伦"], ["27","独家擂台格斗"], ["28","辣椒GIGA"], ["31","HEYZO"], ["32","独家DMM"], ["33","HEY诱惑"], ["34","童颜巨乳"], ["35","高潮喷吹"], ["36","激情口交"], ["37","绝美少女"], ["38","首次亮相"], ["39","柚木TINA"], ["40","原纱央莉"], ["41","大桥未久"], ["42","AV明星1"], ["43","仁科百华"], ["44","天海翼"], ["45","小川阿佐美"], ["46","三上悠亚"], ["47","长泽梓"]]],
    ["new2", "奶香资源", [["1","精品国产"], ["2","精品日韩"], ["3","精品综合"], ["4","精品小说"], ["5","精品美图"], ["20","国产自拍"], ["21","主播诱惑"], ["22","探花约炮"], ["23","偷拍偷窥"], ["24","网曝吃瓜"], ["25","抖阴短片"], ["26","传媒剧情"], ["27","日韩主播"], ["28","日韩无码"], ["29","中文字幕"], ["30","AV解说"], ["31","换脸明星"], ["32","强奸乱伦"], ["33","女优明星"], ["34","欧美激情"], ["35","重口激情"], ["36","三级伦理"], ["37","剧情动漫"], ["38","SM调教"], ["39","女同性恋"], ["40","VR视角"], ["41","都市言情"], ["42","暴力侵犯"], ["43","家庭伦伦"], ["44","性感身体"], ["45","角色扮演"], ["46","福利姬"], ["47","漫画连载"]]],
    ["new3", "森林资源", [["20","精品推荐"], ["22","国产色情"], ["23","主播直播"], ["24","亚洲无码"], ["25","亚洲有码"], ["26","中文字幕"], ["27","巨乳美乳"], ["28","人妻熟女"], ["29","强奸乱伦"], ["30","欧美精品"], ["31","萝莉少女"], ["32","伦理三级"], ["33","成人动漫"], ["34","自拍偷拍"], ["35","制服丝袜"], ["36","口交颜射"], ["37","日本精品"], ["38","Cosplay"], ["39","素人自拍"], ["40","台湾辣妹"], ["41","韩国御姐"], ["42","唯美港姐"], ["43","东南亚AV"], ["44","欺辱凌辱"], ["45","剧情介绍"], ["46","多人多P"], ["47","91探花"], ["48","网红流出"], ["49","野外露出"], ["50","古装扮演"], ["51","女优系列"], ["52","可爱学生"], ["53","风情旗袍"], ["54","兽耳系列"], ["55","瑜伽裤"], ["56","闷骚护士"], ["57","过膝袜"], ["58","网曝门"], ["59","传媒出品"], ["60","女同性恋"], ["61","男同性恋"], ["63","恋腿狂魔"], ["64","都市激情"], ["65","校园情事"], ["66","人妻縱情"], ["67","風俗倫理"], ["68","另类小说"], ["69","武侠古典"], ["70","长篇连载"], ["71","唯美写真"], ["72","网友自拍"], ["73","露出激情"], ["74","街拍偷拍"], ["75","丝袜美腿"], ["76","卡通漫画"], ["77","欧美风情"]]],
    ["lb", "乐播资源", [["1","亚洲情色"], ["2","国产主播"], ["3","国产自拍"], ["4","无码专区"], ["5","欧美性爱"], ["6","熟女人妻"], ["7","强奸乱伦"], ["8","巨乳美乳"], ["9","中文字幕"], ["10","制服诱惑"], ["11","女同性恋"], ["12","卡通动画"], ["13","视频伦理"], ["14","少女萝莉"], ["15","重口色情"], ["16","人兽性交"], ["33","福利姬"]]]
];

function init(ext) {
    if (!ext) return;
    let o = ext;
    if (typeof ext === 'string') { try { o = JSON.parse(ext); } catch (e) { return; } }
    if (o && o.ext !== undefined && !o.base) {
        o = o.ext;
        if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { return; } }
    }
    if (o && o.base) BASE = String(o.base).replace(/\/+$/, '');
    if (o && o.headers && typeof o.headers === 'object') HEADERS = Object.assign({ 'User-Agent': UA }, o.headers);
}

// ---------------- 网络：强制同步 ----------------
function request(url, options) {
    const o = Object.assign({ async: false, headers: HEADERS }, options || {});
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

// ---------------- 域名自愈 ----------------
// 主域失效时按 永久域名 → www → cdn 号 × xyso 号 组合探测。
// 判据必须看内容特征（中转页也是 200），只看状态码会被骗。
function idnaSeg(cdn) {
    // cdn1023-2永久地址xyunso点com卍 -> xn--cdn1023-2xyunsocom-9122aj05ezusckai173b5uwa
    // 2026-10-24 实测：-1- 与 -2- 两种段位都可用，先试 -2-（xy05.cc 跳转页当前指向它）。
    return 'xn--cdn' + cdn + '-2xyunsocom-9122aj05ezusckai173b5uwa';
}

function hostList() {
    const out = ['https://xy05.cc', 'https://www.xy05.cc'];
    const cdns = [1023, 1019, 1021, 1020, 1022];
    const xys = [31, 30, 32];
    for (let i = 0; i < cdns.length; i++) {
        for (let j = 0; j < xys.length; j++) {
            // 域名段是三位补零（xyso031），不是两位（旧实现拼成 xyso31，全部 000）
            const s = idnaSeg(cdns[i]);
            const n = String(xys[j]);
            const pad = n.length < 3 ? ('00' + n).slice(-3) : n;
            out.push('https://' + s + '.xyso' + pad + '.hair');
        }
    }
    return out;
}

let HOST_OK = '';

function probe(host) {
    try {
        const c = bodyOf(request(host + '/' + JUMP, {}));
        return c.length >= 8000 && c.indexOf('video-title-text') >= 0;
    } catch (e) { return false; }
}

function fetchText(path) {
    // 无论 path 是否自带查询串，都必须带上 jump 门禁，否则拿到中转页
    const full = path.indexOf('?') >= 0 ? path + '&mod=jump&jump_count=1' : path + JUMP;
    const use = HOST_OK || BASE;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const c = bodyOf(request(use + full, {}));
            // 中转页 / 空页都当失败，触发换域
            if (c && c.length >= 3000 && c.indexOf('video-title-text') >= 0) { HOST_OK = use; return c; }
            if (c && c.length >= 3000 && (c.indexOf('a5-play-heading') >= 0 || c.indexOf('Missplay.php') >= 0)) { HOST_OK = use; return c; }
            if (c && c.length >= 3000 && path.indexOf('/play/') >= 0) { HOST_OK = use; return c; }
        } catch (e) { }
        break;
    }
    const list = hostList();
    for (let i = 0; i < list.length; i++) {
        if (list[i] === use) continue;
        if (probe(list[i])) {
            HOST_OK = list[i];
            BASE = list[i];
            return bodyOf(request(list[i] + full, {}));
        }
    }
    throw new Error('all hosts dead');
}

// ---------------- 工具 ----------------
function unent(s) {
    if (!s) return '';
    return s.replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); });
}

function stripTags(s) { return unent(String(s || '').replace(/<[^>]+>/g, '')).trim(); }

function absUrl(u) {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === '/') return (HOST_OK || BASE) + u;
    return (HOST_OK || BASE) + '/' + u;
}

// ---------------- 封面缓存 ----------------
// 详情页 HTML 里没有自己的封面（列表图才是真封面，详情页只挂推荐位），
// 所以列表解析时把 id -> pic 存下来，detail 阶段回填。
const PIC_CACHE = {};

function rememberPic(list) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].vod_id && list[i].vod_pic) PIC_CACHE[list[i].vod_id] = list[i].vod_pic;
    }
}

// ---------------- 列表解析 ----------------
// <li><div class="video"><a href="/play/miss/xxx.html" class="thumbnail">
//   <div class="video-thumb"><img data-original="..."/></div>
//   <span class="video-title"><span class="video-title-text">标题</span>
//   <span class="video-overlay badge transparent">角标</span>
function parseList(html) {
    const out = [];
    const re = /<li>\s*<div class="video">\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const blk = m[2];
        const idm = /^\/play\/([^"]+?)\.html/.exec(m[1]);
        if (!idm) continue;
        const tm = /class="video-title-text">([\s\S]*?)<\/span>/.exec(blk);
        const pm = /data-original="([^"]*)"/.exec(blk);
        const bm = /class="video-overlay[^"]*">([\s\S]*?)<\/span>/.exec(blk);
        let pic = pm ? pm[1] : '';
        if (!pic) {
            const s2 = /<img[^>]+src="(https?:[^"]+)"/.exec(blk);
            if (s2) pic = s2[1];
        }
        out.push({
            vod_id: idm[1],
            vod_name: stripTags(tm ? tm[1] : ''),
            vod_pic: pic,
            vod_remarks: stripTags(bm ? bm[1] : '')
        });
    }
    return out;
}

// 分页：<div class="a5-page-status"><a href="#">1/2000</a>
// 站点硬上限 500 页（实测 2500 也回到 500/2000），照抄不修正。
function parseMaxPage(html) {
    const m = /a5-page-status[^>]*>\s*<a[^>]*>\s*(\d+)\s*\/\s*(\d+)/.exec(html);
    if (m) return parseInt(m[2], 10);
    const m2 = /\/index\/(\d+)\.html/.exec(html);
    return m2 ? parseInt(m2[1], 10) : 1;
}

// ---------------- 分类 / 筛选 ----------------
function findCat(key) {
    for (let i = 0; i < CATS.length; i++) if (CATS[i][0] === key) return CATS[i];
    return null;
}

function classList() {
    return CATS.map(function (c) { return { type_id: c[0], type_name: c[1] }; });
}

// 筛选必须无条件生成：home(filter) 的入参在部分壳里是 undefined，
// 旧实现在开头 if (!filter) return {} 会让整个筛选表变空，客户端筛选弹窗直接空。
// 每个 type_id 都要有键（硬规范第 6 条），无子分类的给空数组。
function filtersFor(filter) {
    const f = {};
    for (let i = 0; i < CATS.length; i++) {
        const c = CATS[i];
        if (!c[2] || c[2].length === 0) { f[c[0]] = []; continue; }
        const vals = [{ n: '全部', v: '' }];
        for (let j = 0; j < c[2].length; j++) vals.push({ n: c[2][j][1], v: c[2][j][0] });
        f[c[0]] = [{ key: 'tag', name: '子分类', value: vals }];
    }
    return f;
}

// tid 形如 "miss" 或 "miss::fc2"（大类::子标签）
function catPath(tid) {
    const p = String(tid || '').split('::');
    const key = p[0];
    const tag = p.length > 1 ? p[1] : '';
    return tag ? '/list/' + key + '/' + tag + '.html' : '/list/' + key + '/index.html';
}

// ---------------- 详情 ----------------
function parseDetail(html, id) {
    const d = { vod_id: id, vod_name: '', vod_pic: '', vod_content: '', vod_remarks: '', vod_year: '', vod_area: '', vod_actor: '', vod_director: '' };
    const h1 = /<h1 class="panel-title">([\s\S]*?)<\/h1>/.exec(html);
    if (h1) d.vod_name = stripTags(h1[1]);
    // 详情页第一张图往往是推荐位（番号都对不上），列表缓存优先，再从页内找 slug 命中
    const slug0 = id.indexOf('/') >= 0 ? id.substring(id.indexOf('/') + 1) : id;
    if (PIC_CACHE[id]) {
        d.vod_pic = PIC_CACHE[id];
    } else {
        const slugLc = String(slug0).toLowerCase();
        const imgs = html.match(/data-original="([^"]*)"/g) || [];
        for (let i = 0; i < imgs.length; i++) {
            const v = /data-original="([^"]*)"/.exec(imgs[i])[1];
            if (v.toLowerCase().indexOf(slugLc) >= 0) { d.vod_pic = v; break; }
        }
        // 兜底：miss 类封面规律 i0.wp.com/fourhoi.com/<slug>/cover.jpg
        if (!d.vod_pic && /^[a-z0-9\-]+$/i.test(slug0)) d.vod_pic = 'https://i0.wp.com/fourhoi.com/' + slug0 + '/cover.jpg';
    }
    const cm = /class="a5-detail-card"[\s\S]*?<\/div>\s*<\/div>/.exec(html);
    const src = cm ? cm[0] : html;
    const code = /🔖\s*番号：([^<]*)/.exec(src);
    const date = /🕒\s*更新：([^<]*)/.exec(src);
    const dur = /⏱\s*时长：([^<]*)/.exec(src);
    if (date) d.vod_year = stripTags(date[1]).substring(0, 10);
    if (dur) d.vod_remarks = stripTags(dur[1]);
    const dir = /🎬\s*导演：([^<]*)/.exec(src);
    if (dir) d.vod_director = stripTags(dir[1]);
    const tags = [];
    const tre = /🏷\s*([^<]*)/g;
    let tm2;
    while ((tm2 = tre.exec(src)) !== null) tags.push(stripTags(tm2[1]));
    let content = '';
    if (code) content += '番号：' + stripTags(code[1]) + '\\n';
    if (dur) content += '时长：' + stripTags(dur[1]) + '\\n';
    if (dir) content += '导演：' + stripTags(dir[1]) + '\\n';
    if (tags.length) content += '标签：' + tags.join(' / ') + '\\n';
    d.vod_content = content;
    d.vod_actor = tags.slice(0, 6).join(',');
    return d;
}

// 播放源：详情页 iframe src="/Player/<脚本>.php?uu=<上游>"
// 各大类脚本不同（miss→Missplay.php，17cuk→17cplay.php …），
// 所以整条 src 原样带走，play() 阶段再拆。
function parsePlayUrl(html) {
    const m = /<iframe[^>]+src="(\/Player\/[^"]+)"/.exec(html);
    if (m) return m[1];
    const m2 = /uu=([^"'&\s]+)/.exec(html);
    return m2 ? '/Player/Missplay.php?uu=' + m2[1] : '';
}

// Missplay.php 里直接列出各清晰度 m3u8（带 expires + signature）
function parseQuality(html) {
    const re = /(https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/g;
    const seen = {};
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        const u = m[1];
        if (seen[u]) continue;
        seen[u] = 1;
        const q = /\/(\d+p)\//.exec(u);
        out.push({ n: q ? q[1] : '默认', u: u });
    }
    out.sort(function (a, b) {
        const pa = parseInt(a.n, 10) || 0, pb = parseInt(b.n, 10) || 0;
        return pb - pa;
    });
    return out;
}

// ---------------- 对外方法 ----------------
function home(filter) {
    let list = [];
    try { list = parseList(fetchText('/')); } catch (e) { }
    rememberPic(list);
    return JSON.stringify({ class: classList(), filters: filtersFor(filter), list: list });
}

function homeVod() {
    let list = [];
    try { list = parseList(fetchText('/')); } catch (e) { }
    rememberPic(list);
    return JSON.stringify({ list: list });
}

function category(tid, pg, filter, extend) {
    let page = parseInt(pg, 10);
    if (!page || page < 1) page = 1;
    let tag = '';
    if (extend) {
        if (typeof extend === 'string') { try { extend = JSON.parse(extend); } catch (e) { extend = null; } }
        if (extend && extend.tag) tag = String(extend.tag);
    }
    let t = String(tid || '');
    if (tag) {
        const parts = t.split('::');
        t = parts[0] + '::' + tag;
    }
    let path = catPath(t);
    if (page > 1) {
        const p = String(t).split('::');
        const key = p[0];
        const tg = p.length > 1 ? p[1] : 'index';
        path = '/list/' + key + '/' + tg + '/' + page + '.html';
    }
    let html = '';
    try { html = fetchText(path); } catch (e) { return JSON.stringify({ page: page, pagecount: 0, limit: 20, total: 0, list: [] }); }
    const list = parseList(html);
    rememberPic(list);
    const pc = parseMaxPage(html);
    return JSON.stringify({ page: page, pagecount: pc, limit: 20, total: pc * 20, list: list });
}

function detail(id) {
    const sid = String(id || '');
    let html = '';
    try { html = fetchText('/play/' + sid + '.html'); } catch (e) {
        return JSON.stringify({ list: [] });
    }
    const d = parseDetail(html, sid);
    const uu = parsePlayUrl(html);
    if (uu) {
        // 单线路「直连」，多档清晰度放同一线路的多集
        d.vod_play_from = '直连';
        d.vod_play_url = '播放$' + encodeURIComponent(sid) + '@' + encodeURIComponent(uu);
    } else {
        d.vod_play_from = '';
        d.vod_play_url = '';
    }
    return JSON.stringify({ list: [d] });
}

function search(key, quick, pg) {
    let page = parseInt(pg, 10);
    if (!page || page < 1) page = 1;
    let html = '';
    try { html = fetchText('/?m=search&k=' + encodeURIComponent(key)); } catch (e) {
        return JSON.stringify({ list: [] });
    }
    const list = parseList(html);
    rememberPic(list);
    return JSON.stringify({ list: list, pagecount: parseMaxPage(html) });
}

function play(flag, id, vipFlags) {
    // id 形如 "<slug>@<uu>"，uu 已 URI 编码
    let uu = '';
    const at = String(id || '').lastIndexOf('@');
    if (at >= 0) uu = decodeURIComponent(String(id).substring(at + 1));
    const hdr = JSON.stringify(Object.assign({ 'User-Agent': UA, 'Referer': (HOST_OK || BASE) + '/' }, HEADERS));
    if (!uu) return JSON.stringify({ parse: 0, playUrl: '', url: '', header: hdr });
    // 上游本身就是绝对 m3u8（xingba / lj / new2 / lb 等直挂站源）→ 直接用
    if (/^https?:\/\/.+\.m3u8(\?|$)/i.test(uu)) {
        return JSON.stringify({ parse: 0, playUrl: '', url: uu, header: hdr });
    }
    // 其余（miss 的短 id、17cuk 的相对路径）都要过 /Player/<脚本>.php 换真地址
    let html = '';
    try { html = fetchText(uu); } catch (e) { }
    const qs = parseQuality(html);
    if (!qs.length) {
        // 换不到就原样丢出去，至少 Referer 已带
        return JSON.stringify({ parse: 0, playUrl: '', url: /^https?:/i.test(uu) ? uu : absUrl(uu), header: hdr });
    }
    return JSON.stringify({ parse: 0, playUrl: '', url: qs[0].u, header: hdr });
}

function isVideo(url) { return /\.m3u8|\.mp4|\.ts(\?|$)/i.test(String(url || '')); }
function sniffer() { return false; }
function action(action) { return JSON.stringify({}); }
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
