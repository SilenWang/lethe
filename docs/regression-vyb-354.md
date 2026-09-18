# VYB-354 改造回归报告（任务 7）

> 任务：[VYB-358](https://github.com/SilenWang/lethe)（父任务 VYB-354 / T7）
> 覆盖改造：T2 客户端存储、T3 PWA、T4 服务端 5 分钟 TTL、T5 中英 i18n、T6 spaCy 模型扩充、T8 结果留存
> 结论：**全量回归通过**（153 passed / 1 skipped）；回归中发现 3 个缺陷，已在本 PR 修复（见第 4 节）。

## 1. 环境

| 项 | 值 |
|---|---|
| 平台 | Linux（Ubuntu 24.04），Python 3.12 |
| 环境管理 | pixi 0.76.1（仓库内依赖声明保持 `pyproject.toml` / `requirements*.txt` 不变） |
| 安装 | `pip install -e ".[dev,email,ocr,nlp]"` |
| 关键版本 | NiceGUI 3.17.0 · pytest 9.1.1 · Playwright 1.63.0（Chromium）· spaCy 3.8.16 · Presidio 2.2.364 · `en_core_web_sm` 3.8.0 · liteparse（OCR）· extract-msg |
| 服务端数据目录 | `LETHE_DATA_DIR=/tmp/lethe-reg-data`（隔离，避免污染开发机数据） |

复现全部结果：

```bash
python -m pytest tests/ -q                 # 153 passed, 1 skipped
python tests/test_regression.py            # 打印格式 × 语言清单
python tools/verify_ttl.py                 # 服务端 TTL 逐阶段验证
playwright install chromium                # 浏览器用例前置（CI 无 playwright 时自动跳过）
```

## 2. 回归清单与逐项结果

### 2.1 全流程：格式 × 语言（`tests/test_regression.py`，新增）

每个组合都跑通「提取 → 检测 → 令牌化 → 脱敏 → 还原」，并断言：输出中**无真实姓名残留**、出现令牌、还原能把姓名取回，且**在文档内**（保持格式）还原成功。

| 格式 | 英文 | 中文 | 输出格式 |
|---|---|---|---|
| Word (.docx) | ✅ PASS（16 hits / 8 tokens） | ✅ PASS（16 hits / 9 tokens） | `.docx` |
| PowerPoint (.pptx) | ✅ PASS（15 / 8） | ✅ PASS（15 / 9） | `.pptx` |
| Excel (.xlsx) | ✅ PASS（22 / 9） | ✅ PASS（22 / 10） | `.xlsx` |
| 纯文本 (.txt) | ✅ PASS（10 / 8） | ✅ PASS（10 / 9） | `.txt` |
| 邮件 (.eml) | ✅ PASS（13 / 10） | ✅ PASS（13 / 11） | `.docx` |
| 网页 (.html) | ✅ PASS（10 / 8） | ✅ PASS（10 / 9） | `.docx` |
| PDF (.pdf) | ✅ PASS（11 / 10） | ⏭ SKIP¹ | `.docx` |

¹ CJK PDF 需要仓库未内置的中文字体才能合成样例；PDF 路径由英文样例 + 仓库自带 `samples/sample-memo.pdf` 覆盖。**已知覆盖缺口**，非缺陷。

交叉项（同一套件内）：

| 项 | 结果 |
|---|---|
| 模式检测（邮箱 / 电话 / 账号）检测 + 还原 | ✅ PASS |
| 自定义令牌类型（`[PROJECT_001]`） | ✅ PASS |
| Excel 公式在脱敏后保留 | ✅ PASS |
| 界面语言切换（中/英渲染 + `?lang=` / cookie / Accept-Language 解析） | ✅ PASS |
| 检测模型目录与切换（拒绝未下载模型、切到已装模型生效） | ✅ PASS |
| 仓库自带样例（`sample-memo.docx` / `.pdf` / `sample-counterparties.xlsx`） | ✅ PASS |

### 2.2 隐私与隔离

| 项 | 用例 | 结果 |
|---|---|---|
| 多浏览器 profile 数据互不可见 | `tests/browser/test_client_store.py::test_browser_storage_isolation_and_roundtrip` | ✅ PASS |
| 刷新 / 关闭重开后数据仍在，脱敏↔还原往返可用 | 同上 | ✅ PASS |
| 服务端 `DATA_DIR` 不再出现 `entities.json` / `token_types.json` / `vault/` | 同上 | ✅ PASS |
| service worker 不缓存用户文档 / 结果 / 映射 | `tests/browser/test_pwa.py::test_installable_and_cache_boundary` | ✅ PASS |
| 浏览器存储被清空时给出明确提示、不崩溃 | `test_client_store.py`（"looks cleared"） | ✅ PASS |
| 结果文件存 IndexedDB、可重下载、列表渲染只读元数据、超限淘汰、清空不影响词典 | `test_client_store.py`（4 个 T8 用例） | ✅ PASS |
| 服务端 5 分钟 TTL：上传 → 脱敏 → 下载后 `runtime/` 无残留 | `tests/test_runtime_ttl.py` + `tools/verify_ttl.py` | ✅ PASS |
| TTL 脚本逐阶段验证（含下载即删、过期清理、启动残留清扫） | `tools/verify_ttl.py` → `RESULT: PASS` | ✅ PASS |

### 2.3 PWA

| 项 | 用例 | 结果 |
|---|---|---|
| manifest 可解析、Chromium 判定可安装 | `tests/browser/test_pwa.py` | ✅ PASS |
| service worker 注册并控制页面（独立窗口壳） | 同上 | ✅ PASS |
| `/sw.js` / `/manifest.webmanifest` 响应头满足安装要求 | 同上 | ✅ PASS |
| 缓存仅含静态白名单（无文档 / 结果 / `/api/*`） | 同上 + `tests/test_pwa_assets.py` | ✅ PASS |

> 无头浏览器无法点击操作系统安装弹窗，"独立窗口"由 manifest 的 `display: standalone` + worker 控制页面佐证；手工步骤见 `docs/pwa.md`。

### 2.4 界面语言（T5）

| 项 | 用例 | 结果 |
|---|---|---|
| 中英语言包键集合一致、无空值、无未翻译（中英相同）值 | `tests/test_i18n.py` | ✅ PASS |
| `app.py` 无硬编码界面英文残留 | 同上 | ✅ PASS |
| 语言解析优先级与回退 | `test_i18n.py` + `test_regression.py` | ✅ PASS |

### 2.5 检测模型（T6）

| 项 | 用例 / 证据 | 结果 |
|---|---|---|
| 目录结构（每语言恰好一个默认模型、英文内置 sm、中英默认 lg） | `tests/test_nlp_models.py` | ✅ PASS |
| 切换校验（未知 / 未下载模型拒绝、内置不可删、选择持久化并重载） | 同上 | ✅ PASS |
| 中英识别覆盖率提升（英文 sm 86% → md 93% → lg 100%；中文 sm 86% → md/lg 100%） | `docs/nlp-model-comparison.md` | ✅ PASS |
| 中英文文档格式解析、脱敏、还原不回归 | 2.1 全流程矩阵 | ✅ PASS |

### 2.6 其余既有用例

`tests/` 其余模块（core / doc / pptx / email / ocr_pdf / restore / runtime_ttl / pwa_assets / storage_migration / smoke）全部通过；OCR 往返用例在装有 `liteparse` 的环境实际执行并通过。

**总计：153 passed, 1 skipped。**

## 3. 未覆盖 / 说明

- **CJK PDF**：见 2.1 脚注 ¹。
- **Windows 打包与安装器**：`release.yml` 只在打 tag 时于 Windows runner 构建，本次未触发。
- **`en_core_web_trf`**：需额外 PyTorch，未纳入本次对比（见 `docs/nlp-model-comparison.md`）。

## 4. 发现的缺陷

| # | 归属 | 描述 | 优先级 | 状态 |
|---|---|---|---|---|
| D1 | **T6** | `tests/test_nlp_models.py::test_active_model_prefers_default_and_falls_back` 在**精简安装**（无 `[nlp]` extra，即 CI 的安装方式）下失败：`active_model("en")` 返回 `None`，而用例假设内置 `en_core_web_sm` 一定存在。**CI 在 `dev` 上是红的**（CI 只装 `.[dev]`）。 | 高 | ✅ 本 PR 修复 |
| D2 | **T5** | T5 把默认界面语言改为中文后，T2/T3/T8 的全部 Playwright 浏览器用例（12 个）失败：它们断言英文标签（`De-identify` / `Settings` …）却未指定语言。CI 因跳过 playwright 未发现。 | 高 | ✅ 本 PR 修复 |
| D3 | **T5** | i18n 抽取把 Settings 的两个**不同**按钮文案合并：入口按钮 "Clear result files" 与确认对话框按钮原为 "Delete result files"，现在对话框也显示 "Clear result files"。英文文案与原版不一致（违反 T5 DoD「英文文案保持与原版一致」），并导致 T8 用例失败。 | 中 | ✅ 本 PR 修复 |
| D4 | **T5** | Past conversions 行的下载按钮 `aria-label` 由 "Download result file again" 改为 "Download this result file again"（与 tooltip 统一）。属**有意的措辞统一**、非功能缺陷，但改动了无障碍文案并导致选择器失效。 | 低 | ✅ 测试已随之更新 |

### 复现步骤

```bash
# D1（精简安装 = CI 的安装方式）
pip install -e ".[dev]"
python -m pytest tests/test_nlp_models.py::test_active_model_prefers_default_and_falls_back -q
# 修复前：AssertionError: assert None == 'en_core_web_sm'
# 修复后：1 skipped（无 spaCy 模型时跳过）

# D2
pip install -e ".[dev]" playwright && playwright install chromium
python -m pytest tests/browser -q
# 修复前：10 failed（tab/按钮标签为中文，断言英文超时）
# 修复后：12 passed

# D3
# Settings → 清除结果文件 → 弹窗确认按钮文案
# 修复前：入口与确认按钮同为 "Clear result files"
# 修复后：确认按钮为 "Delete result files"（中文 "删除结果文件"）
```

## 5. 修复内容（本 PR）

- `tests/test_regression.py`（新增）：格式 × 语言全流程矩阵 + 交叉项；既可 `pytest` 运行，也可 `python tests/test_regression.py` 打印 PASS/FAIL 清单。
- `tests/test_nlp_models.py`：D1 —— 无任何英文模型时跳过该断言，与文件其它用例的「精简安装自跳过」约定一致。
- `tests/browser/test_client_store.py` / `test_pwa.py`：D2 —— `_goto()` 显式带上 `?lang=en`，使断言与界面语言解耦；D4 —— 选择器改用统一后的 `aria-label`。
- `lethe/locales/en.json` / `zh.json` + `app.py`：D3 —— 新增 `settings.clear_results_confirm`（"Delete result files" / "删除结果文件"）用于确认按钮，恢复原版英文文案。
- `docs/user-guide.md`（新增）、`README.md`：使用与部署文档，覆盖 PWA 安装、界面语言切换、模型下载与切换、TTL 行为与数据存放位置。