// ============================================================
// 影视仓 / TVBox 本地包 · QuickJS spider（全同步版）
// 站：秘密研究所（XBPQ 规则站，CMS 接口 closed，纯 HTML 爬虫）
//
// api.json:
//   { "key":"miji", "name":"秘密研究所", "type":3,
//     "api":"./miji.js",
//     "ext": { "host":"https://vke-urwg-3wa.xfleet-jul03.cc" } }
//
// 硬规范：
//   1) 全同步，禁止 async / await（QuickJS 宿主不 pump 微任务）
//   2) export default 对象
//   3) 每个方法 return JSON 字符串
//   4) http() 传 async:false，写两遍
// ============================================================

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

let HOST = 'https://vke-urwg-3wa.xfleet-jul03.cc';
let HEADERS = { 'User-Agent': UA };

// 分类兜底表：name$id，用 # 分隔。正常走首页导航动态解析，这里只在首页抓不到时兜底。
// id 全部按 2026-10-24 站点导航实测核对（分组标题 45/46/47/200/300/400/500 不是分类，不列）。
const CATS_RAW = '成人短剧$66#国产精品$49#国产乱伦$55#无码流出$50#日本高清$51#中文字幕$52#欧美极品$53#动漫精品$54' +
    '#国产热瓜$65#主播诱惑$64#良家少女$63#淫荡熟女$61#三级伦理$62#自拍偷拍$57#旗袍风情$58#岛国小女$59' +
    '#剧情解说$68#网红黑料$71#清纯女生$73#同性世界$70#国产高清$72#美乳妹妹$69#黑料网曝$67#SM变态$56' +
    '#综合传媒$201#麻豆传媒$202#葫芦影业$203#猫爪影像$204#天美传媒$205#果冻传媒$206#91制片厂$207#蜜桃传媒$208' +
    '#综合番号$350#200GANA$301#259LUXU$305#261ARA$306#277DCV$307#300MIUM$302#300MAAN$308#300NTK$309' +
    '#夢乃愛華$401#波多野结衣$402#三上悠亚$403#河北彩花$404#高桥圣子$405#葵司$406#水卜櫻$407#紗倉真菜$408' +
    '#桃乃木香奈$409#安齋拉拉$410#天使萌$411#相澤南$412#櫻空桃$413#Miru$414#羽咲美晴$415#山岸逢花$416' +
    '#七澤米亞$417#松本一香$418#木下日葵$419#二階堂夢$420#田中宁宁$421#藤森里穂$422#稻场流花$423#久留木玲$424' +
    '#有栖花绯$425#沙月芽衣$426#東條夏$427#北野望$428#明里紬$429#天音真比奈$430#早野詩$431#篠田優$432' +
    '#神宮寺奈緒$433#逢見梨花$434#藍芽美月$435#鈴木心春$436#有坂深雪$437#架乃由羅$438#美之嶋惠理$439#三宮椿$440' +
    '#川上奈奈美$441#湊莉久$442#小島南$443#平手真菜$444#新川愛七$445#鷲尾芽衣$446' +
    '#酒店$513#小宝寻花$514#91系列$516#综合探花$511#午夜寻花$515#91沈先生$501#文轩探花$502#鸭哥探花$506';

// 标签库：站点「热门搜索」全量词（2026-10-24 站点实测）。
// 本站分类页没有筛选条、/vodshow 也是 404，唯一真实生效的筛选通道是全站搜索
// /vodsearch/<词>，所以标签筛选走搜索路径，不是分类内过滤。
const TAG_WORDS = '私拍 乱伦 轮奸 老阿姨 少女网 性奴 白虎 骚货 国产 精品 90后 黑丝 母子 互插 奶奶 毁三观 ' +
    '萌妹 喷水 热瓜 重口 熟女 00后 网曝门 兄妹 美母 糖心 无套 中文 插B 巨乳 萝莉控 网红 自慰 处女 骚女 ' +
    '鸡巴大 猎奇 短发 捆绑 黑人 人妻 网曝 强奸 妈妈 20岁 一本道 口爆 内射 经典 热播 鬼父 小姐妹 吃瓜';

let TAG_LIST = null;

function tagList() {
    if (TAG_LIST) return TAG_LIST;
    const raw = TAG_WORDS.split(' ');
    const seen = {};
    const out = [];
    for (let i = 0; i < raw.length; i++) {
        const w = String(raw[i] || '').trim();
        if (!w || seen[w]) continue;
        seen[w] = 1;
        out.push(w);
    }
    TAG_LIST = out;
    return out;
}

// ---------- 网络（全同步） ----------

function request(url, options) {
    const o = Object.assign({ async: false }, options || {});
    o.async = false;
    if (typeof http === 'function') return http(url, o);
    if (typeof req === 'function') return req(url, o);
    if (typeof net !== 'undefined' && net && typeof net.http === 'function') return net.http(url, o);
    throw new Error('no http binding');
}

function getText(url) {
    const res = request(url, { headers: HEADERS });
    if (!res) return '';
    if (res.ok === false) return '';
    const c = res.content;
    if (typeof c === 'string') return c;
    return String(c || '');
}

// 带状态码的抓取：上游会限流（实测连打三次有两次 403），
// 403 时重试一次（换连接换时间片），别当失败直接抛。
// 2026-10-29 站方服务器抖动加剧（详情页连测 3 次成 1），重试窗 2→3 次提成功率。
function getTextSt(url) {
    let res = null;
    for (let i = 0; i < 3; i++) {
        try { res = request(url, { headers: HEADERS }); } catch (e) { res = null; }
        const st = res && (res.status || res.code);
        if (res && res.ok !== false && st !== 403) break;
        // 403 就再来一次，不做 busy-wait（QuickJS 无 sleep，空转会卡死电视）
    }
    if (!res || res.ok === false) return '';
    const c = res.content;
    return typeof c === 'string' ? c : String(c || '');
}

// 首页/列表页抓取：站点 DNS 有多个 A 记录且混有病节点，
// 单次请求可能落进 615 字节的空壳页，多次重试即可绕开。
// 2026-10-29 实证：站方 36 条 A 记录健康率跌至两三成（沙箱 10 连 2/10），
// 114DNS 仅回 3 条 A（含全死 IP）→ 电视端粘死概率高，重试窗 3→5（快败型只耗 0.2-0.4s，健康命中由 >5000B 提前退出兜住）。
function getPage(path) {
    let best = '';
    for (let i = 0; i < 5; i++) {
        let h = '';
        try { h = getTextSt(HOST + path); } catch (e) { h = ''; }
        if (h && h.length > best.length) best = h;
        if (best.length > 5000) return best;
    }
    return best;
}

function abs(u) {
    const s = String(u || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.charAt(0) === '/') return HOST + s;
    return HOST + '/' + s;
}

// ---------- 封面归一化 ----------

// 只取 path 部分（含首个 /），丢掉任何 host 差异
function picPath(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    if (s.indexOf('//') === 0) s = 'https:' + s;
    const m = s.match(/^https?:\/\/[^\/]+([\s\S]*)$/i);
    if (m) s = m[1] || '';
    if (s.charAt(0) !== '/') s = '/' + s;
    // 压缩参数全线不可用（?w= / ?t= 返占位或超时），原图才通
    const q = s.indexOf('?');
    if (q >= 0) s = s.slice(0, q);
    // _thumb.jpg 缩略图 404，回退原名
    s = s.replace(/_(thumb|small|mini)\.(jpg|jpeg|png|webp)$/i, '.$2');
    return s;
}

// 站点同域 /upload/vod/... 实测最稳（24/24，平均 235KB）
// 绝对地址保留原 host，只清无效的压缩参数与缩略后缀
function fixPic(u) {
    const p = picPath(u);
    if (!p) return '';
    const raw = String(u || '').trim();
    if (/^https?:\/\//i.test(raw) || raw.indexOf('//') === 0) {
        const m = raw.replace(/^\/\//, 'https://').match(/^(https?:\/\/[^\/]+)/i);
        const h = m ? m[1] : '';
        if (h) return h + p;
    }
    return abs(p);
}

// ---------- 文本工具 ----------

// 解码 HTML 实体 + 去标签
function decode(s) {
    if (s === undefined || s === null) return '';
    let t = String(s);
    t = t.replace(/&#(\d+);/g, function (m, d) {
        const n = parseInt(d, 10);
        if (!isFinite(n) || n < 1 || n > 65535) return '';
        return String.fromCharCode(n);
    });
    t = t.replace(/&#x([0-9a-fA-F]+);/g, function (m, h) {
        const n = parseInt(h, 16);
        if (!isFinite(n) || n < 1 || n > 65535) return '';
        return String.fromCharCode(n);
    });
    t = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    return t.replace(/<[^>]*>/g, '').trim();
}

// 清掉会破坏分隔符的字符
function safe(s) {
    return decode(s).replace(/\$/g, '＄').replace(/#/g, '＃').replace(/\|\|\|/g, '｜｜｜').trim();
}

// 按 前缀..后缀 切块（XBPQ 的 && 语义）
function cutAll(html, pre, post, limit) {
    const out = [];
    if (!html) return out;
    let i = 0;
    const cap = limit || 500;
    while (out.length < cap) {
        const a = html.indexOf(pre, i);
        if (a < 0) break;
        const b = html.indexOf(post, a + pre.length);
        if (b < 0) break;
        out.push(html.slice(a + pre.length, b));
        i = b + post.length;
    }
    return out;
}

function cutOne(html, pre, post) {
    if (!html) return '';
    const a = html.indexOf(pre);
    if (a < 0) return '';
    const b = html.indexOf(post, a + pre.length);
    if (b < 0) return '';
    return html.slice(a + pre.length, b);
}

function firstMatch(s, re) {
    const m = String(s || '').match(re);
    return m ? m[1] : '';
}

// ---------- 列表解析 ----------

// 从 <li> 块里取 href / alt / src，只认 /voddetail/数字/
function parseLi(seg) {
    const href = firstMatch(seg, /href="([^"]*)"/);
    if (!/^\/voddetail\/\d+\/?$/.test(href)) return null;
    const id = firstMatch(href, /\/voddetail\/(\d+)/);
    if (!id) return null;
    const name = decode(firstMatch(seg, /alt="([^"]*)"/));
    const pic = firstMatch(seg, /src="([^"]*)"/);
    const marks = decode(firstMatch(seg, /<p>([\s\S]*?)<\/p>/));
    return {
        vod_id: id,
        vod_name: name || ('影片 ' + id),
        vod_pic: fixPic(pic),
        vod_remarks: marks
    };
}

// 扫全部 <li>，保留含 class="thumbnail" 且 href 合法的
function parseList(html) {
    const out = [];
    if (!html) return out;
    let i = 0;
    while (out.length < 200) {
        const a = html.indexOf('<li', i);
        if (a < 0) break;
        const b = html.indexOf('</li>', a);
        if (b < 0) break;
        const seg = html.slice(a, b);
        i = b + 5;
        if (seg.indexOf('class="thumbnail"') < 0) continue;
        const it = parseLi(seg);
        if (it) out.push(it);
    }
    return out;
}

// ---------- 详情解析 ----------

function parseDetail(html, id) {
    let name = decode(cutOne(html, '<title>', '</title>'));
    // 标题常带 "_副标题" 后缀，取最后一个 _ 之前
    const u = name.lastIndexOf('_');
    if (u > 0) name = name.slice(0, u).trim();

    // 封面：detail-poster 下的 img
    let pic = '';
    const dp = html.indexOf('class="detail-poster"');
    if (dp >= 0) {
        const win = html.slice(dp, dp + 1200);
        pic = firstMatch(win, /<img[^>]*src="([^"]*)"/);
    }
    if (!pic) {
        const og = firstMatch(html, /<meta[^>]*property="og:image"[^>]*content="([^"]*)"/);
        if (og) pic = og;
    }

    // 播放块
    const flags = [];
    const eps = [];
    // 注意：wn_link_below_player 在页面 CSS 里也出现一次，
    // 必须用完整 class 串定位真正的播放块
    // 2026-10-24：站点改版。选集已在 <div class="wn-episodes"> 的 .wn-ep-grid 里，
    // 每集是 <a href="/vodplay/<id>-1-<n>/" title="第01集">第01集</a>。
    // 旧的 wn_block_link wn_link_below_player 区块现在是空壳（只剩 <div> 没有链接），
    // 且旧正则强制要求 <span> 包标题，属性式 title 一律匹配不到 → vod_play_url 恒空。
    let scope = '';
    const ep = html.indexOf('wn-episodes');
    if (ep >= 0) scope = html.slice(ep, ep + 20000);
    if (!scope) {
        // 老版式兜底：整页里所有 /vodplay/ 链接都算
        scope = html;
    }
    // 两段式：先抓整个 <a ...>...</a>，再从标签串里单独取 href / title / 文本。
    // 一行正则里同时用非贪婪匹配多个可选属性，title 永远会落到空捕获组上。
    const reA = /<a\s+([^>]*\/vodplay\/[^>]*)>([\s\S]{0,300}?)<\/a>/g;
    let m;
    let k = 0;
    const seen = {};
    while ((m = reA.exec(scope)) !== null) {
        const attrs = m[1];
        const link = firstMatch(attrs, /href="(\/vodplay\/[^"]+)"/);
        if (!link) continue;
        if (seen[link]) continue;
        seen[link] = 1;
        k++;
        let title = safe(firstMatch(attrs, /title="([^"]*)"/));
        if (!title) title = safe(m[2] || '');
        if (!title) title = '第' + k + '集';
        flags.push(title);
        eps.push(title + '$' + abs(link));
        if (k >= 60) break;
    }

    // 本站 detail-info 实测恒为空（源码层面就没有输出），元数据改从
    // 面包屑 + meta+og 兜：这是唯一真实存在的信息源
    const info = cutOne(html, 'class="detail-info"', '</div>');
    let txt = decode(info);
    // cutOne 会切出 ">" 这种残渣，视为空
    if (txt.replace(/[<>\/\s]/g, '').length < 2) txt = '';

    // ---- 分类（面包屑倒数第二段）----
    let area = '';
    const crumb = cutOne(html, 'class="breadcrumbs"', '</div>');
    if (crumb) {
        const segs = [];
        const reC = /<a[^>]*>([\s\S]*?)<\/a>/g;
        let mc;
        while ((mc = reC.exec(crumb)) !== null) {
            const t = decode(mc[1]);
            if (t && t !== '首页') segs.push(t);
        }
        if (segs.length) area = segs[segs.length - 1];
    }

    // 简介：meta description 实测是全站通用 SEO 文案（不同影片内容完全相同），
    // 冒充简介只会误导。只用标题里的真实信息拼一句诚实的说明。
    // 年份：本站 detail-info 无数据；封面路径带上传日期 /20261021/xxx/1.jpg，
    // 取其中的年份（同为 4 位年，至少是真实存在的元数据，不是编的）
    let year = '';
    const yFromPic = firstMatch(pic, /\/vod\/((?:19|20)\d{2})\d{4}/);
    if (yFromPic) year = yFromPic;
    if (!year) year = firstMatch(pic, /((?:19|20)\d{2})\d{4}\//);
    if (!year) year = firstMatch(txt + (name || ''), /((?:19|20)\d{2})/);

    let content = txt;
    if (txt.replace(/[<>\/\s]/g, '').length < 2) content = '';
    if (!content) {
        const tag = name.replace(/[《》]/g, '');
        const bits = [];
        if (area) bits.push('分类：' + area);
        if (year) bits.push('年份：' + year);
        if (tag) bits.push('片名：' + tag);
        content = bits.join(' ｜ ');
    }
    content = String(content || '').replace(/^\s*《[^》]*》\s*[|｜]?\s*/, '').trim();
    if (content.length > 400) content = content.slice(0, 400) + '…';

    // 本站 detail-info 恒空，演职员确实没有；空串会被影视仓渲染成字面 null，
    // 所以给一个诚实的占位，避免出现 "导演: null"
    let actor = '暂无';
    let director = '暂无';

    const out = {
        vod_id: String(id || ''),
        vod_name: name || ('影片 ' + id),
        vod_pic: fixPic(pic),
        vod_remarks: '',
        vod_year: year || '',
        vod_area: area || '',
        vod_content: content || '',
        vod_play_from: flags.join('$$$'),
        vod_play_url: eps.join('#')
    };
    // 本站无演职员数据。空串会被影视仓桥接层渲染成字面 "null"，
    // 干脆不输出这两个键，让它回落到原生默认值
    if (actor) out.vod_actor = actor;
    if (director) out.vod_director = director;
    return out;
}

// ---------- 播放解析 ----------

// 从播放页抠 m3u8：优先 "link_pre":"","url":"..."
function extractPlay(html) {
    let u = '';
    if (!html) return '';
    u = cutOne(html, '"link_pre":"","url":"', '"');
    if (!u) u = cutOne(html, '"url":"', '"');
    if (!u) {
        const m = html.match(/(https?:(?:\\\/|\/)[^"'\s]+\.m3u8[^"'\s]*)/);
        if (m) u = m[1];
    }
    if (!u) return '';
    // 还原 \/
    u = u.split('\\/').join('/');
    return u.trim();
}

// ---------- 分类表 ----------

let CATS = null;

let HOME_HTML = '';

// 首页只抓一次，分类和列表共用
function homeHtml() {
    if (HOME_HTML) return HOME_HTML;
    HOME_HTML = getPage('/hwyayl/?link=m77.yanjiusuo22222.cc');
    if (!HOME_HTML || HOME_HTML.length < 5000) HOME_HTML = '';
    return HOME_HTML;
}

// 从首页导航区解析真实分类：<a href="/vodtype/52/">中文字幕</a>
// 站点实际有 60+ 分类，硬编码列表必然漏
function parseCats(html) {
    const out = [];
    if (!html) return out;
    const seen = {};
    const re = /href="\/vodtype\/(\d+)\/"[^>]*>([\s\S]{0,60}?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tid = String(m[1]).trim();
        let nm = decode(m[2]);
        if (!nm || nm === '更多' || nm.length > 24) continue;
        if (seen[tid]) continue;
        seen[tid] = 1;
        out.push({ type_id: tid, type_name: nm });
    }
    return out;
}

// 兜底表是全量实测结果（首页导航只露 8 位女优，全量 46 位已并进来），
// 首页解析结果只用于补站点改版后新冒出来的分类，不做主表——首页本身也要抓来出列表，不额外发请求。
function loadCats() {
    if (CATS) return CATS;
    const out = [];
    const have = {};
    const rows = CATS_RAW.split('#');
    for (let i = 0; i < rows.length; i++) {
        const p = (rows[i] || '').split('$');
        if (p.length < 2) continue;
        const tid = String(p[1]).trim();
        if (have[tid]) continue;
        have[tid] = 1;
        out.push({ type_id: tid, type_name: String(p[0]).trim() });
    }
    let live = [];
    try { live = parseCats(homeHtml()); } catch (e) { live = []; }
    for (let j = 0; j < live.length; j++) {
        if (have[live[j].type_id]) continue;
        have[live[j].type_id] = 1;
        out.push(live[j]);
    }
    out.push({ type_id: 'tag', type_name: '标签合集' });
    CATS = out;
    return out;
}

// ---------- 生命周期 ----------

function init(ext) {
    try {
        let o = ext;
        if (typeof o === 'string') o = JSON.parse(o || '{}');
        if (o && o.host) HOST = String(o.host).replace(/\/+$/, '');
        if (o && o.headers && typeof o.headers === 'object') {
            for (const k in o.headers) HEADERS[k] = String(o.headers[k]);
        }
    } catch (e) { }
    CATS = null;
    HOME_HTML = '';
    return '';
}

function home() {
    let cls = [];
    try { cls = loadCats(); } catch (e) { cls = []; }
    let list = [];
    try {
        list = parseList(homeHtml());
        if (list.length > 60) list = list.slice(0, 60);
    } catch (e) { list = []; }
    return JSON.stringify({ class: cls, filters: buildFilters(cls), list: list });
}

// 每个 type_id 都要挂同一份标签筛选，漏一个客户端在该分类点筛选就崩（硬规范第 6 条）。
// 标签入口单独开一个「标签合集」tab，与普通分类走两条路径。
function buildFilters(cls) {
    const vals = [{ n: '全部', v: '' }];
    const words = tagList();
    for (let i = 0; i < words.length; i++) vals.push({ n: words[i], v: words[i] });
    const one = [{ key: 'tag', name: '标签', value: vals }];
    const out = {};
    out['tag'] = one;
    for (let k = 0; k < cls.length; k++) out[cls[k].type_id] = one;
    return out;
}

function homeVod() {
    let list = [];
    try {
        list = parseList(homeHtml());
        if (list.length > 60) list = list.slice(0, 60);
    } catch (e) { list = []; }
    return JSON.stringify({ list: list });
}

function searchByTag(w, page) {
    const path = '/vodsearch/' + encodeURIComponent(w) + '----------' + page + '---/';
    let html = '';
    try { html = getPage(path); } catch (e) { html = ''; }
    let list = [];
    try { list = parseList(html); } catch (e) { list = []; }
    let total = 0;
    const mTotal = html.match(/共\s*(\d+)\s*条/);
    if (mTotal) total = Number(mTotal[1]) || 0;
    let pagecount = page;
    const mPages = html.match(/当前\s*\d+\s*\/\s*(\d+)\s*页/);
    if (mPages) pagecount = Number(mPages[1]) || page;
    if (pagecount < page) pagecount = page;
    if (!list.length && html && html.length > 500) pagecount = page > 1 ? page - 1 : 1;
    return JSON.stringify({
        page: page,
        pagecount: pagecount,
        limit: list.length || 24,
        total: total || pagecount * 24,
        list: list
    });
}

function tagOf(extend, tid) {
    let e = extend;
    if (typeof e === 'string') {
        try { e = JSON.parse(e); } catch (err) { e = null; }
    }
    let w = e && e.tag ? String(e.tag).trim() : '';
    if (!w && tid === 'tag') w = tagList()[0] || '';
    return w;
}

function category(tid, pg, filter, extend) {
    const page = Number(pg) > 0 ? Number(pg) : 1;
    const t = String(tid === undefined || tid === null ? '' : tid).trim() || '49';

    // 标签筛选走全站搜索（本站无分类内筛选参数，见 TAG_WORDS 上方说明）。
    // 「标签合集」tab 未选标签时取第一个词，避免空白页。
    const tag = tagOf(extend, t);
    if (tag) return searchByTag(tag, page);

    const path = '/vodtype/' + t + '-' + page + '/';
    let html = '';
    try { html = getPage(path); } catch (e) { html = ''; }
    let list = [];
    try { list = parseList(html); } catch (e) { list = []; }

    // 分页条里的最大页码只当参考上限：本站末页常常直接返回空壳，
    // 死信分页条会把用户带进空白页，所以以「本页 0 条」为准即停
    let barPage = 0;
    if (html) {
        const re = new RegExp('/vodtype/' + t + '-(\\d+)/', 'g');
        let m;
        while ((m = re.exec(html)) !== null) {
            const n = Number(m[1]);
            if (n > barPage) barPage = n;
        }
    }

    // 空页即停：抓到了页面但 0 条 = 真到底，收敛到 page-1；
    // 页面都没抓回来 = 网络抖动，别谎报到底，pagecount 保持 page 让用户重试
    if (!list.length) {
        const realEmpty = html && html.length > 500;
        const last = realEmpty ? (page > 1 ? page - 1 : 1) : page;
        return JSON.stringify({
            page: page,
            pagecount: last,
            limit: 24,
            total: realEmpty && page > 1 ? last * 24 : 0,
            list: []
        });
    }

    // 有数据：pagecount 取分页条上限与 page+1 的较大者可继续翻，
    // 但绝不返回小于当前页的值，否则影视仓会截断
    let pagecount = barPage > page ? barPage : page;
    if (pagecount < page) pagecount = page;
    return JSON.stringify({
        page: page,
        pagecount: pagecount,
        limit: list.length || 24,
        total: pagecount * 24,
        list: list
    });
}

function detail(id) {
    let ids = id;
    if (Object.prototype.toString.call(ids) === '[object Array]') ids = ids.join(',');
    ids = String(ids || '');
    if (!ids) return JSON.stringify({ list: [] });
    const arr = ids.split(',');
    const out = [];
    for (let i = 0; i < arr.length; i++) {
        const one = String(arr[i]).trim();
        if (!one) continue;
        let html = '';
        try { html = getTextSt(HOST + '/voddetail/' + one + '/'); } catch (e) { html = ''; }
        if (!html) continue;
        out.push(parseDetail(html, one));
    }
    return JSON.stringify({ list: out });
}

function search(wd, quick, pg) {
    const page = Number(pg) > 0 ? Number(pg) : 1;
    const kw = String(wd === undefined || wd === null ? '' : wd).trim();
    if (!kw) return JSON.stringify({ page: 1, pagecount: 0, limit: 20, total: 0, list: [] });

    // 真实分页格式：/vodsearch/{kw}----------{page}---/
    const enc = encodeURIComponent(kw);
    const path = '/vodsearch/' + enc + '----------' + page + '---/';
    let html = '';
    try { html = getPage(path); } catch (e) { html = ''; }
    let list = [];
    try { list = parseList(html); } catch (e) { list = []; }

    // 页脚写着「共1047条数据,当前1/66页」，直接读总页数
    let pagecount = page;
    let total = 0;
    const mTotal = html.match(/共\s*(\d+)\s*条/);
    if (mTotal) total = Number(mTotal[1]) || 0;
    const mPages = html.match(/当前\s*\d+\s*\/\s*(\d+)\s*页/);
    if (mPages) pagecount = Number(mPages[1]) || page;
    if (!pagecount || pagecount < page) {
        if (total && list.length) pagecount = Math.ceil(total / list.length);
    }

    return JSON.stringify({
        page: page,
        pagecount: pagecount,
        limit: list.length || 16,
        total: total,
        list: list
    });
}

// 主播放列表 → 媒体列表。vostrely 返回的 index.m3u8 只是单变体跳板
// （119B，含 EXT-X-STREAM-INF 无分片），个别壳子不会自动下钻，
// 这里主动跟一层，拿不到就原样交回去，绝不伪造 EXT-X-ENDLIST
function followMaster(url, hd) {
    let txt = '';
    try {
        const res = request(url, { headers: hd });
        if (res && res.ok !== false) txt = String(res.content || '');
    } catch (e) { txt = ''; }
    if (!txt || txt.indexOf('#EXT-X-STREAM-INF') < 0) return '';
    if (txt.indexOf('#EXT-X-ENDLIST') >= 0) return '';
    const lines = txt.split('\n');
    let best = '';
    let bestBw = -1;
    for (let i = 0; i < lines.length; i++) {
        const ln = String(lines[i] || '').trim();
        if (!ln || ln.charAt(0) === '#') continue;
        // 上一行的 BANDWIDTH 用于选最高码率
        let bw = 0;
        for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
            const mm = String(lines[j] || '').match(/BANDWIDTH=(\d+)/);
            if (mm) { bw = Number(mm[1]) || 0; break; }
        }
        if (bw > bestBw) { bestBw = bw; best = ln; }
    }
    if (!best) return '';
    if (/^https?:\/\//i.test(best)) return best;
    const o = url.match(/^(https?:\/\/[^\/]+)/);
    const root = o ? o[1] : '';
    if (best.charAt(0) === '/') return root + best;
    // 相对路径按父目录拼接
    const cut = url.lastIndexOf('/');
    return url.slice(0, cut + 1) + best;
}

// 抓 m3u8，统计内部 KEY/ts 实际 host，把 Referer 设成该域。
// 站点常把 m3u8 放母链域、KEY/分片放异域 CDN（如 c10.hs100.top → 98cdn.vip），
// 播放器只对母链套 Referer → 异域分片被防盗链拒 → 缓冲几百 KB 后归零。
// 这里动态取真实分片域覆盖 Referer，全链路同源匹配。
function m3u8Referer(url, hd) {
    let body = '';
    try {
        const res = request(url, { headers: hd });
        if (res && res.ok !== false) body = String(res.content || '');
    } catch (e) { body = ''; }
    if (!body) return hd;
    const cnt = {};
    const re = /https?:\/\/([^\/\s"'\\]+)/g;
    let m;
    while ((m = re.exec(body)) !== null) {
        const h = m[1];
        if (/streamfastpro|hs100|cdn|98cdn|hpvcng|m3u8|ts\?|\.ts$|\.js$/.test(h)) {
            cnt[h] = (cnt[h] || 0) + 1;
        }
    }
    let top = '', max = 0;
    for (const k in cnt) { if (cnt[k] > max) { max = cnt[k]; top = k; } }
    if (top) hd['Referer'] = 'https://' + top + '/';
    return hd;
}

function play(flag, id, vipFlags) {
    let s = String(id === undefined || id === null ? '' : id);
    const cut = s.indexOf('$');
    if (cut >= 0) s = s.slice(cut + 1);
    s = s.trim();
    if (!s) return JSON.stringify({ parse: 0, jx: 0, url: '' });

    // 已经是 m3u8 直链
    if (/\.(m3u8|mp4|flv|mkv|ts)(\?|$)/i.test(s)) {
        let u0 = s;
        const hd0 = { 'User-Agent': UA };
        if (/\.m3u8(\?|$)/i.test(s)) {
            const o0 = s.match(/^(https?:\/\/[^\/]+)/);
            if (o0) hd0['Referer'] = o0[1] + '/';
            // m3u8 内部 KEY/分片常落异域 CDN，按真实分片域覆盖 Referer
            hd0['Referer'] = m3u8Referer(s, hd0)['Referer'] || hd0['Referer'];
            const v = followMaster(s, hd0);
            if (v) u0 = v;
        }
        return JSON.stringify({ parse: 0, jx: 0, url: u0, header: hd0 });
    }

    // 播放页：抓一次抠真链
    const pageUrl = abs(s);
    let real = '';
    try { real = extractPlay(getTextSt(pageUrl)); } catch (e) { real = ''; }

    if (real && /^https?:\/\//i.test(real)) {
        const o = real.match(/^(https?:\/\/[^\/]+)/);
        const hd = { 'User-Agent': UA };
        if (o) hd['Referer'] = o[1] + '/';
        let url = real;
        if (/\.m3u8(\?|$)/i.test(real)) {
            hd['Referer'] = m3u8Referer(real, hd)['Referer'] || hd['Referer'];
            const v = followMaster(real, hd);
            if (v) url = v;
        }
        return JSON.stringify({ parse: 0, jx: 0, url: url, header: hd });
    }

    // 抠不到就交嗅探器
    return JSON.stringify({ parse: 1, jx: 0, url: pageUrl, header: HEADERS });
}

// ---------- 杂项 ----------

function isVideo(url) {
    return /\.(m3u8|mp4|flv|mkv|ts|mov)(\?|$)/i.test(String(url || ''));
}
function sniffer() { return false; }
function action(a) { return JSON.stringify({}); }
function proxy(p) { return JSON.stringify([]); }
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
