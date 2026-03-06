# Task Plan: Zotero 8 Paper Classifier Plugin

## Goal
在 `/Users/guotuan/Desktop/VS/openfenleiii/paper-classifier` 创建一个可安装的 Zotero 8 Bootstrap 插件，实现读取选中文献标题/摘要，调用 DeepSeek API 分类，并将结果写入 tag 或 extra 字段。

## Current Phase
Phase 14 Complete

## Phases
### Phase 1: Requirements & Discovery
- [x] 解析用户提供的 8 个步骤与目录结构
- [x] 确认目标路径与工程范围
- [x] 初始化 planning 文件
- **Status:** complete

### Phase 2: Project Scaffold
- [x] 创建 `paper-classifier` 目录与基础文件
- [x] 写入 `manifest.json`、初版 `bootstrap.js`、`addon/prefs.js`
- [x] 创建 chrome/locale/icons 目录与占位文件
- **Status:** complete

### Phase 3: Core Modules
- [x] 实现 `addon/deepseekClient.js`
- [x] 实现 `addon/paperProcessor.js`
- [x] 实现 `addon/main.js`
- **Status:** complete

### Phase 4: Preferences UI
- [x] 实现 `addon/chrome/content/preferences.xhtml`
- [x] 补充 `overlay.xul` 与 `addon.ftl`
- **Status:** complete

### Phase 5: Bootstrap Finalization
- [x] 完整重写 `bootstrap.js`（初始化、窗口监听、卸载清理）
- [x] 注册 chrome 包（aomStartup.registerChrome）
- [x] 确认 `manifest.json` `chrome_url`
- **Status:** complete

### Phase 6: Verification & Delivery
- [x] 检查关键 API 与函数签名
- [x] 给出打包命令和安装调试步骤
- [x] 交付完整结果
- **Status:** complete

### Phase 7: API Key Persistence Hotfix
- [x] 定位“API Key 不能为空”的真实原因
- [x] 统一修复 `Zotero.Prefs` 全局分支读写
- [x] 重新打包并部署 profile 扩展文件
- **Status:** complete

### Phase 8: Preferences Pane Interaction Hotfix
- [x] 修复设置页“验证 API Key”无反应
- [x] 修复设置页关闭后 API Key 未保存
- [x] 重新打包并覆盖 profile 扩展文件
- **Status:** complete

### Phase 9: Blank Preferences Pane Hotfix
- [x] 修复设置页右侧空白问题
- [x] 调整 pane 注册/加载链路，降低 chrome 资源依赖
- [x] 重新打包并覆盖 profile 扩展文件
- **Status:** complete

### Phase 10: DeepSeek Empty Content Hotfix
- [x] 修复“返回结果缺少分类内容”导致全失败
- [x] 兼容 `deepseek-reasoner` 空 content 场景并自动回退
- [x] 重新打包并覆盖 profile 扩展文件
- **Status:** complete

### Phase 11: Collection Routing Upgrade
- [x] 将输出目标从 tag/extra 切换为二级分类集合
- [x] 按 `根目录/一级/二级` 自动创建集合并归档条目
- [x] 设置页改为“分类根目录 + 保留原分类”并重新打包部署
- **Status:** complete

### Phase 12: Theme Taxonomy Upgrade
- [x] 将 DeepSeek 提示词从“学科分类”改为“研究主题分类”
- [x] 默认根目录改为“AI主题分类”
- [x] 重新打包并覆盖 profile 扩展文件
- **Status:** complete

### Phase 13: Plugin Avatar Update
- [x] 生成正式插件图标资源（多尺寸）
- [x] 在 manifest 和设置面板入口接入头像
- [x] 重新打包并覆盖 profile 扩展文件
- **Status:** complete

### Phase 14: English Edition Packaging
- [x] 复制稳定版插件并生成独立英文工程 `paper-classifier-en`
- [x] 完成英文化（文案、提示词、错误信息）与独立命名空间隔离
- [x] 打包 `paper-classifier-1.0.0-en.xpi` 并部署到 profile 扩展目录
- **Status:** complete

## Key Questions
1. 菜单 `oncommand` 是否能访问全局 `PaperClassifier`（通过将对象挂到 window 解决）。
2. 偏好设置窗口是否可直接使用 `Zotero.Prefs`（通过主窗口 opener 引用 Zotero 全局）。
3. 保存 extra 字段时是否应保留旧内容（保留并在开头追加）。

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用 Zotero 8 Bootstrap + subscript 模块加载 | 符合用户给定结构与兼容方式 |
| DeepSeek 调用使用 XMLHttpRequest | 用户明确要求，Zotero 环境兼容更稳 |
| 批处理串行执行 | 避免 API 限流和并发写入风险 |
| `item.save()` 放入 `Zotero.DB.executeTransaction` | 满足步骤 3 的事务要求 |
| `main.js` 将 `PaperClassifier` 挂到 `window` | 确保菜单 `oncommand` 能访问全局对象 |
| 工具菜单兼容 `tools-menu` 与 `menu_ToolsPopup` | 提升不同 Zotero UI 结构下的兼容性 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| API Key 已输入但处理时为空 | 1 | 发现 `Prefs.get/set` 未使用 `global=true`，导致读写分支错误；已在处理器和设置页统一修复并加入迁移 |
