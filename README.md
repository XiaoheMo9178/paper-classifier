# Paper Classifier（Zotero 插件）

> 使用 DeepSeek 按“研究主题”自动分类论文，并自动归档到二级目录集合。
>
> [English README](README.en.md)

## 项目介绍

Paper Classifier 是一个 Zotero Bootstrap 插件，面向需要批量整理文献的研究者。点击分类时，插件会先要求输入本次研究题目，再读取文献标题与摘要，调用 DeepSeek API 判断每篇文献相对该研究题目的主题作用，并自动将条目归档到对应集合目录：

```text
<主题根目录>
  / <一级主题>
    / <二级主题>
      / 文献条目
```

项目分类目标是“围绕本次研究题目整理文献”，而非传统学科分类。插件会按文献在该研究中的作用归入稳定主题池，例如核心主题研究、背景理论与概念、方法模型与工具、测量评价与指标、干预应用与实践、机制基础与风险因素、证据综合与综述等，避免每篇论文都创建零散目录。

## 核心功能

- 右键一键分类：`AI 分类论文`
- 分类前输入研究题目：每次分类都会围绕本次题目判断文献作用
- 批量顺序处理：避免并发触发 API 限流
- 自动创建目录：缺失的一级/二级集合会自动创建
- 自动归档：支持直接移动，或保留原有集合后追加到目标集合
- 设置面板集成：在 Zotero 首选项左侧显示插件面板
- API Key 连通性验证：面板内可直接测试
- 支持模型切换：`deepseek-v4-flash` / `deepseek-v4-pro`
- 使用研究题目导向主题池 + 固定二级分类表 + 同义归并，减少批量分类时的目录碎片
- DeepSeek V4 短输出为空时自动换另一个 V4 模型重试一次
- 完成弹窗按分类统计篇数，不再逐篇列出长列表

## 开源信息

- 许可证：MIT（见 [LICENSE](LICENSE)）
- 贡献者（第一）：[XiaoheMo9178](https://github.com/XiaoheMo9178)
- 贡献者（第二）：[GuotuanWaang](https://github.com/GuotuanWaang)（见 [CONTRIBUTORS.md](CONTRIBUTORS.md)）

## 版本与安装包

| 版本 | 安装包 | 插件 ID | 界面语言 |
|---|---|---|---|
| 中文版 | `paper-classifier-1.2.0.xpi` | `paper-classifier@example.com` | 中文 |
| 英文版 | `paper-classifier-1.2.0-en.xpi` | `paper-classifier-en@example.com` | 英文 |

两者可并存安装（ID 不同）。

## 环境要求

- Zotero：7.x / 8.x（已适配 beta 版本区间）
- DeepSeek API Key：必填
- 固定 API Endpoint：`https://api.deepseek.com/chat/completions`

## 安装步骤

1. 打开 Zotero：`工具 -> 插件`
2. 右上角齿轮：`从文件安装插件...`
3. 选择 `.xpi` 文件并安装
4. 完全退出 Zotero（macOS 建议 `Cmd+Q`）后重新打开

## 配置步骤

1. 打开：`设置/首选项 -> Paper Classifier`（或 `Paper Classifier EN`）
2. 填写 `API Key`
3. 选择 `Model`
4. 设置 `Collection Root`（主题根目录）
5. 选择是否 `Keep Original Collections`
6. 点击 `验证 API Key / Validate API Key`

说明：
- Endpoint 已固定为 `https://api.deepseek.com/chat/completions`，面板不再单独显示 Endpoint 输入框。
- 设置项会立即写入 Zotero 全局偏好（插件前缀隔离）。
- 历史保存的 `deepseek-chat` / `deepseek-reasoner` 会自动迁移为 `deepseek-v4-flash`。

## 使用流程

1. 在 Zotero 中选中一篇或多篇常规文献条目（非附件）
2. 右键点击：`AI 分类论文`
3. 在弹窗中输入本次研究题目，例如“护理干预对老年糖尿病患者自我管理能力的影响”
4. 插件读取标题与摘要，并基于研究题目请求 DeepSeek
5. 按 `主题根目录/研究题目导向一级主题/受控二级主题` 自动创建集合并归档
6. 弹出结果汇总（成功/失败总数、分了几类、每类多少篇）

## 输出行为

- 若条目缺标题：失败并提示 `条目缺少标题`
- 若条目缺摘要：失败并提示 `条目缺少摘要`
- 若未输入研究题目：取消分类并提示 `研究题目不能为空`
- 若模型返回非 `一级/二级` 格式：自动归入 `弱相关或排除/待判定`
- 若 DeepSeek V4 返回空分类：自动切换另一个 V4 模型重试

## 从源码打包

中文版：

```bash
cd paper-classifier
zip -r ../paper-classifier-1.2.0.xpi . -x '*.DS_Store'
```

英文版：

```bash
cd paper-classifier-en
zip -r ../paper-classifier-1.2.0-en.xpi . -x '*.DS_Store'
```

## 常见问题

- 首选项看不到插件面板
  - 完全退出并重启 Zotero，等待 3-5 秒后再打开首选项。
- 提示 API Key 为空
  - 回到插件面板重新输入后点击验证按钮，确认状态为成功。
- 分类结果为空
  - 先改用 `deepseek-v4-pro`，再重试；同时检查 API 配额。
- 只看到旧菜单或重复面板
  - 卸载旧版插件后重启，再安装当前包。

## 项目结构

```text
paper-classifier/
├── paper-classifier/                 # 中文版插件源码
├── paper-classifier-en/              # 英文版插件源码
├── paper-classifier-1.2.0.xpi        # 中文版安装包
└── paper-classifier-1.2.0-en.xpi     # 英文版安装包
```
