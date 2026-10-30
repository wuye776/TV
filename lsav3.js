var REGIONS = [
    { id: 'all', name: '最近更新' },
    { id: '37506951151616005', name: '日本' },
    { id: '37502746110197765', name: '华语' },
    { id: '89267787502977043', name: '亚洲' },
    { id: '37506960664297477', name: '欧美' },
    { id: '108746731541233665', name: '韩国' },
    { id: '88503927401611283', name: '动漫' }
];

var TAGS = [
    { id: '60884314597883923', name: '制服诱惑' },
    { id: '69885416911667205', name: '丰满' },
    { id: '87465526346907667', name: '小只马' },
    { id: '48565522333171717', name: '站立后入' },
    { id: '76194636040765445', name: '按摩店' },
    { id: '69844159858475013', name: '风俗店' },
    { id: '48567309660323845', name: '霸道总裁' },
    { id: '72092528614047749', name: '影视改编' },
    { id: '87465678516256787', name: '成人节目' },
    { id: '94570642174640147', name: '時間停止' }
];

function cats() {
    var out = [];
    for (var i = 0; i < REGIONS.length; i++) out.push({ type_id: REGIONS[i].id, type_name: REGIONS[i].name });
    out.push({ type_id: 'tag', type_name: '标签 >>' });
    // 不加诊断分类: 多出来的 tab 会让部分壳的 filters 映射错位
    return out;
}

// ---------------- 映射 ----------------

function b64url(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) { bytes.push(0xC0 | (c >> 6)); bytes.push(0x80 | (c & 63)); }
        else { bytes.push(0xE0 | (c >> 12)); bytes.push(0x80 | ((c >> 6) & 63)); bytes.push(0x80 | (c & 63)); }
    }
    return bytesB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDec(str) {
    var t = s(str).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return bytesUtf8(b64Bytes(t));
}

function playId(v) {
    var id = s(v.id);
    var pth = s(v.h265_url);
    var key = s(v.h265_key);
    if (!pth) return id;
    return id + '~' + b64url(pth) + '~' + b64url(key);
}

function parsePlayId(raw) {
    var t = s(raw);
    var parts = t.split('~');
    if (parts.length < 2) return null;
    var pth = '', key = '';
    try { pth = b64urlDec(parts[1]); } catch (e) { pth = ''; }
    try { key = parts.length > 2 ? b64urlDec(parts[2]) : ''; } catch (e) { key = ''; }
    if (!pth) return null;
    return { id: parts[0], path: pth, key: key };
}

function toVod(v) {
    var id = s(v.id);
    var out = {
        vod_id: id,
        vod_name: s(v.title),
        vod_pic: fixPic(v.coverphoto_h || v.coverphoto_v),
        vod_remarks: s(v.source_name) || s(v.updated_at).slice(0, 10),
        vod_year: s(v.updated_at).slice(0, 4),
        vod_area: s(v.region_name),
        vod_lang: '',
        vod_actor: s(v.actor_names) || s(v.source_name),
        vod_director: '',
        vod_content: s(v.title),
        vod_play_from: 'H265',
        vod_play_url: '正片$' + playId(v),
        vod_tag: s(v.tag_names),
        type_name: s(v.region_name) || '最近更新'
    };
    VIDEOS[id] = v;
    return out;
}

function listOf(j) {
    if (!j || !j.data || !j.data.length) return [];
    var out = [];
    for (var i = 0; i < j.data.length; i++) out.push(toVod(j.data[i]));
    return out;
}

function totalOf(j) { var p = j && j.page_result; return p ? num(p.total, 0) : 0; }

// ---------------- spider 接口 ----------------

// init 零网络: 只记账, 不碰 HTTP。
// 原因: 影视仓在导入/刷新时会跑 init, 此时 establish 的 45s 限流 + 3 次重试
//        会把首屏拖到转圈; 而且 init 抛异常会让整个 spider 被判死 -> 分类都不出。
function parseCfg(cfg) {
    var o = cfg;
    if (o && typeof o === 'string') {
        try { o = JSON.parse(o); } catch (e) { o = null; }
    }
    if (!o || typeof o !== 'object') return;
    if (o.base) BASE = s(o.base).replace(/\/+$/, '');
    if (o.conection) CONECTION = s(o.conection);
    if (o.device_id) DEVICE_ID = s(o.device_id);
    if (o.referer) REFERER = s(o.referer);
    if (o.pic_host) { PIC_HOST = s(o.pic_host).replace(/\/+$/, ''); PIC = PIC_HOST; }
    if (o.diag) DIAG = true;
}

function init(cfg) {
    try { parseCfg(cfg); } catch (e1) { }
    try { HTTP_FN = httpBinding(); } catch (e2) { HTTP_FN = null; }   // 先绑, 别等 fetchRaw 懒绑
    try { loadToken(); } catch (e3) { }                               // token 只读本地, 不发网络
    return '';                     // 硬规范 3: 返回字符串
}

// 分类写死, 不依赖网络 -> 网络全挂时 tab 照样出
// ★ 关键: home() 里绝对不能有网络请求。
//   宿主调用 home 有超时(通常 10~30s), sync http 一卡就整个 home 抛超时 -> 连分类都没有。
//   这是本轮"分类都没有"的根因: v4 在 home 里调了 firstList(), 网络一慢 tab 全灭。
function home(filter) {
    // 任何异常都不许冒泡: 一旦 home 抛错, 壳会判定整站失败, 连 tab 都不给。
    try {
        var f = {};
        for (var i = 0; i < REGIONS.length; i++) {
            f[REGIONS[i].id] = [{ key: 'tag', name: '标签', value: TAGS_PUB() }];
        }
        f['tag'] = [{ key: 'tag', name: '标签', value: TAGS_PUB() }];
        var out = { class: cats(), filters: f };
        if (DIAG) out.class.push({ type_id: '__diag', type_name: '诊断' });
        return JSON.stringify(out);
    } catch (e) {
        LAST_ERR = 'home:' + (e && e.message ? e.message : String(e));
        return JSON.stringify({ class: [{ type_id: 'all', type_name: '错误:' + LAST_ERR }], filters: {} });
    }
}

// 首屏片单放这里。壳调 homeVod 时再走网络, 挂了也只是首屏空, 不影响分类。
function homeVod() {
    var j = api('/video', { page: 1, pageSize: 20 });
    if (j && j.__auth) { establish(); j = api('/video', { page: 1, pageSize: 20 }); }
    return JSON.stringify({ list: listOf(j) });       // 硬规范 3: stringify
}

function TAGS_PUB() {
    var arr = [{ n: '全部', v: '' }];
    for (var i = 0; i < TAGS.length; i++) arr.push({ n: TAGS[i].name, v: TAGS[i].id });
    return arr;
}
function init(ext){return '';}
export default { init: init, home: home };
function home(filter){
    try{
        var f={};
        for(var i2=0;i2<REGIONS.length;i2++) f[REGIONS[i2].id]=[{key:'tag',name:'标签',value:TAGS_PUB()}];
        f['tag']=[{key:'tag',name:'标签',value:TAGS_PUB()}];
        return JSON.stringify({class:cats(),filters:f});
    }catch(e){return JSON.stringify({class:[{type_id:'all',type_name:'ERR:'+e.message}],filters:{}});}
}
