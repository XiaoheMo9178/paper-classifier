# Paper Classifier v1.1.0 Release Notes

**Release type:** Maintenance update  
**Plugin IDs:** `paper-classifier@example.com`, `paper-classifier-en@example.com`

## What Changed

- Updated DeepSeek integration to the current V4 models:
  - `deepseek-v4-flash`
  - `deepseek-v4-pro`
- Updated the Chat Completions request path to the official `/chat/completions` endpoint under `https://api.deepseek.com`.
- Added focused taxonomy prompting with a stable primary theme pool to reduce scattered Zotero collection folders.
- Added post-processing synonym merging so outputs such as RCT, randomized trial, meta-analysis, questionnaire validation, diagnosis, and prediction are routed into consistent primary themes.
- Switched classification output to strict JSON (`primary` / `secondary`) and disabled thinking mode for short, deterministic classification calls.
- Preserved compatibility for old saved model values: `deepseek-chat` and `deepseek-reasoner` are migrated to `deepseek-v4-flash`.

## Recommended Model

Use `deepseek-v4-flash` for normal batch classification. Switch to `deepseek-v4-pro` when abstracts are unusually complex or you want the more conservative high-quality model.

## Notes

The endpoint input remains hidden in the UI. The plugin fixes the base API target internally to avoid stale user-entered endpoints.
