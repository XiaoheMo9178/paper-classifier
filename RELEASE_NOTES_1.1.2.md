# Paper Classifier v1.1.2 Release Notes

**Release type:** Taxonomy refinement  
**Plugin IDs:** `paper-classifier@example.com`, `paper-classifier-en@example.com`

## What Changed

- Tightened classification granularity to reduce "one paper, one category" behavior.
- Secondary themes are now constrained to a controlled taxonomy instead of being freely generated from each paper's disease, object, dataset, or intervention name.
- Added local post-processing rules that force both Chinese and English editions back into stable secondary buckets even when the model returns overly specific labels.
- Unknown or overly specific secondary labels now fall back to `综合研究` / `General Study` under the matched primary theme instead of creating a new folder.

## Result

The plugin now favors reusable folders such as:

```text
AI主题分类/干预与试验研究/随机对照试验
AI主题分类/系统综述与证据综合/Meta分析
AI主题分类/量表与测量工具/信效度验证
AI主题分类/预测模型与诊断评估/模型验证
```

This should substantially reduce fragmented folders during large batch classification.
