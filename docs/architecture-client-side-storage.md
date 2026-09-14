# Lethe 架构方案：客户端存储 + 服务端纯运算 + 5 分钟 TTL

> 任务：VYB-356（父任务 VYB-354 / T1）
> 版本基线：Lethe v1.3.1，`main`/`dev` 均在 `736c3ea`
> 状态：已定稿，无待拍板事项。任务 2（客户端存储）、任务 3（PWA）、任务 4（TTL 清理）可直接据此实施。

## 1. 目标与已确认决策

改造目标：把「用户数据」从服务端 `DATA_DIR` 迁移到用户浏览器，服务端只保留一次运算所需的临时数据，并在 5 分钟 TTL 后全部删除。界面与单机 NiceGUI 形态保持不变，用户不需要任何额外部署。

已由用户拍板、本方案不再重新讨论的决策：

1. 保持现有单机 NiceGUI 服务端形态，不改造为独立的多用户服务体系。
2. 文档、词典、运行记录、token→name 映射等信息只存放在用户浏览器客户端。
3. 服务端只做运算，运算留下的文件与结果在 **5 分钟 TTL** 到期后全部删除。

本方案要回答的六个问题（对应 Issue 正文的工作内容）：浏览器端存储选型与数据结构、前后端数据边界、NiceGUI 接口改动、服务端临时数据生命周期、多用户隔离与安全、风险与回退。第 9 节给出模块级改动清单，第 10 节给出任务 2/3/4 的交接结论。

## 2. 现状基线（改造前）

先固定「今天是什么样」，后面所有改动都以此为对照。

- `app.py` 是 NiceGUI 单页应用。每个浏览器连接对应一个 Python 闭包作用域，`build_deidentify_panel()` 里的 `files: list[dict]` 把**所有上传文档的原始字节**长期保留在服务端内存中（`{"name","kind","data","text","warnings"}`），直到用户点「Start over」或关闭会话。
- `lethe/store.py` 把词典写到 `DATA_DIR/entities.json`、自定义 token 类型写到 `DATA_DIR/token_types.json`，服务端全局共享。
- `lethe/vault.py` 把每个 job 的 token→name 映射用 PBKDF2(SHA-256, 480k)→Fernet 加密后写到 `DATA_DIR/vault/<job_id>.vault.json`，另有一份**明文** `DATA_DIR/vault/index.json` 保存日期、源文件名、替换数量。
- `lethe/docio.py` 把 OCR 模型放在 `DATA_DIR/tessdata/`；`_read_pdf` 用 `lru_cache(maxsize=1)` 在内存里缓存一份解析后的 PDF，`clear_pdf_cache()` 在每个 job 结束时清空。
- `lethe/core.py` 的 `detect / assign_tokens / build_replacer / build_restorer` 是纯函数式引擎，不碰磁盘；`build_replacer` 产出的 `token_to_real` 就是需要被保护的映射。
- `lethe/nlp_suggester.py` 通过 `pip install` 把 spaCy 模型装进服务端 Python 环境（`DATA_DIR` 之外的 site-packages），OCR 模型下载到 `DATA_DIR/tessdata/`。这些是**程序资源**，不是用户数据。
- `lethe/web_static/` 只有 `favicon.svg` 与 `fonts/cinzel-latin.woff2`，没有 PWA manifest / service worker。
- `ui.run(..., storage_secret="deident-local")`：NiceGUI 的会话存储密钥是硬编码常量。

结论：要满足决策 2、3，必须切断三处服务端持久化（`store.py`、`vault.py`、页面闭包里的文档字节），并把浏览器数据放在**真正的浏览器存储**里，而不是 NiceGUI 的存储代理。

## 3. 总体架构

```
┌─────────────────────────── 浏览器（用户数据所在） ───────────────────────────┐
│  IndexedDB "lethe"                localStorage           页面内存（不持久化）│
│  ├ entities   （词典）             ├ lethe.prefs.v1        ├ 上传文档 File/  │
│  ├ token_types（自定义类型）       │   {lang, theme,…}      │   ArrayBuffer    │
│  ├ jobs       （加密映射+历史）    └ …                     ├ 提取文本（预览） │
│  └ meta       （schema 版本）                              ├ 评审勾选状态     │
│                                                            └ 生成结果 Blob    │
│  client-store.js（IndexedDB + WebCrypto）   session.js（上传/下载/桥接）      │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │  本地 HTTP（127.0.0.1）：上传原始文档、词典快照、还原映射
                │  回传：提取文本 / 检测项 / 脱敏结果 / 还原结果
┌───────────────▼────────────────────────────── 服务端（纯运算） ──────────────┐
│  NiceGUI 页面（WebSocket，仅界面状态）                                        │
│  FastAPI 端点 /api/*（上传、检测、脱敏、还原、迁移、运行时自检）               │
│  lethe/ 引擎：core.py · docio.py · nlp_suggester.py（无用户数据持久化）        │
│  runtime/ 临时区（job_id 目录，TTL 5 分钟，进程内注册表 + 定期清理）           │
│  tessdata/ · site-packages 模型（程序资源，不属用户数据、不受 TTL 管理）       │
└──────────────────────────────────────────────────────────────────────────────┘
```

一句话概括边界：**浏览器是唯一的用户数据真相来源；服务端是幂等的纯函数 + 5 分钟临时工作区。**

## 4. 浏览器端存储选型与数据结构

### 4.1 选型分工

| 存储 | 放什么 | 不放什么 | 理由 |
|---|---|---|---|
| **IndexedDB**（库名 `lethe`） | 词典 `entities`、自定义 token 类型 `token_types`、运行记录与加密映射 `jobs`、schema 元数据 `meta` | 原始文档、提取文本、结果文件（这些放页面内存） | 结构化、可索引、容量大（磁盘配额级别）、支持事务与版本升级；词典与映射需要按 job/名称查询 |
| **localStorage** | 语言偏好（任务 5）、主题、上次所在标签页等轻量设置 | 任何含姓名/映射的数据 | 同步、简单、够小；但只有 ~5 MB 且无事务，不适合结构化数据 |
| **sessionStorage** | 不采用 | — | 关闭标签页即丢失，无法满足「重开应用后数据仍在」；语义与需求冲突 |
| **页面内存（JS 变量 / Blob / object URL）** | 本次会话上传的原始文档字节、提取文本（预览高亮用）、评审勾选状态、生成的结果 Blob | — | 这些是「一次运算」的中间态，重开页面后用户重新选文件即可；持久化它们既无必要也扩大泄露面 |
| **NiceGUI `app.storage.user` / `app.storage.browser`** | **不采用** | — | 两者都把数据镜像/落盘到服务端（`user` 走服务端文件或 Redis，`browser` 由服务端读写浏览器 localStorage），与「数据永不离开浏览器」直接冲突，且容量与并发语义都不合适 |

### 4.2 IndexedDB 结构（`lethe`，version 1）

```text
DB: "lethe"  version 1
├─ store "entities"      keyPath: "key"           （key = canonical.toLowerCase().trim()）
│    { key, canonical, type, aliases: string[], updatedAt: ISO8601 }
│    index "by_type" on "type"
├─ store "token_types"   keyPath: "id"            （单条记录，整体原子替换）
│    { id: "token_types", types: string[], updatedAt }
├─ store "jobs"          keyPath: "jobId"
│    { jobId, schemaVersion: 1, createdAt, sourceFiles: string[], replacements: int,
│      passphraseProtected: bool,
│      crypto: null | { kdf: {name:"PBKDF2", hash:"SHA-256", iterations:480000, saltB64},
│                        cipher: {name:"AES-GCM", ivB64}, ciphertextB64 } }
│    index "by_createdAt" on "createdAt"
└─ store "meta"          keyPath: "key"
     { key: "schemaVersion", value: 1 }
     { key: "installedAt",   value: ISO8601 }
     { key: "lastMigration", value: ISO8601 | null }
```

说明：

- `jobs.crypto` 为空表示「空口令、映射以明文存在客户端」——与当前 `vault.py` 中「blank passphrase = 未加密」的语义保持一致，UI 必须给出同等强度的警告。
- 运行记录（「Past conversions」列表）直接由 `jobs` 的**非敏感字段**（`createdAt`、`sourceFiles`、`replacements`）渲染，不引入单独的 `index.json`；敏感映射只在用户输入口令、本地解密后短暂出现在内存中。
- 词典键用规范化小写，别名去重逻辑沿用 `store.merge_entities()` 的语义（新增别名合并进已有条目，按 canonical 大小写不敏感去重）。

### 4.3 客户端加密（`jobs.crypto`）

- 算法：PBKDF2-SHA-256（480,000 次，随机 16 字节 salt）派生 256-bit 密钥 → AES-GCM-256（每 job 随机 12 字节 IV）加密 `{jobId, created, meta, mapping}`。
- 实现：浏览器原生 Web Crypto API，不引入第三方加密库；口令只存在于页面内存，绝不写入 localStorage / IndexedDB。
- 与现状对齐：迭代次数、salt 长度、口令语义与 `vault.py` 的 PBKDF2(SHA-256, 480k)+Fernet 安全档位一致；差别是 Fernet（AES-128-CBC+HMAC）换成 AES-GCM（两者都是带认证的加密）。迁移旧数据时见第 8 节。
- 迁移兼容（可选）：Web Crypto 可实现与 Fernet 兼容的 AES-CBC+HMAC 解密（Fernet 密钥 = urlsafe_b64(PBKDF2 输出 32B)，前 16B 为 AES-128-CBC 密钥、后 16B 为 HMAC-SHA256 密钥，token 结构为 base64url(ver‖ts‖iv‖ct‖hmac)），因此纯浏览器迁移在技术上可行；但推荐走第 8 节的服务端辅助迁移，复用已测试的 Python `vault.py`。

### 4.4 版本与迁移策略

- 所有写入通过 `indexedDB.open("lethe", N)` 的 `onupgradeneeded` 完成结构升级；每条记录带 `schemaVersion`。
- 升级规则：只做**加法**（新增 store / 新增字段并回填默认值），不做破坏性重命名；删除字段至少跨一个版本。
- 当浏览器里的 `meta.schemaVersion` 低于代码期望值：先在事务中回填，再写回版本号；失败则保留旧数据并提示用户导出备份。
- 提供「导出/导入备份」：导出为单个 JSON（`{schemaVersion, exportedAt, entities, token_types, jobs}`，其中 `jobs.crypto` 保持加密态），导入时校验版本并按 `jobId`/`key` 合并（同 id 冲突以较新 `updatedAt` 为准）。这是浏览器存储被清空时唯一的恢复手段。
- 容量与持久化：首次保存后调用 `navigator.storage.persist()` 申请持久化存储（PWA 安装后成功率更高）；写入前用 `navigator.storage.estimate()` 检查配额，接近上限时提示导出并清理旧 job。

## 5. 前后端数据边界

### 5.1 永不离开浏览器的数据

| 数据 | 位置 | 说明 |
|---|---|---|
| 实体词典（含别名） | IndexedDB `entities` | 服务端仅在单次检测请求中以「词典快照」形式接收，用完即弃 |
| 自定义 token 类型 | IndexedDB `token_types` | 同上，随请求上传 |
| token→name 映射（vault） | IndexedDB `jobs.crypto` | 服务端只在「生成」响应里返回一次，随后从临时区删除；还原时由浏览器解密后**按请求**上传 |
| 运行记录（时间/文件名/替换数） | IndexedDB `jobs` | 明文元数据，不含真实姓名 |
| 语言/主题等偏好 | localStorage | 任务 5 复用 |
| 提取文本、评审勾选、原始文档字节、结果 Blob | 页面内存 | 仅在本次会话内保留 |

### 5.2 随运算上传的最小必要数据

| 请求 | 上传内容 | 用途 |
|---|---|---|
| 创建 job（上传文档） | 原始文档字节（docx/pptx/xlsx/pdf/txt/eml/msg/html） | 服务端提取文本、生成预览、后续脱敏 |
| 检测 | 词典快照 + 自定义类型 + 检测开关 | `core.detect()`；不含文档（用服务端已存的提取文本） |
| 脱敏 | 勾选项 + 类型修正（token 可带预览编号） | `core.build_replacer()` + `docio.redact_document()` |
| 还原（Re-identify） | 浏览器本地解密后的 `token→real` 映射 + AI 回复文件/文本 | `core.build_restorer()` + `docio.redact_document()` |
| 手动还原（Restore） | 用户在界面填写的 token→值映射 + 文件/文本 | 同上 |
| 一次性迁移 | 旧口令（仅迁移期间） | 服务端用现有 `vault.py` 解密旧 `DATA_DIR/vault/*`；不落盘、不写日志 |

> **token 分配归属（定稿）：** 最终 token 编号的唯一权威点是服务端 `/api/jobs/{id}/redact`（内部调用 `core.assign_tokens()`），因为编号必须基于用户最终勾选的集合重算；浏览器只提交勾选与类型修正。`/detect` 返回的 `token` 仅为预览用临时编号，不落库、不参与还原。

### 5.3 运算结果如何回传且不落盘

- 提取阶段：`docio.extract_text()` + `pdf_warnings()` 的结果作为响应体返回浏览器；服务端临时区只保留原始字节（供后续脱敏）与提取文本缓存。
- 检测阶段：返回序列化后的 `items`（`type/canonical/surfaces/source/count/include/token`，其中 `token` 为预览用临时编号），**不含**文档正文以外的额外信息。
- 脱敏阶段：返回 `outputs[]`（文件名 + 字节）与 `token_to_real`；响应成功写出后，**立即删除**该 job 的结果文件与映射（不等 TTL）；TTL 清理器是兜底。
- 还原阶段：返回重建后的字节与命中计数；请求中的映射不缓存、不写日志。
- 传输形态：本地回环 HTTP（`127.0.0.1`）。文件类响应用 `application/octet-stream` / zip，浏览器侧用 `Blob` + `URL.createObjectURL` 下载；小对象用 JSON。这样避免 NiceGUI WebSocket 对大二进制的不必要开销，也让「服务端持有时间」完全由 API 调用点决定。

## 6. NiceGUI 接口改动

### 6.1 Python ↔ 浏览器存储的桥接方式

页面构建时 Python 侧不再持有用户数据，需要一条受控的读写通道：

1. **读（Python 取浏览器数据）**：`await ui.run_javascript('return await window.lethStore.getEntities()')`。NiceGUI 的 `run_javascript` 支持返回 JSON 可序列化结果，足以承载词典、类型、job 元数据这类小对象。
2. **写（浏览器落库）**：`ui.run_javascript('await window.lethStore.saveEntities(...)')`，仅做副作用、不关心返回值。
3. **大对象（文档/结果）**：不经过该桥，直接用原生 `<input type="file">` + `fetch()` 调 `/api/*`，浏览器持有 `File`/`ArrayBuffer`，按需重传。
4. 面板构建从「同步读盘」改为「先渲染骨架 → 异步载入后 `refresh()`」，例如词典面板：页面加载后读取 IndexedDB → 填充 `rows` → `render_rows.refresh()`。

### 6.2 HTTP 端点契约（新增）

端点注册在 NiceGUI 暴露的底层 FastAPI 应用上（`from nicegui import app`，`@app.post(...)`；NiceGUI 版本未固定，任务 2 实施时先确认该 API 表面，必要时用 `app.add_api_route`）。

| 端点 | 方法 | 入参 | 返回 | 备注 |
|---|---|---|---|---|
| `/api/jobs` | POST | multipart：`files[]` + `entities` + `token_types` + `options` | `{job_id, created_at, expires_at, files:[{name, kind, warnings, text}]}` | 提取文本回传浏览器预览；原始字节进 runtime 临时区 |
| `/api/jobs/{job_id}/detect` | POST | `{entities, token_types, options}` | `{items:[…]}`（`token` 为预览用临时编号） | 只读服务端提取文本；刷新 `last_touch` |
| `/api/jobs/{job_id}/redact` | POST | `{items:[…]（include + type；token 可为预览编号）, add_to_dictionary}` | `{items:[…]（含最终 token）, outputs:[{name, ext, data_b64}], token_to_real, replacements, meta}` | token 由服务端 `core.assign_tokens()` 基于最终勾选集合分配；响应后立即删结果与映射；`meta` 供浏览器写 `jobs` |
| `/api/restore` | POST | multipart：`mapping`（JSON）+ `file` 或 `text` | `{outputs:[…], hits}` | 映射由浏览器解密后上传；服务端不查 vault |
| `/api/restore/scan` | POST | `{text}` 或文件 | `{tokens:[{token,count}]}` | 可选；也可在 JS 侧用正则完成，推荐 JS 侧（见 §10 决策 3） |
| `/api/migrate/export` | POST | `{passphrase?}` | `{entities, token_types, jobs:[{…, mapping}]}` | 仅一次性迁移使用；读 `DATA_DIR` 下的旧用户数据，口令不落盘不写日志；临时数据生命周期见 §7.6 |
| `/api/migrate/finalize` | POST | `{}` | `{archived_to}` | 只归档旧**用户数据**（`entities.json`、`token_types.json`、`vault/`）到 `DATA_DIR/legacy-backup-<ts>/`；`runtime/` 与 `tessdata/` 原地不动，**不删除** |
| `/api/runtime` | GET | — | `{jobs:[{job_id, files, bytes, last_touch_at, expires_at}]}` | 仅 `LETHE_DEBUG_RUNTIME=1` 时注册；供任务 4 验证，绝不返回内容 |

安全约束：所有 `/api/*` 端点校验 `Origin`/`Host` 为回环地址，拒绝跨站表单与跨源读取；job_id 用 `secrets.token_urlsafe(16)`，不可枚举；响应设置 `Cache-Control: no-store`。

### 6.3 页面状态与事件处理改动

| 位置 | 现状 | 改为 |
|---|---|---|
| `build_deidentify_panel()` 的 `files` 闭包 | 服务端长期持有全部文档字节 | 浏览器 `window.lethSession.files` 持有 `File`/`ArrayBuffer`；Python 只持有 `job_id` 与元数据 |
| `on_file()`（`ui.upload`） | NiceGUI 上传到 Python 内存 | 原生 file input + `fetch('/api/jobs')`；`ui.upload` 可保留为兜底入口，但不再把字节留在闭包里 |
| `run_detection()` | 调 `_detect_text(text, load_entities())` | 调 `/api/jobs/{id}/detect`，词典快照来自 IndexedDB |
| `on_generate()` | `vault.save_job()` + `merge_entities()` 写服务端盘 | 调 `/api/jobs/{id}/redact`；浏览器加密后写 `jobs`；「加入词典」改为写 IndexedDB `entities` |
| `build_reidentify_panel()` 历史 | `vault.history()` 读 `index.json` | 读 IndexedDB `jobs` 元数据；还原时本地解密 mapping 再 POST `/api/restore` |
| `build_restore_panel()` 的 `custom_types = load_token_types()` | 同步读盘 | 异步读 IndexedDB；token 扫描放 JS 侧 |
| `build_dictionary_panel()` | `load_entities()/save_entities()` 读写文件 | 异步桥接读写 IndexedDB；新增「导出/导入备份」按钮 |
| `build_settings_panel()` 的「Files & folders」卡片 | 展示 `DATA_DIR` 与「打开文件夹」 | 改为「浏览器数据（IndexedDB）」卡片：备份/恢复、配额、清空警告；另加只读的「服务端临时区」信息与 TTL 值；语言切换（任务 5）写 localStorage |
| 新增：TTL 提示 | — | 生成结果页展示「服务端临时副本将在 N 分钟后清除」，以及过期后自动重传的提示 |
| `ui.run(storage_secret=…)` | 硬编码 `"deident-local"` | 改为每次安装随机生成并持久化到 `DATA_DIR/.session_secret`（该密钥只保护 NiceGUI 会话，不含用户数据） |

## 7. 服务端临时数据生命周期（TTL）

这是任务 4 的实施依据，必须逐条落地。

### 7.1 临时区位置与结构

- 目录：`$LETHE_RUNTIME_DIR`，默认 `$LETHE_DATA_DIR/runtime/`。
- 结构：`runtime/<job_id>/{source/<idx>.<ext>, text/<idx>.txt, out/<name>, job.json}`；目录权限 `0700`。
- 进程内注册表：`{job_id: {created_at, last_touch_at, dir, files:{path:size}, bytes}}`，`job.json` 与注册表内容一致，进程重启后由目录扫描恢复。
- 配置：`LETHE_JOB_TTL_SECONDS`（默认 `300`）、`LETHE_JOB_MAX_LIFETIME_SECONDS`（默认 `3600`，0 表示关闭）。

> **`DATA_DIR` 在改造后的角色（与迁移归档的边界）：** `DATA_DIR` 仍是应用数据根目录，稳态下只承载**非用户数据**——`runtime/`（临时工作区）、`tessdata/`（OCR 程序模型）、`.session_secret`。旧用户数据（`entities.json`、`token_types.json`、`vault/`）在迁移前暂存于此，迁移归档只移动这三项（见 §11.1 第 5 步），**绝不整体改名或删除 `DATA_DIR`**，因此 `runtime/` 与 `tessdata/` 不会被迁移动作波及。§7.3/§7.4 的清理只作用于 `runtime/`，与迁移归档互不影响。

### 7.2 计时起点（已定）

- **起点 = 每个 job 的 `last_touch_at`（滑动 TTL）。** `expires_at = last_touch_at + TTL`。
- 「touch」只由服务端参与的动作触发：创建 job（上传）、提取、检测、脱敏、还原、下载类响应。
- 纯前端交互（预览滚动、勾选、切换标签页、编辑词典）**不** touch —— 服务端此时没有任何该 job 的数据在用。
- 因此：**一次运算结束后不再有任何服务端请求，上传文档与中间文件会在最后一次活动后 5 分钟被删除**，满足验收标准「超过 5 分钟后服务端目录中不再存在该次运行的上传文档、中间文件与结果文件」。
- 选择滑动而非「从创建时刻固定 5 分钟」的理由：用户在评审界面停留超过 5 分钟是常态，固定起点会在流程中途删掉仍在使用的原始文档；浏览器已持有全部用户数据，过期后重传即可恢复，滑动 TTL 既满足删除要求又不破坏流程。
- `LETHE_JOB_MAX_LIFETIME_SECONDS` 是防呆上限：即使被持续 touch，job 也不会无限期占用服务端空间。

### 7.3 清理对象

| 对象 | 位置 | 清理时机 |
|---|---|---|
| 上传的原始文档 | `runtime/<job>/source/` | TTL 到期 / job 完成 / 进程退出 |
| 提取文本与 PDF 解析缓存 | `runtime/<job>/text/`、`docio._read_pdf` 内存缓存 | TTL 到期；每个 job 结束时调用 `clear_pdf_cache()` |
| OCR 中间件与临时文件 | `runtime/<job>/`（liteparse 读取的是内存 bytes，若产生临时文件也放这里） | 同 TTL |
| 脱敏/还原结果文件 | `runtime/<job>/out/` | 响应写出后**立即**删除；失败时由 TTL 兜底 |
| token→name 映射 | 仅请求内存 + 响应体 | 响应后立即释放；不写入磁盘、不写日志 |
| 会话缓存（NiceGUI 闭包中的 job 描述符） | 进程内存 | 客户端断开或 TTL 到期时移除 |
| **不清理**：`tessdata/` OCR 模型、site-packages 中的 spaCy 模型、`web_static/` 静态资源、程序日志 | — | 属程序资源，不是用户数据 |

### 7.4 清理方式（三层，缺一不可）

1. **定时清理**：`app.on_startup` 启动一个 asyncio 任务，每 30 秒扫描注册表，删除 `now > expires_at` 的 job 目录；无 job 时休眠，避免空转。
2. **请求前清理**：每个 `/api/*` 请求处理前先做一次机会式扫描（O(n)，n 为活动 job 数），保证即使定时任务异常也不会让过期数据存活到下一次扫描周期。
3. **进程退出清理**：`app.on_shutdown` + `atexit` 兜底删除全部 runtime 目录；**进程启动时**先扫描并清空 `runtime/` 下所有残留（处理上次崩溃/断电遗留），再开始接受请求。

删除动作写结构化日志：`ttl-purge job=<id> reason=<expired|done|startup|shutdown> files=<n> bytes=<n>`。日志只含 job_id 与计数，**绝不含文件名、正文或映射**。

### 7.5 验证手段（任务 4 验收）

- 自动化：`tests/test_runtime_ttl.py` 用可注入时钟覆盖：创建 → 未过期不删；touch 后过期时间顺延；到期后目录与注册表均为空；`max_lifetime` 生效；`startup` 清扫残留；日志中不含正文（断言日志字段白名单）。
- 手动（可重复步骤）：
  1. `LETHE_JOB_TTL_SECONDS=5 LETHE_DEBUG_RUNTIME=1` 启动应用；
  2. 上传样本文档并完成一次「检测 → 生成」；
  3. 立即 `curl 127.0.0.1:8731/api/runtime`，应看到该 job 及剩余时间；
  4. 等待 6 秒后再次查询，应为空；`find "$LETHE_DATA_DIR/runtime" -type f` 应无输出；
  5. `kill -9` 进程后重启，确认启动清扫后 runtime 为空。
- 端到端：任务 7 回归中把「5 分钟无残留」列为必测项。

### 7.6 非 job 请求（一次性迁移）的临时数据

`/api/migrate/export` **不创建 job**、不进 §7.1 的 job 注册表，因此不适用 job 级 TTL；它的临时数据生命周期定为**单个 HTTP 请求作用域**：

- 旧口令与解密后的明文映射只存在于该请求的局部变量中，不写磁盘、不写日志；响应体写出完成后即释放。
- 防护约束：端点超时（默认 60 秒）、导出体量上限（默认 50 MB，超出返回错误并提示用户精简或分批发往浏览器）、仅允许本机回环调用、响应 `Cache-Control: no-store`。
- 若未来实现需要在迁移导出中**中间落盘**（例如超限拆分），落盘内容必须注册为 `migrate-<ts>` 伪 job，进入同一注册表并服从 §7.2-§7.4 的 TTL 与清理。

## 8. 多用户隔离与安全

### 8.1 同机多浏览器互不可见

- **数据隔离靠浏览器**：IndexedDB/localStorage 以「源 + 浏览器 profile」为边界，两个 profile / 两台机器的浏览器各自独立，天然互不可见。
- **服务端无共享用户数据**：改造后 `DATA_DIR` 不再有 `entities.json`、`token_types.json`、`vault/`；服务端只按不可枚举的 `job_id` 提供临时工作区，因此不存在「A 用户看到 B 用户词典/记录/映射」的服务端面。
- **同浏览器多标签页**：按设计共享同一份 IndexedDB（同一「用户」）；用 `BroadcastChannel('lethe')` 广播词典/类型的写入，其他标签页收到后刷新；冲突以 `updatedAt` 较新者为准，并在界面提示「词典已在另一标签页更新」。
- **同机不同 OS 用户共享一个服务端进程**（少见）：服务端 uid 相同意味着对方理论上可读你的临时目录。这是操作系统的信任边界，不是 Lethe 能隔离的范围。建议一个 OS 用户跑一个实例（现有按用户安装已满足），并在文档中说明该残留风险。
- 服务端临时目录权限 `0700`、job_id 随机、`/api/runtime` 默认关闭，进一步降低误读面。

### 8.2 客户端密钥存储与风险

- 口令只在页面内存中短暂存在，用于 PBKDF2 派生密钥；派生出的密钥不落盘，仅用于当次加解密。
- 空口令 = 映射明文存于 IndexedDB（与旧版「blank passphrase = unprotected」一致），UI 必须红色提示，并在导出备份时再次警告。
- 风险清单与缓解：

| 风险 | 说明 | 缓解 |
|---|---|---|
| 浏览器存储被清除 / 换机器 | IndexedDB 被清空即丢失词典与还原能力 | 「导出/导入备份」；`navigator.storage.persist()`；界面提示备份 |
| 存储未加密 | IndexedDB 默认不随 OS 全盘加密之外再加一层 | 敏感映射本身用 AES-GCM 加密；词典明文属用户自选（与旧版 `entities.json` 明文一致） |
| XSS / 本机恶意软件 | 页面被注入脚本可在输入口令后读取明文 | 不加载外部脚本、加 CSP、纯本地无 CDN；风险与旧版本机文件同级，需在文档说明 |
| 口令遗忘 | 映射不可恢复（设计如此） | 生成时二次确认；备份文件含加密态映射 |
| 配额 / 驱逐 | 非持久化源可能被浏览器回收 | 申请持久化存储；配额监控；历史记录可裁剪 |
| NiceGUI 会话密钥硬编码 | 会话可被猜测劫持 | 改为按安装随机生成并持久化 |

## 9. 模块级改动清单（任务 2/3/4 的实施依据）

| 文件 | 改动点 | 影响说明 |
|---|---|---|
| `app.py` | 新增 `/api/*` 端点；用 `ui.run_javascript` 桥接 IndexedDB；`files`/`items` 改为浏览器侧状态；历史与词典改为异步读客户端库；新增迁移/备份/TTL 提示 UI；`storage_secret` 随机化 | 单文件改动量最大（≈5 个面板 + 新端点）。检测/脱敏算法调用不变，回归风险集中在状态管理与异步时序 |
| `lethe/__init__.py` | 新增 `RUNTIME_DIR`、`JOB_TTL_SECONDS` 解析与导出；导出新 `runtime` 模块 | 向后兼容：`DATA_DIR` 仍存在，但稳态只承载非用户数据（`runtime/`、`tessdata/`、`.session_secret`）；不再写用户词典/vault，旧用户数据仅在迁移归档目录 `legacy-backup-*` 中保留 |
| `lethe/core.py` | 基本不变；新增 `items_to_dict()` / `items_from_dict()` 供 API 序列化，token 分配逻辑保持现状 | 检测/替换/还原行为零变化；新增的是纯序列化辅助，便于任务 2 复用与测试 |
| `lethe/docio.py` | `DATA_DIR` 仅保留 `tessdata`（程序资源）；临时文件统一走 runtime；明确 `clear_pdf_cache()` 的调用点；OCR 语言安装不参与 TTL | 文档格式处理逻辑不变；改动集中在路径来源与缓存生命周期 |
| `lethe/nlp_suggester.py` | 无数据边界改动；保持服务端模型下载/卸载；模型目录不纳入 TTL；与任务 6（VYB-357）的模型扩充解耦 | 行为不变；仅需确认模型安装目录不被误删 |
| `lethe/store.py` | 移除文件读写（`entities.json` / `token_types.json`）；保留 `merge_entities()` 等纯逻辑与「dict ↔ Entity」转换，供 API 与迁移复用 | 破坏性变更：`load_entities/save_entities` 语义改变；`tests/test_smoke.py` 等直接调用文件持久化的用例需改为纯函数用例 |
| `lethe/vault.py` | 稳态不再写盘；保留 Fernet 解密能力供 `/api/migrate/export`；新增 `decrypt_record(record, passphrase)` 便于迁移；新增 `export_all()` 读取旧 `DATA_DIR/vault`，以及 `archive_legacy(keep_runtime=True)` 只归档 `entities.json`/`token_types.json`/`vault/` 到 `DATA_DIR/legacy-backup-<ts>/` | 破坏性变更：`save_job/load_job/list_jobs/delete_job/history` 不再面向稳态；客户端承担加密与历史；归档不动 `runtime/`、`tessdata/` |
| `lethe/web_static/` | 新增 `client-store.js`（IndexedDB + WebCrypto 封装）、`session.js`（上传/下载/桥接）；任务 3 追加 `manifest.webmanifest`、`sw.js`、图标 | 任务 2 与任务 3 共享这些文件；service worker 只缓存静态资源，**不缓存**文档与结果 |
| 新增 `lethe/runtime.py` | TTL 注册表、目录管理、三层清理器、日志 | 任务 4 的核心实现点，被 `app.py` 端点调用 |
| `tests/` | 新增 TTL 单测、API 集成测试；更新 `test_smoke.py` 中依赖文件持久化的部分 | 现有 docx/pptx/xlsx/pdf/email 格式测试不应回归 |
| `README.md` / `docs/` | 更新「存储与隐私」描述（不再是纯本地无服务端，而是「服务端纯运算 + 浏览器存储」）、备份说明、TTL 行为 | 任务 7 负责终稿；本任务先提供架构依据 |

## 10. 选项与推荐（无遗留待拍板事项）

以下为实施中会遇到的选择，本方案已给出推荐，任务 2-4 直接按推荐执行即可，无需再次确认。

1. **传输方式**：推荐「页面状态走 WebSocket + 文档/结果走本地 HTTP `/api/*`」；理由是大二进制走 REST 更稳定、服务端持有时间可控、便于按请求做 TTL；纯 WS 方案会让字节滞留在会话闭包里。
2. **TTL 起点**：推荐滑动 TTL（`last_touch_at + 300s`，另有 1 小时硬上限）；理由见 §7.2。备选固定起点会让长时间评审的流程中途失效。
3. **手动还原的 token 扫描**：推荐放在 JS 侧（正则 + 用户填值），服务端只做文件重建；理由是扫描结果完全来自用户文档，放客户端可减少一次上传与一份服务端副本。
4. **旧 vault 迁移解密**：推荐服务端辅助（一次性传口令给本机服务端，复用已测试的 `vault.py`）；备选纯浏览器 Fernet 兼容解密可做到口令不出浏览器，但实现与测试成本更高。
5. **runtime 存放介质**：推荐 `$LETHE_DATA_DIR/runtime/` 下的临时目录（可配置、便于验证与启动清扫）；纯内存方案在崩溃后无残留但也无法审计，且大文件更易触发内存压力。配套边界已定稿：`DATA_DIR` 稳态只承载非用户数据，迁移归档只移动三项旧用户数据（§7.1、§11.1 第 5 步），因此 runtime 与 tessdata 不会被归档或清理。
6. **历史记录位置**：推荐 IndexedDB（与映射同库，便于原子删除）；备选 localStorage 容量与事务都不足。
7. **JS 测试栈**：推荐在**本地**用 pixi 建一个含 node/playwright 的验证环境跑浏览器侧用例；仓库内的依赖声明仍以现有 `pyproject.toml` / `requirements*.txt` 为准，不改变用户既有运行方式。

## 11. 风险与回退

### 11.1 旧 `DATA_DIR` 用户数据的一次性迁移

目标：老用户升级后不丢词典、自定义类型与已加密的还原映射。步骤：

1. **升级前备份**：文档提示用户备份 `DATA_DIR`（Settings 里的路径）。
2. **检测条件**：新版本启动时，若 `DATA_DIR` 存在 `entities.json` / `token_types.json` / `vault/*.vault.json` 且浏览器 IndexedDB 为空 → Settings 显示「从本机旧数据迁移」。
3. **导出**：浏览器调 `POST /api/migrate/export`（可带旧口令）。服务端读取 `DATA_DIR` 下的旧用户数据（`entities.json`、`token_types.json`、`vault/`），用 `vault.py` 解密每个 vault 记录，返回 `{entities, token_types, jobs:[{job_id, created, source_file, replacements, mapping}]}`。该端点不创建 job，口令与明文映射只在**单个请求作用域**内存在：不落盘、不写日志、响应写出即释放（超时/体量上限见 §7.6）。
4. **导入并重新加密**：浏览器把 entities/token_types 写入 IndexedDB；每个 job 的 mapping 用当前客户端口令（可与旧口令不同，UI 引导用户设置）AES-GCM 加密后写入 `jobs`。
5. **校验与收尾**：界面展示「迁移了 N 个实体、M 个自定义类型、K 个历史 job」，逐项抽样验证还原可用；用户确认后调 `POST /api/migrate/finalize`，服务端只把旧用户数据 `entities.json`、`token_types.json`、`vault/` **同目录内移动**到 `DATA_DIR/legacy-backup-<时间戳>/`（不删除），并写 `DATA_DIR/migrated.flag`。`runtime/`、`tessdata/` 与 `.session_secret` 原地保留，不受归档影响（见 §7.1 的角色说明）。
6. **可回退**：`DATA_DIR/legacy-backup-*` 原样保留，把三项数据移回 `DATA_DIR` 原始位置即可让旧版本继续运行；浏览器侧另有 JSON 备份可导入。

### 11.2 改造期间的功能回退策略

- **环境开关**：`LETHE_CLIENT_STORAGE=1`（默认）启用新路径；`=0` 时保留一个发布周期内的旧 `store.py`/`vault.py` 文件持久化路径，便于线上快速回退。
- **灰度方式**：先在 `dev` 分支完成 2→3→4，再合并到 `main`；每个任务独立 PR，标题带 `VYB-354`，可单独 revert。
- **数据安全**：任何阶段都不删除用户旧数据；迁移只做同目录归档（`DATA_DIR/legacy-backup-*`），且只涉及三项旧用户数据，不触碰 `runtime/` 与 `tessdata/`；客户端备份导出与导入在任务 2 内实现。
- **回归门**：任务 7 对 docx/pptx/xlsx/pdf/email/纯文本跑全量「上传 → 检测 → 脱敏 → 还原」，并验证多浏览器隔离、service worker 不缓存用户文档、TTL 5 分钟无残留。

### 11.3 已知风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 浏览器存储被清空/更换设备 | 丢失词典与还原能力 | 备份导出/导入、`storage.persist()`、界面持续提示 |
| 迁移中口令/明文映射短暂驻留服务端内存 | 理论泄露面 | 一次性、仅本机回环、单请求作用域（不落盘、响应写出即释放）+ 端点超时与体量上限（§7.6）、日志白名单 |
| 异步桥接引入时序 bug（面板先于数据渲染） | 界面空列表或竞态 | 骨架 + `refresh()` 模式；写入用事务；`BroadcastChannel` 同步 |
| NiceGUI 未固定版本导致端点 API 差异 | 端点注册失败 | 任务 2 实施时先确认版本与 API 表面，必要时锁定 NiceGUI 版本 |
| README 中「无服务端」表述过时 | 用户误解数据边界 | 任务 7 统一更新文案与文档 |

## 12. 与后续任务的交接结论

- **任务 2（VYB-360）**：按 §4 建 IndexedDB 库与 §5 的边界改造 `app.py` + `store.py` + `vault.py` + `web_static/client-store.js`；`/api/jobs`、`/api/jobs/{id}/detect`、`/api/jobs/{id}/redact`（token 由服务端分配）、`/api/restore` 是接口契约；验收按「两个 profile 互不可见、重开仍在、服务端不再读写 `entities.json`/`token_types.json`/`vault/`（迁移归档目录 `legacy-backup-*` 除外，仅供回退）」。
- **任务 3（VYB-361）**：在 `web_static/` 增加 manifest 与 service worker；SW 只缓存静态资源，禁止缓存 `/api/*` 与文档/结果；安装后独立窗口全流程可用。
- **任务 4（VYB-359）**：实现 `lethe/runtime.py` 与 §7 的三层清理；按 §7.5 的脚本/单测给出可重复验证输出；`/api/runtime` 作为调试自检端点。
- **任务 7（VYB-358）**：把「服务端 5 分钟无残留」「多浏览器隔离」「SW 不缓存用户文档」列为回归必测，并更新 README/使用文档中的存储与隐私说明。
