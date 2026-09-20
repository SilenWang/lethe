# Lethe 使用与部署说明

> 适用版本：Lethe 1.3.1（含 VYB-354 改造：客户端存储、PWA、5 分钟服务端 TTL、中英 i18n、扩充 spaCy 模型）
> 相关文档：[架构方案](architecture-client-side-storage.md) · [PWA 细节](pwa.md) · [模型对比报告](nlp-model-comparison.md)

本说明面向部署与日常使用者，覆盖：如何运行、如何安装为应用（PWA）、如何切换界面语言、如何下载与切换检测模型、服务端 TTL 行为，以及各类数据到底存放在哪里。

## 1. 部署与运行

Lethe 是单机 NiceGUI 应用，默认监听 `http://localhost:8731`。三种部署方式：

| 场景 | 获取方式 | 运行 |
|---|---|---|
| Windows 非技术用户 | 从 [Releases](https://github.com/moonlight-lupin/lethe/releases) 下载 `…-Setup.exe` 并安装（按用户安装，无需管理员权限） | 开始菜单 / 桌面快捷方式 |
| Windows 便携 | 下载 `…-Portable.zip`，解压后运行启动脚本 | 数据留在解压目录内 |
| Windows / macOS / Linux（有 Python 3.10–3.13） | `pipx install "lethe[nlp,ocr,email] @ git+https://github.com/moonlight-lupin/lethe@v1.3.1"` | 终端执行 `lethe` |

可选依赖（extra）：

- `[nlp]` — Presidio + spaCy 建议引擎与英文小模型 `en_core_web_sm`（不装则回退到内置正则姓名猜测）。
- `[ocr]` — 本地 OCR（PDFium + Tesseract），读取扫描版 / 图片型 PDF 页。
- `[email]` — Outlook `.msg` 支持（`.eml` / `.html` 用标准库即可）。
- `[nlp-models]` — 预装更大的检测模型（英文 md/lg、中文 md/lg、日文 md/lg、韩文 md/lg，约 2.8 GB）。装后英文 / 中文默认直接用 `_lg`；不装也可在设置页按需下载。

> `[nlp]` 需要 Python ≤ 3.13（spaCy 尚无 3.14 轮子）。

### 服务端数据目录与端口

| 环境变量 | 作用 | 默认值 |
|---|---|---|
| `LETHE_DATA_DIR` | 服务端数据目录（程序资源 + 运行临时区；Windows 便携包用它把数据留在解压目录内） | Linux：`~/.local/share/Lethe`；macOS：`~/Library/Application Support/Lethe`；Windows：`%APPDATA%\Lethe` |
| `LETHE_RUNTIME_DIR` | 单次运算的临时工作区 | `<DATA_DIR>/runtime` |
| `LETHE_JOB_TTL_SECONDS` | 运算残留文件的滑动 TTL（秒） | `300`（5 分钟） |
| `LETHE_JOB_MAX_LIFETIME_SECONDS` | 单个 job 的硬上限，防止持续操作无限续期（秒） | `3600` |
| `LETHE_SWEEP_INTERVAL_SECONDS` | 后台清理扫描间隔（秒） | `30` |
| `LETHE_ALLOW_REMOTE_MIGRATION` | 置为 `1` 时允许非本机回环地址调用旧数据迁移端点（默认仅本机） | 未设置（仅本机） |

## 2. 安装为应用（PWA）

Lethe 自带 web app manifest 与 service worker，Chrome / Edge 可把它安装为独立窗口应用。

1. 启动 Lethe，用 `http://127.0.0.1:8731`（或 `http://localhost:8731`）打开。**安装需要安全上下文**——`localhost` 满足，局域网 IP（`http://192.168.x.y:…`）不满足，因此请在运行服务的这台机器上安装。
2. 地址栏出现 **安装** 图标（"安装 Lethe…"）；菜单 *投放、保存和共享 → 将页面作为应用安装* 亦可。
3. 确认后应用以独立窗口启动（有独立任务栏 / Dock 图标，无地址栏），并获得启动器图标。首次启动会请求持久化存储，降低浏览器自动清理词典与映射的概率。

**service worker 的缓存边界**：只缓存应用自身的静态资源白名单（`/static/client-store.js`、`/static/migration.js`、`/static/favicon.svg`、字体、图标、`/manifest.webmanifest`）。用户上传的文档、提取文本、脱敏 / 还原结果、token→name 映射、`/api/migrate/*` 响应与页面 HTML 一律不进入缓存。可在 DevTools → *Application → Cache Storage* 核对：只有一个 `lethe-static-…` 缓存，内容即上述白名单。

更新策略：`app.py` 以 `/sw.js?v=<APP_VERSION>` 注册 worker，版本变化即换 URL 触发更新；缓存名带版本号，激活时删除其它 `lethe-static-*` 缓存，不会残留旧壳。修改 `sw.js` 规则时递增其中的 `CACHE_VERSION`。

## 3. 界面语言切换（中文 / English）

- 顶栏 **语言** 菜单（🌐）可在 **中文** 与 **English** 间即时切换，切换后整页按所选语言重建，页面标题、按钮、提示、错误信息、设置项与帮助文字保持一致，不会中英混杂。
- 选择持久化在浏览器（`localStorage` 的 `lethe.lang`，并镜像为 `lethe_lang` cookie 供服务端在页面构建时同步读取），刷新或重开后保持。
- 首次访问的解析顺序：`?lang=` 查询参数 → `lethe_lang` cookie → 浏览器 `Accept-Language` → 默认 **中文**。
- 深链接可直接指定语言，例如 `http://localhost:8731/?lang=en`。

## 4. 检测语言与模型

在 **Settings → Detection & OCR languages** 中管理：

- 每种语言列出可用的 spaCy 检测模型（small → large，英文另有 transformer），可下载、切换、删除。**英文与中文默认使用最大的 `_lg` 模型**：装好后自动生效以获得最高召回；未装时英文用随包（`[nlp]` extra）的 `en_core_web_sm` 离线兜底，可随时切回小模型。
- 选择即时生效（下一份文档起）；未下载的模型无法切换，会给出明确提示；内置的 `en_core_web_sm` 不可删除。
- 添加一门语言会同时安装其 OCR 语言包，使该文字体系的扫描页也能被读取。
- 当前选择持久化在服务端数据目录的 `nlp_models.json`（属**程序配置**，不是用户文档数据）。
- 扩充前后的识别效果对比见 [模型对比报告](nlp-model-comparison.md)：英文 sm 86% → md 93% → lg 100%；中文 sm 86% → md/lg 100%（14 / 7 个金标实体）。

模型下载是**唯一**会联网的动作，且只在显式安装时发生；下载内容不含任何用户数据，文档处理全程不触网。

## 5. 数据存放位置与 TTL

Lethe 的边界是：**浏览器是用户数据的唯一真相来源；服务端只做运算，并保留 5 分钟临时工作区。**

### 5.1 浏览器端（用户数据）

| 存储 | 内容 |
|---|---|
| IndexedDB `lethe`（version 2） | `entities`（词典）、`token_types`（自定义 token 类型）、`jobs`（运行记录 + 加密后的 token→name 映射）、`outputs`（脱敏结果文件二进制，最近 20 个）、`meta`（schema 元数据） |
| localStorage | `lethe.lang`（界面语言）、客户端存储安装标记 |
| 页面内存 | 本次会话的上传文档字节、提取文本、评审勾选状态——关闭 / 刷新页面即丢弃 |

映射用口令加密（PBKDF2-SHA-256 480k → AES-GCM-256）后仅存于浏览器，**不会上传服务端**。数据按浏览器 profile 隔离：同一服务端下，不同 profile / 不同用户互相看不到对方的词典、运行记录与映射。刷新、关闭标签页、重开应用后数据仍在。设置页可导出 JSON 备份；清除浏览器存储时会给出明确提示，并可在设置页查看 / 清空结果文件配额。

### 5.2 服务端（仅运算）

`DATA_DIR` 稳态只承载**非用户数据**：

- `tessdata/` — OCR 语言模型（程序资源）。
- `nlp_models.json` — 当前检测模型选择（程序配置）。
- `.session_secret` — NiceGUI 会话密钥。
- `runtime/<job_id>/` — 单次运算的临时区：上传文档副本、解析 / OCR 中间文件、结果文件。**滑动 TTL 默认 5 分钟**（`expires_at = 最后一次操作 + TTL`），到期后整个 job 目录被删除；三层清理保证无残留——定时扫描（每 30 秒）、启动与退出时的残留清扫、以及每个 job 的硬上限。日志只记录 job id、原因、文件数与字节数，不含文档正文。
- `migrated-<时间戳>/` — 仅当从旧版本迁移过一次旧用户数据时出现的归档目录（同目录内移动、不删除，便于回退）。

TTL 行为可重复验证：`python tools/verify_ttl.py`，或 `python -m pytest tests/test_runtime_ttl.py -q`。

### 5.3 旧版本数据迁移

若 `DATA_DIR` 仍存在改造前的 `entities.json`、`token_types.json` 或 `vault/`，Settings 会显示「从本机旧数据迁移」入口：服务端只读导出 → 浏览器用当前口令重新加密写入 IndexedDB → 全部成功后把三项旧数据同目录归档到 `migrated-<时间戳>/`。有任一 job 解密失败时保留 `vault/` 以便用正确旧口令重试。

## 6. 隐私与隔离要点（回归必测项）

- **多浏览器隔离**：两个 profile 访问同一服务端，互不可见对方数据。
- **service worker 不缓存用户文档**：DevTools 缓存中只有静态白名单。
- **服务端 5 分钟内清理**：单次运算完成后 5 分钟内，`runtime/` 不再有该次运行的上传文档、中间文件与结果文件。
- **PWA**：可安装、独立窗口启动后全流程可用。

对应的自动化用例：`tests/browser/test_client_store.py`（隔离 / 留存 / 配额）、`tests/browser/test_pwa.py`（可安装性与缓存边界）、`tests/test_runtime_ttl.py`（TTL）、`tests/test_regression.py`（各格式 × 中英全流程）。本轮改造的逐项回归结果见 [回归报告](regression-vyb-354.md)。

## 7. 排障

| 现象 | 处理 |
|---|---|
| 地址栏没有"安装"入口 | 确认用 `localhost` / `127.0.0.1` 打开（安全上下文要求），且浏览器为 Chrome / Edge |
| 装完后仍无"建议"类敏感项 | `[nlp]` extra 未装或对应语言模型未下载；在 Settings 安装模型 |
| 扫描版 PDF 未被读取 | 未装 `[ocr]` extra 或对应语言 OCR 包；Settings 中安装该语言 |
| 重开应用后历史记录 / 词典不见了 | 浏览器存储被清空或换了 profile；用设置页导出的 JSON 备份导入，并保留 `storage.persist()` 提示 |
| 结果无法"重新下载" | 该结果已超出保留上限（默认最近 20 个）或浏览器存储被清空；重新添加原文件重跑即可 |
| 服务端磁盘仍有文件 | 确认未修改 `LETHE_JOB_TTL_SECONDS`；运行 `tools/verify_ttl.py` 核对 |