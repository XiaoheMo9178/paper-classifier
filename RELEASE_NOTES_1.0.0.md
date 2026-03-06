# Paper Classifier v1.0.0 — Release Notes

**Release Date:** 2026-02-24
**Plugin ID:** `paper-classifier@example.com`
**Compatibility:** Zotero 7 / 8 (Bootstrap extension model)

---

## What's New in v1.0.0

This is the first public release of **Paper Classifier**, a Zotero plugin that uses the DeepSeek AI API to automatically classify academic papers by research theme and organize them into a hierarchical collection tree.

---

## Key Features

### AI-Powered Research Theme Classification
Papers are classified by **research theme** rather than academic discipline. The AI model identifies themes such as *Randomized Controlled Trial*, *Systematic Review*, *Meta-Analysis*, *Mechanistic Study*, *Scale Development & Validation*, *Intervention Study*, and more — or creates appropriate custom theme names when needed.

Classification output format: `Primary Theme / Secondary Theme`

### Automatic Three-Level Collection Hierarchy
The plugin creates and maintains a three-level collection structure in your Zotero library automatically:

```
<Collection Root>  (default: "AI主题分类")
  └── <Primary Theme>
        └── <Secondary Theme>
              └── [paper items]
```

Missing intermediate collections are created on the fly.

### Batch Processing
Select any number of items and classify them all in one operation. Processing is sequential to respect API rate limits.

### Context Menu Integration
A new **"AI 分类论文"** menu item appears in the right-click context menu for selected library items.

### Preferences Pane in Zotero Settings
Plugin settings are registered directly in the native Zotero **Edit → Preferences** dialog, including:

| Setting | Default | Description |
|---------|---------|-------------|
| API Key | *(empty)* | Your DeepSeek API key |
| Model | `deepseek-chat` | AI model to use for classification |
| Collection Root | `AI主题分类` | Root collection name in your library |
| Keep Original Collections | Off | If enabled, papers are added to the new collection without being removed from their current ones |

### Built-in API Key Validation
A **"Verify API Key"** button in the settings pane sends a lightweight test request to the DeepSeek endpoint and displays the result inline (success / error message).

### DeepSeek Reasoner Fallback
When the `deepseek-reasoner` model returns an empty response body (a known edge case for short outputs), the plugin automatically retries with `deepseek-chat` to ensure classification always completes.

### Multi-Size Plugin Icons
The plugin ships with icons at 16 × 16, 32 × 32, 48 × 48, 96 × 96, and 128 × 128 pixels. The icon is displayed in the Zotero preferences sidebar alongside the plugin name.

---

## Installation

### Standard (Zotero 8 stable)
Install `paper-classifier-1.0.0.xpi` via **Tools → Add-ons → ⚙ → Install Add-on From File…**

### Beta / Nightly Zotero
Install `paper-classifier-1.0.0-beta-compatible.xpi` instead.
This build uses a relaxed version range (`strict_min_version: 6.999`, `strict_max_version: 9.9.*`) to bypass the compatibility warning shown by Zotero beta builds.

---

## Known Limitations

- Items **without a title or abstract** are skipped and reported in the failure summary. The DeepSeek API requires at least a title to generate a classification.
- The plugin uses the **DeepSeek Chat Completions API** and requires an active internet connection and a valid API key from [platform.deepseek.com](https://platform.deepseek.com/).
- The preferences pane registers **asynchronously** after Zotero starts. If the pane does not appear immediately, wait a few seconds and reopen the Preferences dialog.
- The `deepseek-reasoner` model may incur higher token usage. For most classification tasks, `deepseek-chat` is sufficient and more cost-effective.

---

## File Checksums

| File | Description |
|------|-------------|
| `paper-classifier-1.0.0.xpi` | Standard release for Zotero 8 stable |
| `paper-classifier-1.0.0-beta-compatible.xpi` | Relaxed version range for Zotero beta builds |

---

## Changelog

| Version | Date | Summary |
|---------|------|---------|
| 1.0.0 | 2026-02-24 | Initial public release |

---

*Built with the Zotero 8 Bootstrap extension model and the DeepSeek Chat Completions API.*
