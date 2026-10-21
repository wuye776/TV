# TV

色猫375 影视仓（TVBox）零服务器订阅源。

## 订阅地址（复制到影视仓 / TVBox）

单站（推荐先用这个）：

```
https://cdn.jsdelivr.net/gh/wuye776/TV@main/tvbox.json
```

三节点备用（同一份源挂三个 CDN，主挂了自动换）：

```
https://cdn.jsdelivr.net/gh/wuye776/TV@main/sites3.json
```

## 形式

- `type: 3` —— 客户端本地执行 JS，不需要服务器
- `api` 指向 `semao375.js`，QuickJS 里同步抓站解析
- 换源站不用改客户端，改 `semao375.js` 首行 `BASE` 即可

## 文件

| 文件 | 说明 |
|---|---|
| `semao375.js` | spider 本体，13547B |
| `tvbox.json` | 单站订阅配置 |
| `sites3.json` | 三节点（cdn / fastly / gcore） |

## 备用 CDN

任意把 `cdn.jsdelivr.net` 换成 `fastly.jsdelivr.net` 或 `gcore.jsdelivr.net` 都能用。

## 说明

jsDelivr 有缓存，改完 `semao375.js` 后发现客户端还是旧版，在地址后加 `?v=2` 破缓存。
