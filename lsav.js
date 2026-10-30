// 玖壹看片 (lsav / Nova) · 影视仓 type:3 零服务器 spider · v2
// 后端: lsav-api-gznaqa.ciftji.com  (Nova 家族, cookie 型 establish + AuthDog 认证)
// 播放: OSS h265 fMP4 HLS, AES-128, key 内联 —— 全程不需要服务器
//
// v2 (2026-10-30 修"没有分类没有资源"):
//   v1 在 Node 测试台全绿, 但真机全空。根因按顺序:
//   (a) config 的 api 写成了 csp_Lsav -> csp_ 开头按 jar 类加载 -> SpiderNull -> 空白转圈
//   (b) 网络层裸调 req(), 没有 http/req/net.http 三级探测, 也漏了 async:false
//       -> 部分壳只有 http() -> ReferenceError -> init 抛异常 -> 整站判死
//   (c) init 里做 establish+refreshOss -> 撞 45s 限流, 首屏长时间转圈
//   v2 改: http 三级探测 + async:false 写两遍 + timeout 毫秒制 60000 +
//          init 零网络(token 懒加载) + homeVod/search 返回 JSON 字符串 +
//          filters 全分支对齐(含 tag/__diag) + detail 六件套补齐 type_name +
//          storeGet/storeSet 探测(无 local 时降级不崩) + 诊断分类(ext.diag=1 开)
//
// 关键点(改版时先看这里):
//   1. 认证头名是 AuthDog, 不是 Authorization
//   2. establish 的 body 必须紧凑 JSON(空格 => "Hail Hydra!")
//   3. device_id 必须与 CONECTION 配对(否则 "check aes failed!")
//   4. establish 有 ~45s 频率限制,所以 token 落地缓存
//   5. 源站 OSS 只放行 Referer: https://app.nova-traffic-1688.com/
//   6. playlist 里的 hls.key 是 404 陷阱,真 key = base64decode(h265_key)
//   7. 宿主 http(url,{timeout}) 的 timeout 单位是毫秒(实测 60 -> 60ms 直接断)

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1';
var MOBILE_UA = 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/124.0.6367.82 Mobile Safari/537.36';

var GATEWAYS = [
    'https://lsav-api-gznaqa.ciftji.com',
    'https://lsav-api-tcm53l.ppxqn.com',
    'https://lsav-api-n50qld.kxfyuu.com',
    'https://lsav-api-ygcnjo.ppxqn.com'
];
var BASE = GATEWAYS[0];

var REFERER = 'https://app.nova-traffic-1688.com/';
var PIC_HOST = 'https://lsav-copycat-6hl8nu.wxfjdkj.com';

var CONECTION = 'KXUEmafncA8rBXPkhQs2wcKBargtbV9+bZREhW8MY1d4B8FFFkH5wsMMQpmchQfc';
var DEVICE_ID = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
var CLIENT_VER = '1.2.441';

var AES_KEY = 'jkoig9frvbnmjiuy';
var AES_IV = '000105030405090708090a0b0c0d0e0f';

// 源站候选(system/domain 的 domain_original, 会动态刷新)
var OSS_HOSTS = [
    'https://ori-u786zr.ffdzx.com',
    'https://ori-3zaj93.nbbjhfg.com',
    'https://ori-nfircg.kpycb.com',
    'https://ori-ixgkil.kpycb.com'
];
var OSS = OSS_HOSTS[0];
var OSS_IDX = 0;
var OSS_FRESH = false;

// token 缓存(QUICKJS 里 persist 可能不可用,主用内存)
var TOKEN = '';
var TOKEN_EXP = 0;
var LAST_ERR = '';
var LAST_EST = 0;
var PIC = PIC_HOST;
var VIDEOS = {};      // id -> 视频对象(详情兜底)
var PLCACHE = {};     // id -> { pl: playlist 原文 }
var DOMAINS_OK = false;
var DIAG = false;          // ext.diag = 1 时打开, 首页多一张"诊断"分类卡

// ---------------- 基础工具 ----------------

function s(x) { return x === null || x === undefined ? '' : String(x); }
function trim(x) { return s(x).replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''); }
function now() { return Math.floor(new Date().getTime() / 1000); }
function num(x, d) { var n = parseInt(x, 10); return isNaN(n) ? (d || 0) : n; }
function fixPic(p) {
    var u = s(p).replace(/\\\//g, '/').trim();
    if (!u) return '';
    if (/^https?:\/\//.test(u)) return u;
    if (u.charAt(0) !== '/') u = '/' + u;
    return PIC + u;
}
function absUrl(u) {
    var t = trim(u);
    if (/^https?:\/\//.test(t)) return t;
    if (t.charAt(0) !== '/') t = '/' + t;
    return BASE + t;
}

// ---------------- AES-128-CBC 解密(CTR 封装的 halite/nova 信封) ----------------
// 响应体: AES-128-CBC + PKCS7, KEY/IV 全站恒定

var B64T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64Bytes(str) {
    var t = s(str).replace(/[^A-Za-z0-9+/=]/g, '');
    var out = [];
    var i = 0;
    while (i < t.length) {
        var c0 = B64T.indexOf(t.charAt(i++));
        var c1 = B64T.indexOf(t.charAt(i++));
        var c2 = t.charAt(i) === '=' ? -1 : B64T.indexOf(t.charAt(i)); i++;
        var c3 = t.charAt(i) === '=' ? -1 : B64T.indexOf(t.charAt(i)); i++;
        if (c0 < 0 || c1 < 0) break;
        out.push(((c0 << 2) | (c1 >> 4)) & 0xff);
        if (c2 >= 0) out.push(((c1 << 4) | (c2 >> 2)) & 0xff);
        if (c3 >= 0) out.push(((c2 << 6) | c3) & 0xff);
    }
    return out;
}

function bytesB64(bytes) {
    var out = '';
    var i = 0;
    for (; i + 2 < bytes.length; i += 3) {
        var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += B64T.charAt((n >> 18) & 63) + B64T.charAt((n >> 12) & 63) + B64T.charAt((n >> 6) & 63) + B64T.charAt(n & 63);
    }
    var rest = bytes.length - i;
    if (rest === 1) {
        var n1 = bytes[i] << 16;
        out += B64T.charAt((n1 >> 18) & 63) + B64T.charAt((n1 >> 12) & 63) + '==';
    } else if (rest === 2) {
        var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
        out += B64T.charAt((n2 >> 18) & 63) + B64T.charAt((n2 >> 12) & 63) + B64T.charAt((n2 >> 6) & 63) + '=';
    }
    return out;
}

function hexBytes(h) {
    var out = [];
    for (var i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16));
    return out;
}

// --- AES 核心(纯 JS, 只实现解密) ---
var SBOX = null, INV_SBOX = null, RCON = null;

var SBOX_STD = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
];

var INV_SBOX_STD = [
    0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
    0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
    0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
    0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
    0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
    0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
    0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
    0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
    0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
    0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
    0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
    0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
    0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
    0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
    0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
    0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d
];


function bootAes() {
    SBOX = SBOX_STD;
    INV_SBOX = INV_SBOX_STD;
    RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
}

function gmul(a, b) {
    var p = 0;
    for (var i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        var hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
    }
    return p;
}

function keyExpansion(key) {
    var nk = key.length / 4, nr = nk + 6;
    var w = [];
    for (var i = 0; i < nk; i++) w.push([key[i * 4], key[i * 4 + 1], key[i * 4 + 2], key[i * 4 + 3]]);
    for (var j = nk; j < 4 * (nr + 1); j++) {
        var temp = w[j - 1].slice();
        if (j % nk === 0) {
            temp.push(temp.shift());
            for (var k = 0; k < 4; k++) temp[k] = SBOX[temp[k]];
            temp[0] ^= RCON[(j / nk) - 1];
        } else if (nk > 6 && j % nk === 4) {
            for (var k2 = 0; k2 < 4; k2++) temp[k2] = SBOX[temp[k2]];
        }
        w.push([w[j - nk][0] ^ temp[0], w[j - nk][1] ^ temp[1], w[j - nk][2] ^ temp[2], w[j - nk][3] ^ temp[3]]);
    }
    return { w: w, nr: nr };
}

function invShiftRows(st) {
    // AES 状态按列主序: 行 r 的字节在 index = 4*col + r
    // InvShiftRows: 第 r 行右移 r 位(等价于左移 4-r)
    var t = st.slice();
    // 第 1 行右移 1
    st[1] = t[13]; st[5] = t[1]; st[9] = t[5]; st[13] = t[9];
    // 第 2 行右移 2
    st[2] = t[10]; st[6] = t[14]; st[10] = t[2]; st[14] = t[6];
    // 第 3 行右移 3
    st[3] = t[7]; st[7] = t[11]; st[11] = t[15]; st[15] = t[3];
}

function invMixColumns(st) {
    for (var c = 0; c < 4; c++) {
        var a0 = st[c * 4], a1 = st[c * 4 + 1], a2 = st[c * 4 + 2], a3 = st[c * 4 + 3];
        st[c * 4]     = gmul(a0, 14) ^ gmul(a1, 11) ^ gmul(a2, 13) ^ gmul(a3, 9);
        st[c * 4 + 1] = gmul(a0, 9)  ^ gmul(a1, 14) ^ gmul(a2, 11) ^ gmul(a3, 13);
        st[c * 4 + 2] = gmul(a0, 13) ^ gmul(a1, 9)  ^ gmul(a2, 14) ^ gmul(a3, 11);
        st[c * 4 + 3] = gmul(a0, 11) ^ gmul(a1, 13) ^ gmul(a2, 9)  ^ gmul(a3, 14);
    }
}

function decryptBlock(block, ks) {
    var st = block.slice();
    var nr = ks.nr;
    for (var i = 0; i < 16; i++) st[i] ^= ks.w[(nr * 4) + ((i >> 2) & 3)][i & 3];
    for (var round = nr - 1; round >= 0; round--) {
        invShiftRows(st);
        for (var j = 0; j < 16; j++) st[j] = INV_SBOX[st[j]];
        for (var k = 0; k < 16; k++) st[k] ^= ks.w[(round * 4) + ((k >> 2) & 3)][k & 3];
        if (round > 0) invMixColumns(st);
    }
    return st;
}

function aesDecryptCBC(dataBytes, keyStr, ivHex) {
    bootAes();
    var key = [];
    for (var i = 0; i < keyStr.length; i++) key.push(keyStr.charCodeAt(i) & 0xff);
    var ks = keyExpansion(key);
    var iv = hexBytes(ivHex);
    var out = [];
    var prev = iv;
    for (var off = 0; off + 16 <= dataBytes.length; off += 16) {
        var blk = dataBytes.slice(off, off + 16);
        var dec = decryptBlock(blk, ks);
        for (var b = 0; b < 16; b++) out.push(dec[b] ^ prev[b]);
        prev = blk;
    }
    // 去 PKCS7
    if (out.length) {
        var pad = out[out.length - 1];
        if (pad > 0 && pad <= 16 && pad <= out.length) {
            var ok = true;
            for (var q = out.length - pad; q < out.length; q++) if (out[q] !== pad) ok = false;
            if (ok) out.length = out.length - pad;
        }
    }
    return out;
}

function bytesUtf8(arr) {
    var out = '';
    for (var i = 0; i < arr.length; i++) out += '%' + (arr[i] < 16 ? '0' : '') + arr[i].toString(16);
    try { return decodeURIComponent(out); } catch (e) {
        var s2 = '';
        for (var j = 0; j < arr.length; j++) s2 += String.fromCharCode(arr[j]);
        return s2;
    }
}

function decryptEnvelope(blob) {
    var b64 = '';
    var isString = typeof blob === 'string';
    if (isString) b64 = blob;
    else if (blob && blob.byteLength !== undefined) {
        // ArrayBuffer -> base64
        var u8 = new Uint8Array(blob), tmp = [];
        for (var i = 0; i < u8.length; i++) tmp.push(u8[i]);
        b64 = bytesB64(tmp);
    } else return s(blob);
    return bytesUtf8(aesDecryptCBC(b64Bytes(b64), AES_KEY, AES_IV));
}

// ---------------- HTTP ----------------

function httpBinding() {
    var f = null;
    try { if (typeof http === 'function') f = http; } catch (e0) { }
    try { if (!f && typeof req === 'function') f = req; } catch (e1) { }
    try { if (!f && typeof net !== 'undefined' && net && typeof net.http === 'function') f = net.http; } catch (e2) { }
    return f;
}

var HTTP_FN = null;

function fetchRaw(url, opt) {
    var o = opt || {};
    o.method = o.method || 'GET';
    o.headers = o.headers || {};
    o.async = false;                       // 硬规范 1: 宿主不 pump 微任务, 必须同步
    if (o.buffer === undefined) o.buffer = 2;   // 关键: 2=宿主把响应体转 base64 字符串再给 JS(密文/图片不过字符化通道)
    if (o.timeout === undefined || o.timeout < 1000) o.timeout = 60000;   // 毫秒(站点 json 的 timeout:60 是秒, 两回事)
    if (!HTTP_FN) HTTP_FN = httpBinding();
    var f = HTTP_FN;
    var res = null;
    if (f) {
        try { res = f.call(null, url, o); } catch (e3) {                 // QuickJS this=undefined 会 BindFailed
            try { res = f.bind(null)(url, o); } catch (e4) { res = null; }
        }
    }
    if (res === undefined || res === null) throw new Error('nil response');
    return res;
}

function parseBody(res) {
    var ct = '';
    try {
        if (res.headers) {
            for (var k in res.headers) {
                if (k.toLowerCase() === 'content-type') ct = s(res.headers[k]);
            }
        }
    } catch (e) { }
    var body = res.content;
    if (body === undefined || body === null) body = res.body;      // 4do 契约: 部分壳字段名不同
    if (body === undefined || body === null) body = res.data;

    if (body === undefined || body === null) return '';
    if (typeof body === 'string') {
        if (/^\s*[{[]/.test(body)) return body;              // 明文 JSON
        if (body[0] === '#') return body;                    // m3u8 文本
        var raw = bytesOfRaw(body);
        if (raw) return decodeRaw(raw, ct);
        if (ct.indexOf('encrypt') >= 0) {
            try { return decryptEnvelope(body); } catch (eE) { return body; }
        }
        return body;                                         // 明文文本(错误 JSON 等)
    }
    var raw2 = bytesOfRaw(body);
    return raw2 ? decodeRaw(raw2, ct) : s(body);
}

function bytesOfRaw(body) {
    // 把宿主给的三种形态统一成字节数组:
    //   a) ArrayBuffer/Uint8Array (QuickJS 二进制通道)
    //   b) 原始二进制字符串 (charCode == 字节, 影视仓 http() 常见形态)
    //   c) base64 文本字符串 (Node 桥/部分壳)
    if (body === undefined || body === null) return null;
    if (body && body.byteLength !== undefined && typeof body !== 'string') {
        var u8 = new Uint8Array(body), a = [];
        for (var i = 0; i < u8.length; i++) a.push(u8[i]);
        return a;
    }
    if (typeof body === 'object' && body !== null && typeof body.length === 'number' && body.length > 0 && typeof body[0] === 'number') {
        return body;                                   // 宿主直接给 JS 数字数组(buffer:1 ByteArray 兜底)
    }
    if (typeof body !== 'string') return null;
    var t = body.replace(/\s/g, '');
    if (t.length >= 16 && t.length % 4 === 0 && !/[^A-Za-z0-9+/=]/.test(t)) return b64Bytes(t);
    // 原始二进制字符串: 只要含任何不可打印字节就按字节串处理
    var bin = false;
    for (var j = 0; j < body.length; j++) {
        var c = body.charCodeAt(j);
        if (c < 9 || (c > 13 && c < 32) || c > 254) { bin = true; break; }
    }
    if (!bin) return null;
    var out = [];
    for (var k = 0; k < body.length; k++) out.push(body.charCodeAt(k) & 0xff);
    return out;
}

function decodeRaw(raw, ct) {
    if (!raw || !raw.length) return '';
    var enc = ct.indexOf('encrypt') >= 0;              // 加密信封必须优先判定: 密文首字节随机, 不能靠魔法字节嗅探
    if (enc) {
        try { return bytesUtf8(aesDecryptCBC(raw, AES_KEY, AES_IV)); } catch (eD) { return ''; }
    }
    if (raw[0] === 0x7b || raw[0] === 0x5b || raw[0] === 0x23) return bytesUtf8(raw);   // { [ #
    var g = bytesUtf8(raw);
    if (/^\s*[{[]/.test(g) || g[0] === '#') return g;
    try { return bytesUtf8(aesDecryptCBC(raw, AES_KEY, AES_IV)); } catch (eD2) { return g; }
}

function jsonOf(res) {
    var t = parseBody(res);
    try { return JSON.parse(t); } catch (e) { return { __raw: t }; }
}

// ---------------- 设备注册 ----------------

function establish() {
    var body = '{"device_id":"' + DEVICE_ID + '","device_type":"cookie","invite_code":"",'
        + '"os_version":"iOS 17.5","phone_device":"iPhone 15 Pro","version":"' + CLIENT_VER + '","is_first":1}';
    var res;
    try {
        res = fetchRaw(BASE + '/api/v1/member/establish', {
            method: 'POST',
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/json',
                'Conection': CONECTION,
                'Referer': BASE + '/'
            },
            body: body,
            timeout: 60000
        });
    } catch (e) {
        LAST_ERR = 'E:EST_HTTP';
        return false;
    }
    LAST_EST = now();
    var j = jsonOf(res);
    if (!j || !j.access_token) {
        LAST_ERR = 'E:EST_' + (j && j.error ? j.error.code : 'NIL');
        return false;
    }
    TOKEN = j.access_token;
    TOKEN_EXP = num(j.expires_at, now() + 86400);
    LAST_ERR = '';
    storeSet('lsav_token', TOKEN + '|' + TOKEN_EXP);
    return true;
}

// 宿主不一定有 local(沙箱有, 部分壳只有 localStorage, 也可能都没有)
// 全站不依赖持久化: token 拿不到就重新 establish, 只是多花一次注册
var STORE = null;

function storeGet(k) {
    if (STORE === null) {
        STORE = false;
        try { if (typeof local !== 'undefined' && local && typeof local.get === 'function') STORE = local; } catch (e) { }
        try { if (!STORE && typeof localStorage !== 'undefined' && localStorage) STORE = localStorage; } catch (e2) { }
    }
    if (!STORE) return '';
    try { return s(STORE.get ? STORE.get(k) : STORE.getItem(k)); } catch (e3) { return ''; }
}

function storeSet(k, v) {
    if (STORE === null) storeGet(k);
    if (!STORE) return;
    try { if (STORE.set) STORE.set(k, v); else STORE.setItem(k, v); } catch (e) { }
}

function loadToken() {
    var v = storeGet('lsav_token');
    if (v.indexOf('|') > 0) {
        var p = v.split('|');
        TOKEN = p[0];
        TOKEN_EXP = num(p[1], 0);
    }
}

function ensureToken() {
    if (TOKEN && TOKEN_EXP > now() + 120) return true;
    loadToken();
    if (TOKEN && TOKEN_EXP > now() + 120) return true;
    return establish();
}

// ---------------- API ----------------

function api(path, params) {
    var q = '';
    if (params) {
        var parts = [];
        for (var k in params) {
            var v = params[k];
            if (v === undefined || v === null || v === '') continue;
            parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(s(v)));
        }
        if (parts.length) q = '?' + parts.join('&');
    }
    var url = BASE + '/api/v1' + path + q;
    for (var attempt = 0; attempt < 3; attempt++) {
        if (!ensureToken()) {
            if (attempt < 2) continue;
            return { __auth: false };
        }
        try {
            var res = fetchRaw(url, {
                method: 'GET',
                headers: {
                    'User-Agent': UA,
                    'Referer': BASE + '/',
                    'AuthDog': 'Bearer ' + TOKEN,
                    'Accept': 'application/json'
                },
                timeout: 60000
            });
            var j = jsonOf(res);
            if (j && j.error) {
                var code = num(j.error.code, 0);
                if (code === 9999) {          // 权限认证错误 -> token 失效
                    TOKEN = ''; TOKEN_EXP = 0;
                    LAST_ERR = 'E:API_9999';
                    continue;
                }
                if (code === 1001) { LAST_ERR = 'E:API_1001'; return { __notfound: true }; }
                LAST_ERR = 'E:API_' + code;
                return j;
            }
            LAST_ERR = '';
            return j || {};
        } catch (e) {
            LAST_ERR = 'E:HTTP';
        }
    }
    return { __auth: false };
}

// ---------------- 源站刷新 ----------------

function refreshOss() {
    if (OSS_FRESH) return;
    var j = api('/system/domain');
    if (!j || !j.domain_original || !j.domain_original.length) { OSS_FRESH = true; return; }
    var arr = [];
    for (var i = 0; i < j.domain_original.length; i++) {
        var u = trim(j.domain_original[i]).replace(/\/+$/, '');
        if (/^https?:\/\//.test(u)) arr.push(u);
    }
    if (arr.length) { OSS_HOSTS = arr; OSS = arr[0]; OSS_IDX = 0; }
    OSS_FRESH = true;
}

// ---------------- 分类配置 ----------------

// Nova 后端只有 region + tag 两个筛选维度; 首页分类用 region 切, "推荐"全量
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
    if (DIAG) out.push({ type_id: '__diag', type_name: '诊断' });
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
    parseCfg(cfg);
    loadToken();
    return '';                     // 硬规范 3: 返回字符串
}

// 分类也是写死的, 不依赖网络 -> 网络全挂时 tab 照样出(便于区分"没网"和"解析错")
function home() {
    var f = {};
    for (var i = 0; i < REGIONS.length; i++) {
        f[REGIONS[i].id] = [{ key: 'tag', name: '标签', value: TAGS_PUB() }];
    }
    f['tag'] = [{ key: 'tag', name: '标签', value: TAGS_PUB() }];
    if (DIAG) f['__diag'] = [];                      // 硬规范 6: filters 全分支对齐
    return JSON.stringify({ class: cats(), filters: f });
}

function homeVod() {
    var j = api('/video', { page: 1, pageSize: 10 });
    if (j && j.__auth) { establish(); j = api('/video', { page: 1, pageSize: 10 }); }
    return JSON.stringify({ list: listOf(j) });       // 硬规范 3: stringify
}

function TAGS_PUB() {
    var arr = [{ n: '全部', v: '' }];
    for (var i = 0; i < TAGS.length; i++) arr.push({ n: TAGS[i].name, v: TAGS[i].id });
    return arr;
}

function category(tid, pg, filter, extend) {
    pg = num(pg, 1);
    var region = s(tid);
    var tag = '';
    if (extend && typeof extend === 'string') { try { extend = JSON.parse(extend); } catch (e) { extend = null; } }
    if (extend && extend.tag) tag = s(extend.tag);
    if (region === 'tag') { region = ''; }

    if (region === '__diag') {
        return JSON.stringify({ page: 1, pagecount: 1, limit: 20, total: 1, list: [{ vod_id: 'diag', vod_name: diagText(), vod_pic: '', vod_remarks: '诊断', vod_play_from: '', vod_play_url: '' }] });
    }

    var params = { page: pg, pageSize: 20 };
    if (region && region !== 'all') params.region_id = region;
    if (tag) params.tag_ids = tag;

    var j = api('/video', params);
    if (j && j.__auth) { establish(); j = api('/video', params); }
    return JSON.stringify({
        page: pg,
        pagecount: Math.ceil(totalOf(j) / 20) || pg,
        limit: 20,
        total: totalOf(j),
        list: listOf(j)
    });
}

function detail(id) {
    var vid = s(id).replace(/~.*$/, '');
    var v = VIDEOS[vid];
    if (!v) {
        // 无 detail 端点 -> 用列表翻找兜底(最多一次)
        var j = api('/video', { page: 1, pageSize: 20 });
        listOf(j);
        v = VIDEOS[vid];
    }
    if (!v) return JSON.stringify({ list: [] });
    var vod = toVod(v);
    // 铁律⑦ 六件套: id/name/pic/type_name/play_from/play_url 一个都不能少
    vod.type_name = s(v.region_name) || '最近更新';
    vod.vod_area = s(v.region_name);
    vod.vod_year = s(v.updated_at).slice(0, 4);
    vod.vod_actor = s(v.actor_names) || s(v.source_name);
    vod.vod_remarks = s(v.source_name) || s(v.updated_at).slice(0, 10);
    vod.vod_content = s(v.title) + (v.tag_names ? '\n\n标签: ' + s(v.tag_names) : '');
    if (!vod.vod_play_from) vod.vod_play_from = 'H265';
    if (!vod.vod_play_url) vod.vod_play_url = '正片$' + playId(v);
    return JSON.stringify({ list: [vod] });
}

function search(wd, quick, pg) {
    pg = num(pg, 1);
    // 后端 /video 没有关键词参数。两条路:
    //   a) 关键词命中内置标签 -> 走 tag_ids 精确筛(服务端筛, 准)
    //   b) 否则按 region 全量翻前 N 页本地过滤(能被缓存的列表顺带命中)
    var kw = trim(wd);
    if (!kw) return JSON.stringify({ list: [] });
    var hit = '';
    for (var i = 0; i < TAGS.length; i++) {
        if (TAGS[i].name.indexOf(kw) >= 0 || kw.indexOf(TAGS[i].name) >= 0) { hit = TAGS[i].id; break; }
    }
    var out = [];
    var lower = kw.toLowerCase();

    if (hit) {
        var params = { page: pg, pageSize: 20, tag_ids: hit };
        var j = api('/video', params);
        if (j && j.__auth) { establish(); j = api('/video', params); }
        var l1 = listOf(j);
        for (var a = 0; a < l1.length; a++) out.push(l1[a]);
        return JSON.stringify({ page: pg, pagecount: Math.ceil(totalOf(j) / 20) || pg, limit: 20, total: totalOf(j), list: out });
    }

    // 无标签命中: 扫前 5 页(100 条)本地过滤; 命中率靠"最近更新", 够用
    for (var p = 1; p <= 5 && out.length < 20; p++) {
        var pr = { page: p, pageSize: 20 };
        var jj = api('/video', pr);
        if (jj && jj.__auth) { establish(); jj = api('/video', pr); }
        var lst = listOf(jj);
        if (!lst.length) break;
        for (var k = 0; k < lst.length; k++) {
            var nm = s(lst[k].vod_name).toLowerCase();
            if (nm.indexOf(lower) >= 0) out.push(lst[k]);
        }
    }
    return JSON.stringify({ page: 1, pagecount: 1, limit: 20, total: out.length, list: out });
}

// ---------------- 播放 ----------------

function ossUrl(path) {
    var p = trim(path).replace(/^\/+/, '');
    return OSS + '/' + p;
}

function fetchOnce(url, headers) {
    var res = fetchRaw(url, { method: 'GET', headers: headers, timeout: 60000 });
    var body = res.content;
    if (typeof body === 'string') {
        // 宿主二进制通道: 纯 base64 字符集 -> 解码成文本
        if (body.length > 0 && !/[^A-Za-z0-9+/=\s]/.test(body) && body.replace(/\s/g, '').length % 4 === 0) {
            var rb = b64Bytes(body);
            if (rb.length && rb[0] === 0x23) return bytesUtf8(rb);   // '#'
            return bytesUtf8(rb);
        }
        return body;
    }
    if (body && body.byteLength !== undefined) {
        var u8 = new Uint8Array(body), arr = [];
        for (var i = 0; i < u8.length; i++) arr.push(u8[i]);
        return bytesUtf8(arr);
    }
    return s(body);
}

function fetchPlaylistHard(url, tries) {
    var n = tries || 3;
    var rel = s(url).replace(/^https?:\/\/[^/]+\//, '');
    var best = '';
    for (var i = 0; i < n; i++) {
        var h = OSS_HOSTS[i % OSS_HOSTS.length];
        var u = h === OSS ? url : (h + '/' + rel);
        try {
            var t = fetchOnce(u, { 'User-Agent': UA, 'Referer': REFERER });
            if (t && t.indexOf('#EXTM3U') >= 0) {
                best = t;
                OSS = h; OSS_IDX = i % OSS_HOSTS.length;
                if (t.indexOf('#EXT-X-ENDLIST') >= 0) return t;
            }
        } catch (e) { }
    }
    return best;
}

function absolutePlaylist(pl, dir, key) {
    var lines = pl.split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        var t = trim(ln);
        if (!t) continue;
        if (t.charAt(0) === '#') {
            if (t.indexOf('#EXT-X-KEY') === 0) {
                if (key) {
                    out.push(ln.replace(/URI="[^"]*"/, 'URI="data:application/octet-stream;base64,' + key + '"'));
                } else out.push(ln);
            } else if (t.indexOf('#EXT-X-MAP') === 0) {
                out.push(ln.replace(/URI="([^"]*)"/, function (m, u) {
                    if (/^(https?:)?\/\//.test(u) || u.indexOf('data:') === 0) return 'URI="' + u + '"';
                    return 'URI="' + OSS + '/' + dir + '/' + u + '"';
                }));
            } else out.push(ln);
        } else {
            if (/^(https?:)?\/\//.test(t)) out.push(t);
            else out.push(OSS + '/' + dir + '/' + t);
        }
    }
    return out.join('\n') + '\n';
}

function utf8ToBytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) { out.push(0xC0 | (c >> 6)); out.push(0x80 | (c & 63)); }
        else if (c >= 0xD800 && c <= 0xDBFF) {
            var c2 = str.charCodeAt(++i);
            var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
            out.push(0xF0 | (cp >> 18)); out.push(0x80 | ((cp >> 12) & 63));
            out.push(0x80 | ((cp >> 6) & 63)); out.push(0x80 | (cp & 63));
        } else { out.push(0xE0 | (c >> 12)); out.push(0x80 | ((c >> 6) & 63)); out.push(0x80 | (c & 63)); }
    }
    return out;
}

function play(flag, id) {
    var raw = trim(id);
    if (!raw) return JSON.stringify({ parse: 0, jx: 0, url: '' });
    if (/^https?:\/\//.test(raw)) return JSON.stringify({ parse: 0, jx: 0, url: raw });

    var wantH264 = trim(flag).toLowerCase().indexOf('h264') >= 0;
    var bare = raw.replace(/^h264:/, '');

    var meta = parsePlayId(bare);
    var v = null;
    if (!meta) {
        var vid = bare.replace(/~.*$/, '');
        v = VIDEOS[vid] || null;
        if (!v) {
            var j = api('/video', { page: 1, pageSize: 20 });
            listOf(j);
            v = VIDEOS[vid] || null;
        }
        if (!v) return JSON.stringify({ parse: 0, jx: 0, url: '' });
        meta = { id: s(v.id), path: s(v.h265_url), key: s(v.h265_key) };
    }

    var key = meta.key, path = meta.path;
    if (!path) {
        var hp = v ? s(v.highres_url) : '';
        if (!hp) return JSON.stringify({ parse: 0, jx: 0, url: '' });
        return JSON.stringify({ parse: 0, jx: 0, url: ossUrl(hp), header: { 'User-Agent': UA, 'Referer': REFERER } });
    }
    if (wantH264 && v && s(v.highres_url)) path = s(v.highres_url).replace(/^\/+/, '');
    else if (wantH264 && path.indexOf('h265_output_prod') >= 0) path = path.replace('h265_output_prod', 'h264_output');

    refreshOss();
    var dir = path.indexOf('/') >= 0 ? path.slice(0, path.lastIndexOf('/')) : '';
    var plUrl = ossUrl(path);

    var c0 = PLCACHE[meta.id] || null;
    var pl = (c0 && c0.pl) ? c0.pl : fetchPlaylistHard(plUrl, 3);
    if (!pl) {
        return JSON.stringify({ parse: 0, jx: 0, url: plUrl, header: { 'User-Agent': UA, 'Referer': REFERER } });
    }
    PLCACHE[meta.id] = { pl: pl };

    var txt = absolutePlaylist(pl, dir, key);
    var dataUri = 'data:application/vnd.apple.mpegurl;base64,' + bytesB64(utf8ToBytes(txt));
    return JSON.stringify({ parse: 0, jx: 0, url: dataUri, header: { 'User-Agent': UA, 'Referer': REFERER } });
}

// ---------------- 杂项 ----------------

function isVideo(url) { return /\.(m3u8|mp4|flv|mkv|ts|mov|m4s)(\?|$)/i.test(s(url)); }
function sniffer() { return false; }
function action(a) { return JSON.stringify({}); }
function proxy(params) { return JSON.stringify([]); }
function destroy() { TOKEN = ''; PLCACHE = {}; VIDEOS = {}; }

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
    destroy: destroy,
    // 诊断入口: 把内部状态打成一个分类卡, 电视端看一眼就知道卡在哪
    // 用法: 临时把 ext.diag = 1 打开, 或直接在首页分类里看 "诊断" 卡
    diag: function () {
        return JSON.stringify({ list: [{ vod_id: 'diag', vod_name: diagText(), vod_pic: '', vod_remarks: '', vod_play_from: '', vod_play_url: '' }] });
    }
};

function diagText() {
    var l = [];
    l.push('BASE=' + BASE);
    l.push('HTTP=' + (HTTP_FN ? 'bound' : 'null'));
    l.push('TOKEN=' + (TOKEN ? TOKEN.length + '字符' : '空'));
    l.push('LAST_ERR=' + (LAST_ERR || 'none'));
    l.push('OSS=' + OSS);
    l.push('STORE=' + (STORE ? 'yes' : 'no'));
    return l.join(' | ');
}
