# Findings & Decisions

## Requirements
- 创建 Zotero 8 插件 `paper-classifier`
- 读取选中条目的 `title` + `abstractNote`
- 调用 DeepSeek Chat Completions API 输出 `一级学科/二级学科`
- 分类结果写回 `tag` 或 `extra`
- 提供右键菜单、工具菜单设置入口、偏好设置窗口
- 提供完整打包安装测试说明

## Research Findings
- 用户提供了完整目标目录、模块边界、函数签名与行为约束。
- 必须在 `bootstrap.js` 中注册 chrome 包，不使用 `chrome.manifest`。
- 模块加载顺序必须满足：`deepseekClient.js` → `paperProcessor.js` → `main.js`。
- 本地已有可参考插件样例（`/Users/guotuan/Desktop/VS/fenlei`），可对照 Zotero 8 bootstrap 写法。
- `node --check` 已通过核心 JS 文件语法校验。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 输出结果统一 `trim()` | 保证写回文本干净，避免多余换行 |
| 测试连接走轻量请求（简短消息） | 减少 token 消耗并快速验证 key/endpoint |
| `PaperClassifier` 挂到 window | 兼容菜单项 `oncommand` 字符串调用 |
| `applyDefaultPrefs` 通过 `addon/prefs.js` 注入默认值 | 同时满足默认偏好文件存在和 install 初始化要求 |
| `registerChrome` 返回句柄在 shutdown 析构 | 避免插件停用后 chrome 注册残留 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `main.js` 使用 `const` 可能在重复加载时冲突 | 改为兼容可重复加载结构，降低扩展重载风险 |
| Zotero 安装时报“可能无法兼容该版本” | 将 `manifest.json` 的 `strict_max_version` 从 `8.*` 改为 `8.99.*` 并重新打包 |
| 安装仍失败 | 补充 `applications.zotero.update_url`；移除非必要 `chrome_url`；`bootstrap` 启动参数改为 `rootURI/resourceURI` 双兼容 |
| 历史失败安装残留 | 在 profile `extensions` 目录发现旧版 `paper-classifier@example.com`，已迁移为备份目录避免干扰 |
| Zotero 为 beta 版（8.0.2-beta.5）仍报兼容 | 生成 beta 兼容清单：`id=paper-classifier@example.com`，`strict_min_version=6.999`，`strict_max_version=9.9.*`，并直接放入 profile 扩展目录 |
| 用户希望在 Zotero 设置中直接看到插件配置 | 通过 `Zotero.PreferencePanes.register()` 注册 `preferencesPane.xhtml`，并将工具菜单入口改为直接打开该首选项页 |
| 设置页仍不显示 | 增强为 `uiReadyPromise` 后加载 + 设置页注册重试（最多 60 秒） + 在窗口加载与打开设置时再次触发注册 |
| profile 存在 staged 冲突占位目录 | 将 `staged/paper-classifier*` 改名为 disabled，避免重复/冲突安装路径干扰 |
| 设置页出现两个同名项 | 为设置页注册增加并发锁、已注册检测和重复项清理逻辑（含同 ID 重复场景） |
| Endpoint 配置项造成困惑 | 在插件设置里移除 `API Endpoint` 输入，只保留 `API Key`，并固定使用默认 endpoint |
| API Key 输入框无法编辑 | 将首选项面板改为脚本驱动输入（`html:input` + `preferencesPane.js`），不依赖旧的自动 preference 绑定 |
| 用户希望快速验证密钥可用性 | 在设置面板新增“验证 API Key”按钮，直接调用 DeepSeek 接口并显示连接结果 |
| 分类全失败并提示“API Key 不能为空” | 核心原因是偏好读取未指定 `global=true`，导致读取到错误分支空值；已在 `paperProcessor.js`、`preferencesPane.js`、`preferences.xhtml` 统一修复并加入旧值迁移 |
| 设置页“验证 API Key”无反应且关闭后不保存 | 根因是偏好面板初始化/脚本加载链路不稳；已改为 `chrome://` 绝对 `src/scripts` + `vbox onload`，并为输入控件增加 `preference` 绑定，确保即使脚本异常也能保存 |
| 设置页右侧空白（仅左侧有 Paper Classifier） | `chrome://` 资源链路在当前环境不稳定导致 pane 内容加载失败；已改为相对 `src` + `groupbox onload`，逻辑挂到 `Zotero.PaperClassifier`，并在注册前清理旧 pane 防缓存脏状态 |
| 分类失败提示“DeepSeek API 返回结果缺少分类内容” | 原解析仅读取 `choices[0].message.content`，对 reasoner 空 content 不兼容；已增强多格式提取、`max_tokens` 提升到 128，并在 `deepseek-reasoner` 空结果时自动回退 `deepseek-chat` 重试 |
| 业务目标改为“按主题移动到二级分类目录” | 已将处理逻辑从 tag/extra 写回升级为集合归档：按 `根目录/一级/二级` 自动创建集合并将条目移动到目标二级集合；设置页同步改为“分类根目录 + 保留原有分类” |
| 用户希望主题类型而非学科类型（如 RCT/系统评价/meta 分析/理论研究） | 已将 system prompt 改为“研究主题分类”导向，并要求固定输出 `一级主题/二级主题`，允许模型根据论文内容自定义主题名称；默认根目录改为 `AI主题分类` |
| 用户要求插件头像 | 由占位 1x1 图标升级为多尺寸正式图标（16/32/48/96/128），并在 `PreferencePanes.register` 中设置 `image`，设置面板左侧也显示头像 |
| 用户要求英文版本 | 新增独立插件工程 `paper-classifier-en`，使用独立插件 ID（`paper-classifier-en@example.com`）、独立 pref 前缀（`extensions.paper-classifier-en.*`）、独立 chrome 包名（`paper-classifier-en`）与独立全局对象（`PaperClassifierEN`），可与中文版并行安装 |

## Resources
- 目标路径：`/Users/guotuan/Desktop/VS/openfenleiii`
- 插件路径：`/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier`
- 参考实现：`/Users/guotuan/Desktop/VS/fenlei`

## Visual/Browser Findings
- 未使用浏览器/图像检索；本任务为本地代码生成。
