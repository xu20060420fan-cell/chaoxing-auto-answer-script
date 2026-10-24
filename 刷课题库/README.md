# 刷课题库服务（配套远程题库）

油猴脚本「智能自动答题助手」的配套题库服务。兼容 **tikuAdapter 协议**，
脚本面板里可以直接把它当普通题库加上。

---

## 一、跑起来

```bash
node server.js                 # 默认 8091
PORT=8091 HOST=0.0.0.0 node server.js
```

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | 8091 | 监听端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `TIKU_ADMIN_KEY` | 空 | **后台管理口令**。不配 → 所有写接口 fail-closed（403） |
| `MIN_SCORE` | 0.55 | 命中阈值，低于视为未命中（宁可回退 AI 也不给错答案） |
| `AMBIGUITY_GAP` | 0.03 | 最优/次优答案分差小于它 → 判定歧义，弃答 |
| `LLM_ENABLED` | 关 | 服务端 LLM 兜底（主观题） |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `LLM_MODEL` | — | LLM 参数 |
| `PRIVATE_POOL_MAX` | 5000 | 单个用户私有题库上限 |

> **公网暴露走网关**：8091 不对公网开放，由主后端 8080 的 `/tiku-api/*` 反代过来。
> 脚本里配的题库地址就是 `https://xspirt.online/tiku-api/tiku`。

---

## 二、三层题库

| 层 | 文件 | 谁能看到 | 怎么进 |
| --- | --- | --- | --- |
| **公共池** | `data/tiku.json` | 所有人 | 管理员导入 / 审核晋升 |
| **用户私有池** | `data/pools/<clientId>.json` | 只有本人 | 脚本判分回写（带 `clientId`） |
| **沉淀池（待审）** | `data/pool.json` | 管理员 | 脚本回写时同时进这里，审核后才进公共池 |

**为什么要分三层**：以前所有用户的回写都堆在同一个池子里，审核通过就进公共池
→ A 用户的题会影响 B 用户的答案，规模化就变成了「互相投毒」。
分池之后：私有池只有本人能用（回写完立刻可查，不用等审核），
公共池只放审核过的（答案可信度由人保证）。

---

## 三、接口

### 查询（公开）

```
GET|POST /tiku
{ "question": "题干", "options": ["A文本", ...], "type": "单选题", "clientId": "可选" }
→ { "code": 1, "answer": { "allAnswer": ["C"] }, "score": 1, "source": "计算机网络.csv" }
```

查找顺序：**公共池 → 请求方私有池（按 clientId）→ 远程上游 → LLM 兜底**。

### 写入

| 接口 | 鉴权 | 说明 |
| --- | --- | --- |
| `POST /api/pool` | 公开（有限流+质量闸） | 脚本回写。带 `clientId` → 进私有池；`contribute:false` → 不进待审池 |
| `POST /api/add` | 需 key | 加单题 |
| `POST /api/bulk` | 需 key | 批量导入（`{items:[...]}` / `{text, format}` / 裸 JSON 数组） |
| `POST /api/collect` | 需 key | 旧版回写口（保留兼容） |
| `GET /api/q?page=&pageSize=&q=&type=` | 需 key | 题目列表 |
| `DELETE /api/q/:id` | 需 key | 删题 |
| `PUT /api/q/:id` | 需 key | 改题 |
| `POST /api/q/bulk-delete` | 需 key | 批量删题 |
| `GET /api/pool` / `POST /api/pool/promote` / `DELETE /api/pool/:id` | 需 key | 沉淀池审核 |
| `GET /api/sources` `POST /api/sources` `DELETE /api/sources/:name` | 读需 key / 写需 key | 外部上游管理 |
| `GET /api/export?format=json\|csv\|tsv` | 需 key | 导出题库 |

管理口令放请求头 `x-admin-key`。

### 质量闸（写入前自动校验）

题干 4~500 字 · 答案非空 ≤80 字 · 题型合法 · 选项 2~8 个 · 无空选项 ·
选项内容不重复 · **答案字母必须在选项范围内** · 单选只能一个答案 · 多选至少两个。

单 IP 回写限流 120 条/小时。

---

## 四、外部上游

`data/remote-sources.json`（复制 `remote-sources.example.json` 改名后填）：

```json
{
  "xingye": {
    "enabled": true,
    "protocol": "tikuAdapter",
    "url": "https://…/tiku",
    "timeout": 5000,
    "headers": {},
    "token": ""
  }
}
```

服务会**并发**查所有启用的上游，第一个有答案的胜出；某个挂了不影响其它（失败回退）。

---

## 五、导入

```bash
# 本地导入
node import.js seed/计算机网络.csv
node import.js 题库.json json

# 直接推进**服务器**上的公共池（不用手传文件）
node import.js 题库.json json --remote https://xspirt.online/tiku-api --key <管理口令>
```

JSON 格式：

```json
[{ "question": "题干", "type": "单选题",
   "options": [{ "letter": "A", "text": "选项文本" }],
   "answer": "A", "source": "来源" }]
```

`options` 也接受字符串数组 `["选项一", "选项二"]`（按顺序自动编号 A/B/C…）。

---

## 六、选项顺序无关

题库存的是**选项文本**，不是字母 —— 因为换一批题时选项顺序可能打乱，
按字母存会导致选错。查询时按当前页面的选项文本反查字母（`lib/matcher.js` 的
`mapAnswerToLetters`），所以题库和页面选项顺序不一致也不会选错。
