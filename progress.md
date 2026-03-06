# Progress Log

## Session: 2026-02-23

### Phase 1: Requirements & Discovery
- **Status:** complete
- **Started:** 2026-02-23
- Actions taken:
  - 读取技能说明并执行 session catchup
  - 确认目标目录为空且可创建项目
  - 将用户 8 步需求拆分为可执行阶段
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/task_plan.md` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/findings.md` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/progress.md` (created)

### Phase 2: Project Scaffold
- **Status:** complete
- Actions taken:
  - 创建 `paper-classifier` 全量目录结构（addon/chrome/content、addon/locale/en-US、icons）
  - 写入 `manifest.json`、`bootstrap.js`、`addon/prefs.js`
  - 创建 `overlay.xul`、`addon.ftl`、`icon.png` 占位
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/manifest.json` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/bootstrap.js` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/prefs.js` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/overlay.xul` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/locale/en-US/addon.ftl` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/icons/icon.png` (created)

### Phase 3: Core Modules
- **Status:** complete
- Actions taken:
  - 实现 `classifyPaper(title, abstract, apiKey, endpoint, model)`，使用 XHR + 30 秒超时 + 状态码错误封装
  - 实现 `processItem/processItems`，串行处理并在事务中保存条目
  - 实现 `PaperClassifier` 主对象，包含菜单挂载、批量分类入口、偏好设置入口
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/deepseekClient.js` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/paperProcessor.js` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/main.js` (created)

### Phase 4: Preferences UI
- **Status:** complete
- Actions taken:
  - 使用 HTML5 + 内联 CSS 网格布局实现设置页
  - 实现读取/保存 `extensions.paper-classifier.*` 偏好
  - 实现“测试连接”按钮，显示成功或错误信息
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferences.xhtml` (created)

### Phase 5: Bootstrap Finalization
- **Status:** complete
- Actions taken:
  - 在 startup 中等待 `Zotero.initializationPromise`
  - 先注册 chrome 包再按顺序加载模块
  - 实现窗口枚举、窗口监听、shutdown 清理、chrome handle 析构
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/bootstrap.js` (updated)

### Phase 6: Verification & Delivery
- **Status:** complete
- Actions taken:
  - 执行 `node --check` 验证全部 JS 语法通过
  - 验证文件路径和关键字段存在（manifest / bootstrap / modules / prefs）
  - 整理打包、安装、调试、排错与手动测试完整流程
  - 根据用户安装报错修复兼容字段：`strict_max_version=8.99.*`
  - 重新更新 `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0.xpi`
  - 增加 `manifest.json` 的 `update_url` 与 `homepage_url`，并去除非必要 `chrome_url`
  - 修复 `bootstrap.js` 启动参数兼容：优先 `rootURI`，兼容 `resourceURI`
  - 将插件包直接复制到 Zotero profile 扩展目录：`paper-classifier@local.xpi`
  - 将旧残留目录 `paper-classifier@example.com` 迁移为备份目录 `paper-classifier@example.com.bak-20260223`
  - 获取用户实际版本：`8.0.2-beta.5+c35d7f21e`
  - 生成 beta 兼容包：`paper-classifier-1.0.0-beta-compatible.xpi`
  - beta 兼容包 ID 设为 `paper-classifier@example.com`，并放入 profile：`paper-classifier@example.com.xpi`
  - 将 `paper-classifier@local.xpi` 备份，避免双插件冲突
  - 按用户要求新增 Zotero 内置“设置页”入口（Preference Pane）：
    - `main.js` 注册 `paper-classifier-prefpane`
    - 新增 `preferencesPane.xhtml`（直接输入 API Key / Endpoint / 模型 / 输出位置）
    - 工具菜单“设置”改为跳转到 Zotero 首选项对应插件页
  - 进一步修复设置页不显示：
    - `bootstrap.js` 增加 `await Zotero.uiReadyPromise`
    - `main.js` 对设置页注册增加重试（60 次，每秒一次）
    - `onWindowLoad` 和 `openPreferences` 都会再次尝试注册设置页
  - 清理安装冲突源：将 `extensions/staged/paper-classifier*` 改名为 `__*.disabled-20260223`
  - 优化设置体验：
    - 修复“Paper Classifier 显示两次”问题（注册并发锁 + 重复 pane 清理）
    - 设置页仅保留 API Key，Endpoint 固定默认值，不再对用户暴露
  - 修复 API Key 输入不可编辑问题：偏好面板改为脚本管理字段同步
  - 新增 API Key 验证按钮（在设置面板内测试 DeepSeek 连接并显示状态）
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/task_plan.md` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/findings.md` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/progress.md` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/manifest.json` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/bootstrap.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/main.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferences.xhtml` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferencesPane.xhtml` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferencesPane.js` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferencesPane.xhtml` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0.xpi` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0-beta-compatible.xpi` (created)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@example.com.xpi` (updated)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@local.xpi` (updated)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@example.com.xpi` (created)

### Phase 7: API Key Persistence Hotfix
- **Status:** complete
- Actions taken:
  - 定位报错“API Key 不能为空”根因为偏好分支读取错误（`Zotero.Prefs.get/set` 缺少 `global=true`）
  - 已在 `paperProcessor.js`、`preferencesPane.js`、`preferences.xhtml` 统一改为全局分支读写
  - 增加旧分支迁移：若读到历史值则自动写回正确分支
  - 重新打包 `paper-classifier-1.0.0.xpi` 与 `paper-classifier-1.0.0-beta-compatible.xpi`
  - 将新包同步到 profile：`paper-classifier@example.com.xpi`，并校验 SHA256 一致
  - 清理 `extensions/staged/paper-classifier@example.com` 空目录（重命名为 disabled），避免 staged 冲突
  - 运行 `node --check`（JS）与 `xmllint --noout`（XHTML）完成静态校验
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/paperProcessor.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferencesPane.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferences.xhtml` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0.xpi` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0-beta-compatible.xpi` (updated)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@example.com.xpi` (updated)

### Phase 8: Preferences Pane Interaction Hotfix
- **Status:** complete
- Actions taken:
  - 将 `PreferencePanes.register()` 的 `src/scripts` 改为 `chrome://paper-classifier/content/...` 绝对路径
  - 偏好面板根节点改为 `vbox onload`，避免 `groupbox onload` 触发不稳定
  - 为 API Key/模型/输出方式控件增加 `preference="extensions.paper-classifier.*"` 自动绑定，保证关闭设置后仍保存
  - 简化 `preferencesPane.js`：去除一次性 `_bound` 绑定逻辑，保留连接验证与默认值兜底
  - 重新打包并覆盖 profile 扩展文件，校验 SHA256 一致
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/main.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferencesPane.xhtml` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferencesPane.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0.xpi` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0-beta-compatible.xpi` (updated)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@example.com.xpi` (updated)

### Phase 9: Blank Preference Pane Hotfix
- **Status:** complete
- Actions taken:
  - 将偏好面板回退为已验证结构：`groupbox onload`，不再依赖外置 pane script 注入
  - 偏好面板交互逻辑迁入 `main.js`，通过 `Zotero.PaperClassifier.onPreferencePaneLoad/testPreferenceConnection` 执行
  - `PreferencePanes.register` 的 `src` 改回相对路径 `addon/chrome/content/preferencesPane.xhtml`
  - 注册前清理同 ID/同 pluginID 的旧 pane，避免历史空白 pane 缓存导致 UI 不刷新
  - 重新打包并覆盖 profile 的 `paper-classifier@example.com.xpi`
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferencesPane.xhtml` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/main.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0.xpi` (updated)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@example.com.xpi` (updated)

### Phase 10: DeepSeek Empty Content Hotfix
- **Status:** complete
- Actions taken:
  - 重写 `deepseekClient.js` 的响应解析逻辑，兼容 `content` 为字符串/数组/对象等格式
  - 增加 `reasoning_content` 兜底提取与文本规范化（提取 `一级/二级`）
  - 将 `max_tokens` 从 50 提升到 128，减少 reasoner 输出为空概率
  - 当模型为 `deepseek-reasoner` 且首轮无有效分类时，自动回退 `deepseek-chat` 重试一次
  - 重新打包并覆盖 profile 扩展文件
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/deepseekClient.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0.xpi` (updated)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@example.com.xpi` (updated)

### Phase 11: Collection Routing Upgrade
- **Status:** complete
- Actions taken:
  - 将 `paperProcessor` 从 tag/extra 写回改为“集合归档”流程
  - 新增分类解析与集合创建逻辑：`根目录/一级/二级`（自动创建缺失集合）
  - 新增归档行为配置：默认“移动”（覆盖原集合），可选“保留原有分类，仅追加到目标”
  - 设置页移除 tag/extra 选项，改为“分类根目录 + 归档方式”
  - 处理完成弹窗改为显示实际归档路径
  - 重新打包并覆盖 profile 扩展文件
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/paperProcessor.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/main.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferencesPane.xhtml` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/prefs.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0.xpi` (updated)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@example.com.xpi` (updated)

### Phase 12: Theme Taxonomy Upgrade
- **Status:** complete
- Actions taken:
  - DeepSeek system prompt 从“学科分类”升级为“研究主题分类”
  - 输出格式保持 `一级主题/二级主题`，允许模型基于论文内容自定义主题，不限固定列表
  - 默认分类根目录从 `AI自动分类` 改为 `AI主题分类`
  - 重新打包并覆盖 profile 扩展文件
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/deepseekClient.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/paperProcessor.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/main.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/prefs.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/preferencesPane.xhtml` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0.xpi` (updated)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@example.com.xpi` (updated)

### Phase 13: Plugin Avatar Update
- **Status:** complete
- Actions taken:
  - 将原占位图标（1x1）替换为正式头像，并生成多尺寸图标资源（16/32/48/96/128）
  - 更新 `manifest.json` 的 `icons` 字段，覆盖多尺寸映射
  - 新增 `addon/chrome/content/icons/*`，并在 `PreferencePanes.register` 设置 `image`
  - 重新打包并覆盖 profile 扩展文件
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/icons/icon-16.png` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/icons/icon-32.png` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/icons/icon-48.png` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/icons/icon-96.png` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/icons/icon-128.png` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/icons/icon.png` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/icons/icon-32.png` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/icons/icon-48.png` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/icons/icon-96.png` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/chrome/content/icons/icon.png` (created)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/manifest.json` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier/addon/main.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0.xpi` (updated)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier@example.com.xpi` (updated)

### Phase 14: English Edition Packaging
- **Status:** complete
- Actions taken:
  - 从稳定中文版本复制出 `paper-classifier-en` 独立工程
  - 更新英文版清单：`name/description/id/update_url`，插件 ID 改为 `paper-classifier-en@example.com`
  - 将 pref 前缀改为 `extensions.paper-classifier-en.*`，避免与中文版共享配置
  - 将 chrome 包名改为 `paper-classifier-en`，设置页图标 URL 同步到 `chrome://paper-classifier-en/...`
  - 将全局对象改为 `PaperClassifierEN`，菜单命令与窗口挂载同步改名，避免与中文版运行时冲突
  - 英文化 UI/提示词/错误信息（研究主题分类输出改为英文格式）
  - 删除未使用且含旧前缀的 `addon/chrome/content/preferencesPane.js`
  - 打包 `paper-classifier-1.0.0-en.xpi` 并复制到 profile：`paper-classifier-en@example.com.xpi`
- Files created/modified:
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/manifest.json` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/bootstrap.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/addon/main.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/addon/paperProcessor.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/addon/deepseekClient.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/addon/prefs.js` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/addon/chrome/content/preferencesPane.xhtml` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/addon/chrome/content/preferences.xhtml` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/addon/locale/en-US/addon.ftl` (updated)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-en/addon/chrome/content/preferencesPane.js` (deleted)
  - `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier-1.0.0-en.xpi` (created)
  - `/Users/guotuan/Library/Application Support/Zotero/Profiles/r48drq9s.default/extensions/paper-classifier-en@example.com.xpi` (created)

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Plan files initialized | N/A | 3 planning files exist | `task_plan.md/findings.md/progress.md` 已创建 | ✓ |
| JS syntax check | `node --check` on bootstrap + 3 modules | 无语法错误 | 全部通过 | ✓ |
| Manifest keys | `rg` 查询 `chrome_url/id/version constraints` | 字段齐全 | 字段齐全 | ✓ |
| Hotfix syntax check | `node --check` + `xmllint --noout` | 修复后无语法/结构错误 | 全部通过 | ✓ |
| Package consistency | `shasum -a 256` source vs profile xpi | 哈希一致 | 一致 | ✓ |
| DeepSeek parser hotfix | `node --check` + 包内关键片段检查 | 新解析与回退逻辑已进入安装包 | 通过 | ✓ |
| Collection routing upgrade | `node --check` + 包内关键片段检查 | 集合归档逻辑与设置项已进入安装包 | 通过 | ✓ |
| Theme taxonomy upgrade | `node --check` + 包内关键片段检查 | 主题分类提示词与默认目录已进入安装包 | 通过 | ✓ |
| Avatar update | `file` + 包内 manifest 检查 | 多尺寸图标与 pane 头像已进入安装包 | 通过 | ✓ |
| English edition | `node --check` + `xmllint` + xpi hash check | 英文版可独立安装且与中文版隔离 | 通过 | ✓ |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-02-23 18:33 | `node --check` 对 `.xhtml` 报 `ERR_UNKNOWN_FILE_EXTENSION` | 1 | 改用 `xmllint` 校验 XHTML，JS 保留 `node --check` |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 14（English Edition Packaging） |
| Where am I going? | 用户重启 Zotero 后验证英文版并行加载 |
| What's the goal? | 交付可安装 Zotero 8 论文分类插件 |
| What have I learned? | 见 findings.md |
| What have I done? | 已完成英文版独立工程、隔离改造、打包部署与校验 |
