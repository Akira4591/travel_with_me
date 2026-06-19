# API Reference

Travel With Me 的 BFF 层提供以下端点：

## 基础信息

| 项           | 值                                               |
| ------------ | ------------------------------------------------ |
| Base URL     | `http://localhost:8080` (本地) / 部署域名 (生产) |
| 协议         | HTTP/1.1                                         |
| Content-Type | `application/json`                               |

AI 导入、地图服务代理和瓦片代理会检查显式 `Origin` / `Referer`。默认允许同源请求；如需允许其他正式域名，使用 `ALLOWED_ORIGINS` 配置，多个域名用逗号或空格分隔。

---

## `GET /_ai/status`

检查 AI 攻略导入功能是否可用。

**响应**

```json
{
  "available": true,
  "reason": ""
}
```

`reason` 可能值：

- `""` — 可用
- `"DEEPSEEK_API_KEY_MISSING"` — 未配置 API Key
- `"GUIDE_PROMPT_MISSING"` — Prompt 文件缺失

---

## `POST /_ai/extract-guide`

从中文攻略文本中提取结构化行程。

**请求**

```json
{
  "text": "北京3日深度游攻略...",
  "cityHint": "北京"
}
```

| 字段     | 类型   | 必填 | 约束                        |
| -------- | ------ | ---- | --------------------------- |
| text     | string | 是   | 50–5000 字符，需含中文      |
| cityHint | string | 否   | 辅助城市名，AI 亦可自动识别 |

**成功响应 (200)**

```json
{
  "guide_type": "daily_itinerary",
  "city": "北京",
  "title_suggestion": "北京3日深度游",
  "events": [
    {
      "place_name": "故宫",
      "day": 1,
      "time_slot": "morning",
      "note": "提前7天官网预约",
      "source_quote": "Day1必去故宫"
    }
  ],
  "warnings": []
}
```

**错误响应**

| HTTP | error                | 说明                           |
| ---- | -------------------- | ------------------------------ |
| 400  | `BAD_REQUEST`        | 请求 JSON 格式错误             |
| 400  | `TEXT_TOO_SHORT`     | 文本 < 50 字                   |
| 400  | `TEXT_TOO_LONG`      | 文本 > 5000 字                 |
| 403  | `FORBIDDEN_SOURCE`   | Origin / Referer 不在允许范围  |
| 413  | `REQUEST_TOO_LARGE`  | 请求体超过大小限制             |
| 429  | `RATE_LIMITED`       | 请求过于频繁                   |
| 502  | `AI_UPSTREAM_FAILED` | DeepSeek 返回错误              |
| 502  | `AI_PARSE_FAILED`    | JSON 解析失败（含 debug 信息） |
| 502  | `AI_FAILED`          | 其他未知错误                   |
| 503  | `AI_UNAVAILABLE`     | 未配置 DEEPSEEK_API_KEY        |
| 504  | `AI_TIMEOUT`         | 超时（默认 90s）               |

---

## `ALL /_AMapService/*`

高德 Web 服务透明代理。前端设置 `_AMapSecurityConfig.serviceHost` 后，所有高德 SDK 发起的 Web 服务请求都会通过此代理。

- **上游**: `https://restapi.amap.com`
- **注入**: 服务端自动附加 `jscode=$AMAP_JSCODE`
- **透传**: Referer / Origin / User-Agent 头
- **重试**: 最多 2 次
- **防护**: 显式非允许来源返回 `403`，超出限流返回 `429`

---

## `GET /_AMapTile`

高德地图瓦片代理。解决 Canvas 跨域污染问题（供分享长图使用）。

**参数**

| 参数 | 类型   | 必填 | 说明                |
| ---- | ------ | ---- | ------------------- |
| x    | number | 是   | 瓦片 X 坐标         |
| y    | number | 是   | 瓦片 Y 坐标         |
| z    | number | 是   | 缩放级别，范围 3–18 |

**响应**

- Content-Type: `image/*`
- Cache-Control: `public, max-age=86400`
- 参数越界返回 `400`；显式非允许来源返回 `403`；超出限流返回 `429`。

---

## 环境变量

| 变量                  | 必填 | 默认值    | 说明                                   |
| --------------------- | ---- | --------- | -------------------------------------- |
| `AMAP_JSCODE`         | 是   | —         | 高德安全密钥，BFF 注入                 |
| `DEEPSEEK_API_KEY`    | 否   | —         | DeepSeek API Key，留空则 AI 导入不可用 |
| `DEEPSEEK_TIMEOUT_MS` | 否   | `90000`   | AI 请求超时（毫秒）                    |
| `ALLOWED_ORIGINS`     | 否   | 空        | 额外允许来源，默认只允许同源显式来源   |
| `MAX_AI_BODY_BYTES`   | 否   | `24000`   | AI 导入请求体最大字节数                |
| `AI_RATE_LIMIT`       | 否   | `10`      | 单 IP 每个 AI 窗口最大请求数           |
| `AI_RATE_WINDOW_MS`   | 否   | `3600000` | AI 限流窗口（毫秒）                    |
| `AMAP_RATE_LIMIT`     | 否   | `600`     | 单 IP 每个高德代理窗口最大请求数       |
| `AMAP_RATE_WINDOW_MS` | 否   | `60000`   | 高德代理限流窗口（毫秒）               |
| `TILE_RATE_LIMIT`     | 否   | `1200`    | 单 IP 每个瓦片窗口最大请求数           |
| `TILE_RATE_WINDOW_MS` | 否   | `60000`   | 瓦片限流窗口（毫秒）                   |
| `PORT`                | 否   | `8080`    | 服务监听端口                           |
