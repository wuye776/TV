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
    return out;
}
function TAGS_PUB() {
    var arr = [{ n: '全部', v: '' }];
    for (var i = 0; i < TAGS.length; i++) arr.push({ n: TAGS[i].name, v: TAGS[i].id });
    return arr;
}
function init(ext) { return ''; }
function homeVod() { return JSON.stringify({ list: [] }); }
function detail(id) { return JSON.stringify({ list: [] }); }
function search(wd, quick, pg) { return JSON.stringify({ list: [] }); }
function play(flag, id) { return JSON.stringify({ parse: 0, url: '', header: {} }); }
function isVideo(url) { return false; }
function sniffer() { return false; }
function action(a) { return JSON.stringify({}); }
function proxy(params) { return JSON.stringify([]); }
function destroy() { }
function home(filter) {
    try {
        var f = {};
        for (var i = 0; i < REGIONS.length; i++) f[REGIONS[i].id] = [{ key: 'tag', name: '标签', value: TAGS_PUB() }];
        f['tag'] = [{ key: 'tag', name: '标签', value: TAGS_PUB() }];
        return JSON.stringify({ class: cats(), filters: f });
    } catch (e) { return JSON.stringify({ class: [{ type_id: 'all', type_name: 'ERR:' + e.message }], filters: {} }); }
}
function category(tid, pg, filter, extend) { return JSON.stringify({ page: 1, pagecount: 1, limit: 20, total: 0, list: [] }); }
export default { init, home, homeVod, category, detail, search, play, isVideo, sniffer, action, proxy, destroy };