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
│  client-store.js（IndexedDB+WebCrypto） · migration.js（迁移/备份导入）       │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │  NiceGUI 通道（WebSocket）：上传原始文档、词典快照、还原映射
                │  回传：提取文本 / 检测项 / 脱敏结果 / 还原结果
                │  本地 HTTP（127.0.0.1）：仅一次性迁移 /api/migrate/*
┌───────────────▼────────────────────────────── 服务端（纯运算） ──────────────┐
│  NiceGUI 页面（WebSocket，仅界面状态）                                        │
│  FastAPI 端点 /api/migrate/*（迁移；计算流程仍走 NiceGUI 通道，§6.2）          │
│  lethe/ 引擎：core.py · docio.py · nlp_suggester.py（无用户数据持久化）        │
│  runtime/ 临时区（job_id 目录，TTL 5 分钟；任务 4 实现）                       │
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
| **页面内存（JS 变量 / Blob / object URL）** | 本次会话上传的原始文档字节、提取文本（预览高亮用）、评审勾选状态、生成的结果 Blob | — | 这些是「一次运算」的中间态，重开页面后用户重新选文件即可；持久化它们既无必要也扩大泄露面。现状补充：上传字节同时有一份在服务端会话闭包（§6.3 D2，归任务 4 处置） |
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
     { key: "lethe.schema.v1",    value: 1 }        （T2 实现用此键名记录 schema 版本）
     { key: "lethe.installed.v1", value: ISO8601 }  （首次安装时间；也用作“存储被清空”的标记）
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
- 当浏览器里的 `meta` 键 `lethe.schema.v1` 低于代码期望值：先在事务中回填，再写回版本号；失败则保留旧数据并提示用户导出备份。`lethe.installed.v1` 缺失即视为「存储被清空/驱逐」，界面给出显式警告（T2 已实现该标记与横幅）。
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

> **token 分配归属（定稿）：** 最终 token 编号的唯一权威点是服务端脱敏阶段（当前经 NiceGUI 通道；若实施 §6.2 可选 REST 路径则在 `/api/jobs/{id}/redact`），内部调用 `core.assign_tokens()` 基于用户最终勾选的集合重算；浏览器只提交勾选与类型修正。预览阶段返回的 `token` 仅为临时编号，不落库、不参与还原。

> **传输通道（现状）：** 上表描述的是**数据流向**，不绑定具体通道。T2 已按此实现，但通道仍是 NiceGUI 通道（WebSocket + `run.io_bound`），并非 §6.2 的 REST 端点；REST 端点是本方案给出的可选升级路径，当前未实现（见 §6.2）。

### 5.3 运算结果如何回传且不落盘

- 提取阶段：`docio.extract_text()` + `pdf_warnings()` 的结果经 NiceGUI 通道返回浏览器；服务端保留原始字节（供后续脱敏）与提取文本（现状在页面会话闭包内，见 §6.3 D2；任务 4 起归入 `runtime/`）。
- 检测阶段：返回序列化后的 `items`（`type/canonical/surfaces/source/count/include/token`，其中 `token` 为预览用临时编号），**不含**文档正文以外的额外信息。
- 脱敏阶段：返回 `outputs[]`（文件名 + 字节）与 `token_to_real`（现状为内存字节 + `ui.download`，未写磁盘）；任务 4 起统一由 `runtime/` 承载并要求响应写出后**立即删除**结果与映射，TTL 清理器兜底。
- 还原阶段：返回重建后的字节与命中计数；请求中的映射不缓存、不写日志。
- 传输形态（现状）：全部经 **NiceGUI 通道**（WebSocket，`127.0.0.1` 本机回环），结果用 `ui.download(bytes, name)` 回传；传输介质不影响「结果不落盘」这一属性——服务端只在内存/临时区持有到响应写出。§6.2 的可选 REST 路径若实施，会改为回环 HTTP + `octet-stream`/zip + `Blob` 下载，并让服务端持有时间由请求边界决定。

## 6. NiceGUI 接口改动

### 6.1 Python ↔ 浏览器存储的桥接方式

页面构建时 Python 侧不再持有用户数据，读写都走一条受控通道（T2 已实现，以此为准）：

1. **读/写（Python ↔ IndexedDB）**：`web_static/client-store.js` 暴露 `window.lethStore`（`getEntities/saveEntities/mergeEntities/getTokenTypes/saveTokenTypes/listJobs/getMapping/saveJob/deleteJob/quota/init/exportBackup/importBackup/clearAll`）；Python 侧用 `_store_call(expr)` 包装 `ui.run_javascript` 求值并取回 JSON 结果，例如 `await _store_call("window.lethStore.getEntities()")`。桥接带超时与错误处理，失败时显示存储不可用横幅。
2. **变更通知（浏览器 → Python）**：写入后 `client-store.js` 调 `window.emitEvent('leth-data-changed', {reason})`，Python 侧用 `ui.on('leth-data-changed', …)` 刷新对应表格；跨标签页同步用 `BroadcastChannel('lethe')`。
3. **大对象（上传文档 / 生成结果）**：仍走 NiceGUI 通道（`ui.upload` / `ui.download`）而非 `fetch`，字节在页面会话闭包中持有——生命周期归属见 §6.3 末尾的说明。
4. 面板构建从「同步读盘」改为「先渲染骨架 → 异步载入后 `refresh()`」，例如词典面板：页面加载后读取 IndexedDB → 填充 `rows` → `render_rows.refresh()`。

### 6.2 接口形态：现状（已实现）与可选升级路径

**现状（T2 已实现，实施以此为准）：** 计算流程（上传 → 提取 → 检测 → 脱敏 → 还原）仍通过 **NiceGUI 通道**（WebSocket + `run.io_bound` 线程）完成，`app.py` 中没有 `/api/jobs*`、`/api/restore*`、`/api/runtime`；只有一次性迁移通过 NiceGUI 暴露的底层 FastAPI 应用注册了本地 HTTP 端点（`register_api()`）。功能面与原设计等价：token 仍由服务端 `core.assign_tokens()` 按最终勾选集合分配，用户数据仍只存浏览器。

已实现端点：

| 端点 | 方法 | 入参 | 返回 | 备注 |
|---|---|---|---|---|
| `/api/migrate/status` | GET | — | `{present, entities, token_types, jobs, data_dir}` | 供设置页判断是否还存在旧数据 |
| `/api/migrate/export` | POST | `{passphrase?}` | `{entities, token_types, jobs:[{job_id, created, source_files, replacements, mapping}], errors:[{job_id, error}]}` | 读 `DATA_DIR` 下的旧用户数据并用 `vault.decrypt_record()` 解密；口令与明文映射不落盘、不写日志（§7.6） |
| `/api/migrate/finalize` | POST | `{}` | `{archived, archived_to}` | 只归档旧**用户数据**（`entities.json`、`token_types.json`、`vault/`）到 `DATA_DIR/migrated-<ts>/`，`migrated.flag` 写在归档目录内；`runtime/`、`tessdata/` 原地不动，**不删除**；仅当所有 job 解密成功时才调用（D3） |

安全约束（已实现）：迁移端点校验请求来自本机回环（`_loopback_only()`），非回环返回 403；响应统一 `Cache-Control: no-store`。

**可选升级路径（本方案提出，当前未实现）：** 若将来要把计算流程也从 NiceGUI 通道改为本地 HTTP（大文件传输更稳、服务端持有时间由请求边界决定、便于按请求做 TTL），按下表实施。这是一项**独立改造**，不属于任务 2 的交付内容；实施前应单独立项说明收益，不建议仅为对齐文档而改动已合入的代码。

| 端点（可选，未实现） | 方法 | 入参 | 返回 |
|---|---|---|---|
| `/api/jobs` | POST | multipart：`files[]` + `entities` + `token_types` + `options` | `{job_id, created_at, expires_at, files:[{name, kind, warnings, text}]}` |
| `/api/jobs/{job_id}/detect` | POST | `{entities, token_types, options}` | `{items:[…]}`（`token` 为预览临时编号） |
| `/api/jobs/{job_id}/redact` | POST | `{items:[…]（include + type）, add_to_dictionary}` | `{items:[…]（含最终 token）, outputs, token_to_real, replacements, meta}` |
| `/api/restore` | POST | multipart：`mapping` + `file` 或 `text` | `{outputs, hits}` |
| `/api/restore/scan` | POST | `{text}` 或文件 | `{tokens:[{token,count}]}` |
| `/api/runtime` | GET | — | `{jobs:[{job_id, files, bytes, last_touch_at, expires_at}]}`（仅 `LETHE_DEBUG_RUNTIME=1`，供任务 4 验证） |

### 6.3 页面状态与事件处理（实现现状）

| 位置 | 迁移前 | T2 实现（已合入 `dev`） |
|---|---|---|
| `build_deidentify_panel()` 的 `files` 闭包 | 服务端长期持有全部文档字节 | 仍以 `files` 闭包持有上传文档的原始字节（`app.py` 的 `on_file()`），生命周期 = 页面会话；用户数据（词典/记录/映射）已全部移出服务端。见下方生命周期归属说明 |
| `on_file()`（`ui.upload`） | NiceGUI 上传到 Python 内存 | 仍是 `ui.upload` + `run.io_bound(_extract_and_warn)`；字节不落盘，但也不进任务 4 的 `runtime/` 注册表 |
| `run_detection()` | `_detect_text(text, load_entities())` 读服务端词典文件 | `_detect_text(text, <从 IndexedDB 取的词典快照>)` |
| `on_generate()` | `vault.save_job()` 写服务端 vault、`merge_entities()` 写词典文件 | 服务端分配 token 并返回映射 → 浏览器 `saveJob()` 加密写入 IndexedDB `jobs`；「加入词典」写 IndexedDB `entities` |
| `build_reidentify_panel()` 历史 | `vault.history()` 读 `vault/index.json` | `window.lethStore.listJobs()` 读 IndexedDB 元数据；还原时 `getMapping(jobId, passphrase)` 在浏览器本地解密后交给服务端重建 |
| `build_restore_panel()` 的 `custom_types` | 同步读 `token_types.json` | 异步读 IndexedDB `getTokenTypes()` |
| `build_dictionary_panel()` | `load_entities()/save_entities()` 读写文件 | 经 `_store_call` 读写 IndexedDB；新增「导出/导入备份」 |
| `build_settings_panel()` 的「Files & folders」 | 展示 `DATA_DIR` 与「打开文件夹」 | 改为「浏览器数据（IndexedDB）」卡片（配额、导出备份、导入备份、清空）+ 旧数据迁移卡片 + 只读的服务端路径说明 |
| `ui.run(storage_secret=…)` | 硬编码 `"deident-local"` | 每次安装随机生成并持久化到 `DATA_DIR/.session_secret`（只保护 NiceGUI 会话，不含用户数据） |
| 存储被清空/驱逐 | 无处理 | 缺 `lethe.installed.v1` 标记时显示显式警告横幅 |
| 生成结果页的服务端 TTL 提示 | — | **未实现**：属任务 4；届时展示「服务端临时副本将在 N 分钟后清除 / 过期后自动重传」 |

> **上传字节的生命周期归属（D2，归任务 4 落实）：** 当前实现把每个上传文件的原始字节存进 `build_deidentify_panel()` 的 `files` 闭包，在**页面会话存活期间常驻服务端内存**；它不在 §7 的 `runtime/` 注册表里，因此不受 5 分钟 TTL 管理，只随会话结束（断开 / 关闭标签页）由闭包释放。这满足决策 3 的「服务端不落盘」，但服务端内存中确实存在上传字节。任务 4（VYB-359）需二选一并在实现与隐私说明中落地：
>
> - **(a) 推荐**：把上传字节移入 `runtime/<job_id>/`，纳入 §7 的注册表与 TTL 统一释放（内存与磁盘都受管），或在检测 / 脱敏完成后显式从闭包中移除该文件条目；
> - **(b)** 接受「会话闭包 = 会话期临时区、随会话销毁」的语义，并在任务 4 文档与隐私说明中显式写清该边界。

## 7. 服务端临时数据生命周期（TTL）

这是任务 4 的实施依据，必须逐条落地。

### 7.1 临时区位置与结构

- 目录：`$LETHE_RUNTIME_DIR`，默认 `$LETHE_DATA_DIR/runtime/`。
- 结构：`runtime/<job_id>/{source/<idx>.<ext>, text/<idx>.txt, out/<name>, job.json}`；目录权限 `0700`。
- 进程内注册表：`{job_id: {created_at, last_touch_at, dir, files:{path:size}, bytes}}`，`job.json` 与注册表内容一致，进程重启后由目录扫描恢复。
- 配置：`LETHE_JOB_TTL_SECONDS`（默认 `300`）、`LETHE_JOB_MAX_LIFETIME_SECONDS`（默认 `3600`，0 表示关闭）。

> **`DATA_DIR` 在改造后的角色（与迁移归档的边界）：** `DATA_DIR` 仍是应用数据根目录，稳态下只承载**非用户数据**——`runtime/`（临时工作区，任务 4 实现）、`tessdata/`（OCR 程序模型）、`.session_secret`。旧用户数据（`entities.json`、`token_types.json`、`vault/`）在迁移前暂存于此，迁移归档只移动这三项到 `DATA_DIR/migrated-<ts>/`（`migrated.flag` 在归档目录内，见 §11.1 第 5 步），**绝不整体改名或删除 `DATA_DIR`**，因此 `runtime/` 与 `tessdata/` 不会被迁移动作波及。§7.3/§7.4 的清理只作用于 `runtime/`，与迁移归档互不影响。
>
> **当前尚未纳入 runtime/ 的对象（D2）：** 上传文档的原始字节目前仍由 `build_deidentify_panel()` 的会话闭包持有（见 §6.3 末尾），不在本节注册表内、不受 TTL 管理；任务 4 需按 §6.3 的 (a)/(b) 方案之一决定其归属。

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
  1. `LETHE_JOB_TTL_SECONDS=5` 启动应用（可选：加 `LETHE_DEBUG_RUNTIME=1` 启用 `/api/runtime` 自检端点，仅当实施 §6.2 可选 REST 路径时存在）；
  2. 上传样本文档并完成一次「检测 → 生成」；
  3. 立即 `find "$LETHE_DATA_DIR/runtime" -type f`，应能看到该 job 的上传文档/中间文件（或 `curl 127.0.0.1:8731/api/runtime` 查看剩余时间）；
  4. 等待 6 秒后，`find "$LETHE_DATA_DIR/runtime" -type f` 应无输出，日志出现 `ttl-purge job=<id> reason=expired …`；
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
- 服务端临时目录权限 `0700`、job_id 随机；可选的运行时自检端点（§6.2 可选 REST 路径下）默认关闭，进一步降低误读面。

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

| 文件 | 状态 | 改动点 | 影响说明 |
|---|---|---|---|
| `app.py` | 已实现（T2） | 新增 `/api/migrate/*` 三端点（`register_api()`，仅迁移）；`_store_call` 桥接 IndexedDB；词典/历史/类型改为异步读客户端库；设置页改为浏览器数据卡片 + 迁移卡片 + 存储被清空横幅；`storage_secret` 随机化；上传仍走 `ui.upload`，字节留在会话闭包（D2，归 T4 处置） | 单文件改动量大（≈5 个面板 + 迁移 UI）。检测/脱敏算法调用不变；用户数据读写全部改道浏览器；计算流程仍走 NiceGUI 通道（§6.2） |
| `lethe/__init__.py` | 待实现（T4） | 新增 `RUNTIME_DIR`、`JOB_TTL_SECONDS` 解析与导出；导出新 `runtime` 模块 | `DATA_DIR` 稳态只承载非用户数据（`runtime/`、`tessdata/`、`.session_secret`）；旧用户数据迁移后归档在 `migrated-*` |
| `lethe/core.py` | 已实现（基本不变） | 检测/替换/还原与 token 分配保持现状（服务端 `assign_tokens()`）；`items_to_dict/from_dict` 序列化辅助**暂未新增**，仅当实施 §6.2 可选 REST 路径时才需要 | 行为零变化；任务 2 未依赖这些辅助 |
| `lethe/docio.py` | 待实现（T4 局部） | `tessdata` 仍在 `DATA_DIR`（程序资源，不受 TTL 管理）；临时文件统一走 runtime、`clear_pdf_cache()` 的调用点由任务 4 明确 | 文档格式处理逻辑不变 |
| `lethe/nlp_suggester.py` | 保留 | 无数据边界改动；模型下载/卸载保持服务端；模型目录不纳入 TTL | 行为不变；与任务 6（VYB-357）解耦 |
| `lethe/store.py` | 已实现（T2） | 移除活动态文件读写；保留纯逻辑 `entities_to_dicts()/rows_to_entities()/merge_entities()`，新增 legacy 读取 `legacy_user_data_present()/legacy_load_entities()/legacy_load_token_types()` | 破坏性变更：旧 `load_entities/save_entities` 语义移除；`tests/test_smoke.py` 等已改为纯函数用例 |
| `lethe/vault.py` | 已实现（T2） | 稳态不再写盘；保留 Fernet 编解码 `encrypt_record()/decrypt_record()` 与 legacy 读取 `legacy_list_jobs()/legacy_read_index()/legacy_read_job()/legacy_history()/legacy_export()`；`legacy_archive(data_dir)` 把三项旧数据归档到 `DATA_DIR/migrated-<ts>/` 并写 `migrated.flag`（无多余参数） | 破坏性变更：旧 `save_job/load_job/list_jobs/delete_job/history` 移除；客户端承担加密与历史；归档不动 `runtime/`、`tessdata/` |
| `lethe/web_static/` | 已实现（T2） | 新增 `client-store.js`（IndexedDB + WebCrypto + BroadcastChannel + 备份导出/导入/清空/持久化申请）+ `migration.js`（迁移与备份导入 UI 粘合）；不引入 `session.js`（上传/下载仍走 NiceGUI 通道）；任务 3 追加 `manifest.webmanifest`、`sw.js`、图标 | T2 与 T3 共享静态资源；service worker 只缓存静态资源，**不缓存**文档与结果 |
| 新增 `lethe/runtime.py` | 待实现（T4） | TTL 注册表、目录管理、三层清理器、日志 | 任务 4 核心；同时处理 §6.3 D2 的会话闭包字节归属（方案 (a) 时） |
| `tests/` | 已实现（T2）+ 待补 | 新增 `tests/test_storage_migration.py`（Python 纯逻辑）与 `tests/browser/test_client_store.py`（Playwright，5 项，覆盖隔离/往返/迁移/备份/类型持久化）；任务 4 补 TTL 单测，另补 D3 的「错口令不归档」浏览器用例 | 现有 docx/pptx/xlsx/pdf/email 格式测试不回归 |
| `README.md` / `docs/` | 待实现（T7） | 更新「存储与隐私」描述、备份说明、TTL 行为 | 任务 7 负责终稿；本任务先提供架构依据 |

## 10. 选项与推荐（无遗留待拍板事项）

以下为实施中会遇到的选择，本方案已给出推荐，无需再次确认。任务 2 已按 §4/§5/§6.3 实现并合入 `dev`（`f673686`）；原设计中给计算流程新增 REST 端点一项**未实施**，已降级为可选升级路径（§6.2），其余推荐对任务 3/4 继续有效。

1. **传输方式**：**现状**为「页面状态与计算流程统一走 NiceGUI 通道；仅迁移走本地 HTTP `/api/migrate/*`」（T2 已实现）。原推荐「文档/结果走 `/api/*`」未实施，原因见 §6.2：T2 先于 T1 定稿完成且功能等价，改造收益不足以抵消回归成本；如需改为 REST，按 §6.2 的可选表单独立项。该选择与 D2 的遗留问题（上传字节滞留会话闭包）相关，由任务 4 决定归属。
2. **TTL 起点**：推荐滑动 TTL（`last_touch_at + 300s`，另有 1 小时硬上限）；理由见 §7.2。备选固定起点会让长时间评审的流程中途失效。
3. **手动还原的 token 扫描**：**现状（T2）仍在服务端做**（`_RESTORE_TOKEN_RE` + `run.io_bound`），因为该面板本来就要把文档送到服务端重建，扫描只是顺带的一步正则，放哪侧都不改变数据边界。原推荐「放 JS 侧」未实施；若将来把还原也改为可选 REST 路径，可一并移回浏览器。
4. **旧 vault 迁移解密**：推荐服务端辅助（一次性传口令给本机服务端，复用已测试的 `vault.py`）；备选纯浏览器 Fernet 兼容解密可做到口令不出浏览器，但实现与测试成本更高。
5. **runtime 存放介质**：推荐 `$LETHE_DATA_DIR/runtime/` 下的临时目录（可配置、便于验证与启动清扫）；纯内存方案在崩溃后无残留但也无法审计，且大文件更易触发内存压力。配套边界已定稿：`DATA_DIR` 稳态只承载非用户数据，迁移归档只把三项旧用户数据移到 `DATA_DIR/migrated-<ts>/`（§7.1、§11.1 第 5 步），因此 runtime 与 tessdata 不会被归档或清理。上传字节是否纳入 runtime 见 §6.3 D2（任务 4 定）。
6. **历史记录位置**：推荐 IndexedDB（与映射同库，便于原子删除）；备选 localStorage 容量与事务都不足。
7. **JS 测试栈**：推荐在**本地**用 pixi 建一个含 node/playwright 的验证环境跑浏览器侧用例；仓库内的依赖声明仍以现有 `pyproject.toml` / `requirements*.txt` 为准，不改变用户既有运行方式。

## 11. 风险与回退

### 11.1 旧 `DATA_DIR` 用户数据的一次性迁移

目标：老用户升级后不丢词典、自定义类型与已加密的还原映射。步骤：

1. **升级前备份**：文档提示用户备份 `DATA_DIR`（Settings 里的路径）。
2. **检测条件**：新版本启动时，若 `DATA_DIR` 存在 `entities.json` / `token_types.json` / `vault/*.vault.json` 且浏览器 IndexedDB 为空 → Settings 显示「从本机旧数据迁移」。
3. **导出**：浏览器调 `POST /api/migrate/export`（可带旧口令）。服务端读取 `DATA_DIR` 下的旧用户数据（`entities.json`、`token_types.json`、`vault/`），用 `vault.decrypt_record()` 逐个解密 vault 记录，返回 `{entities, token_types, jobs:[{job_id, created, source_files, replacements, mapping}], errors:[{job_id, error}]}`（解密失败的 job 进入 `errors`，用于提示重试）。该端点不创建 job，口令与明文映射只在**单个请求作用域**内存在：不落盘、不写日志、响应写出即释放（超时/体量上限见 §7.6）。
4. **导入并重新加密**：浏览器把 entities/token_types 写入 IndexedDB；每个 job 的 mapping 用当前客户端口令（可与旧口令不同，UI 引导用户设置）AES-GCM 加密后写入 `jobs`。
5. **校验与收尾**：界面展示「迁移了 N 个实体、M 个自定义类型、K 个历史 job」，逐项抽样验证还原可用；**只有全部 job 解密成功（`errors` 为空）才**调 `POST /api/migrate/finalize`（D3：有失败时保留 `vault/`，供用正确旧口令重试；部分成功 job 已在浏览器内幂等 upsert，重试不重复导入）。服务端只把旧用户数据 `entities.json`、`token_types.json`、`vault/` **同目录内移动**到 `DATA_DIR/migrated-<时间戳>/`（不删除），`migrated.flag` 写在**归档目录内**。`runtime/`、`tessdata/` 与 `.session_secret` 原地保留，不受归档影响（见 §7.1 的角色说明）。
6. **可回退**：`DATA_DIR/migrated-*` 原样保留，把三项数据移回 `DATA_DIR` 原始位置即可让旧版本继续运行；浏览器侧另有 JSON 备份可导入。

### 11.2 改造期间的功能回退策略

- **无运行时回退开关（D5 定稿）**：`LETHE_CLIENT_STORAGE` 开关**未实现**——旧 `store.py`/`vault.py` 落盘路径已整体删除。回退方式为 git revert 或部署上一版本（`dev` 上 T2 为单一 merge `f673686`，可整体 revert）；用户数据在 `DATA_DIR/migrated-*` 归档与浏览器 JSON 备份中可恢复。
- **灰度方式**：先在 `dev` 分支完成 2→3→4，再合并到 `main`；每个任务独立 PR，标题带 `VYB-354`，可单独 revert。
- **数据安全**：任何阶段都不删除用户旧数据；迁移只做同目录归档（`DATA_DIR/migrated-*`），且只涉及三项旧用户数据，不触碰 `runtime/` 与 `tessdata/`；客户端备份导出与导入已在任务 2 实现。
- **回归门**：任务 7 对 docx/pptx/xlsx/pdf/email/纯文本跑全量「上传 → 检测 → 脱敏 → 还原」，并验证多浏览器隔离、service worker 不缓存用户文档、TTL 5 分钟无残留。

### 11.3 已知风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 浏览器存储被清空/更换设备 | 丢失词典与还原能力 | 备份导出/导入、`storage.persist()`、界面持续提示 |
| 迁移中口令/明文映射短暂驻留服务端内存 | 理论泄露面 | 一次性、仅本机回环、单请求作用域（不落盘、响应写出即释放）+ 端点超时与体量上限（§7.6）、日志白名单 |
| 异步桥接引入时序 bug（面板先于数据渲染） | 界面空列表或竞态 | 骨架 + `refresh()` 模式；写入用事务；`BroadcastChannel` 同步 |
| NiceGUI 依赖未固定版本 | 升级后行为/API 差异 | T2 已在 NiceGUI 3.16.0 验证通过；建议后续给 `pyproject.toml` 加最低版本约束（`nicegui>=3.16.0`）——非本次返修项，未实施 |
| 上传字节驻留会话闭包（D2） | 服务端内存中保留上传内容，不受 TTL 管理 | 任务 4 按 §6.3 D2 的 (a)/(b) 方案之一落地并在隐私说明中写清 |
| README 中「无服务端」表述过时 | 用户误解数据边界 | 任务 7 统一更新文案与文档 |

## 12. 与后续任务的交接结论

- **任务 2（VYB-360）**：**已完成并合入 `dev`（`f673686`）**。实现与 §4/§5/§6.3 一致：IndexedDB 库、浏览器加密、备份、迁移端点、会话密钥随机化；计算流程仍走 NiceGUI 通道，REST 端点未实施（§6.2 降级为可选）。已核验「两个 profile 互不可见、重开仍在、服务端不再读写 `entities.json`/`token_types.json`/`vault/`（归档目录 `migrated-*` 除外，仅供回退）」。
- **任务 3（VYB-361）**：在 `web_static/` 增加 manifest 与 service worker；SW 只缓存静态资源，禁止缓存用户文档/结果与迁移接口响应（当前计算不走 `/api/*`，但同样不得缓存）；安装后独立窗口全流程可用。
- **任务 4（VYB-359）**：实现 `lethe/runtime.py` 与 §7 的三层清理；按 §7.5 的脚本/单测给出可重复验证输出；**D2** 需同时解决会话闭包中的上传字节归属（§6.3 D2，推荐方案 (a)：移入 `runtime/<job_id>/` 统一 TTL 管理）；`/api/runtime` 仅在实施 §6.2 可选 REST 路径时作为调试自检端点。
- **任务 7（VYB-358）**：把「服务端 5 分钟无残留（含 D2 会话闭包字节的处置结果）」「多浏览器隔离」「SW 不缓存用户文档」列为回归必测，并更新 README/使用文档中的存储与隐私说明。
