# Paper Classifier (Zotero Plugin)

> Automatically classify papers by research theme with DeepSeek and route items into secondary collection folders.
>
> [中文说明](README.md)

## Overview

Paper Classifier is a Zotero Bootstrap plugin for researchers who need fast, consistent literature organization. It reads each paper's title and abstract, sends them to DeepSeek, gets a theme classification, and routes the item into:

```text
<Collection Root>
  / <Primary Theme>
    / <Secondary Theme>
      / Paper Item
```

The target is theme-based classification (not discipline-based). The plugin now prefers a stable primary theme pool, such as Intervention and Trial Research, Evidence Synthesis, Measurement and Instrument Development, and Prediction and Diagnostic Evaluation. Secondary themes also come from a controlled taxonomy, which keeps batch classification focused instead of creating scattered folders for every paper.

## Key Features

- One-click context action: `AI Classify Papers`
- Sequential batch processing to avoid API rate-limit spikes
- Auto-create missing primary/secondary collections
- Auto-routing with optional keep-original-collections mode
- Native Preferences pane integration in Zotero
- Built-in API Key validation button
- Model selector: `deepseek-v4-flash` / `deepseek-v4-pro`
- Focused theme pool plus a fixed secondary taxonomy and synonym merging to reduce folder fragmentation
- Auto-retry with the other V4 model when a short classification is empty
- Completion dialog summarizes category counts instead of listing every paper

## Open-Source Info

- License: MIT (see [LICENSE](LICENSE))
- First contributor: [XiaoheMo9178](https://github.com/XiaoheMo9178)
- Second contributor: [GuotuanWaang](https://github.com/GuotuanWaang) (see [CONTRIBUTORS.md](CONTRIBUTORS.md))

## Editions and Packages

| Edition | Package | Plugin ID | UI Language |
|---|---|---|---|
| Chinese | `paper-classifier-1.1.2.xpi` | `paper-classifier@example.com` | Chinese |
| English | `paper-classifier-1.1.2-en.xpi` | `paper-classifier-en@example.com` | English |

Both editions can be installed at the same time (different plugin IDs).

## Requirements

- Zotero: 7.x / 8.x (beta-compatible range enabled)
- DeepSeek API Key: required
- Fixed API endpoint: `https://api.deepseek.com/chat/completions`

## Installation

1. In Zotero: `Tools -> Plugins`
2. Gear icon -> `Install Plugin From File...`
3. Select the `.xpi` package
4. Fully quit Zotero (on macOS: `Cmd+Q`) and reopen

## Configuration

1. Open `Settings/Preferences -> Paper Classifier` (or `Paper Classifier EN`)
2. Enter `API Key`
3. Choose `Model`
4. Set `Collection Root`
5. Set `Keep Original Collections` on/off
6. Click `Validate API Key`

Notes:
- Endpoint is fixed to `https://api.deepseek.com/chat/completions`; there is no editable endpoint field.
- Preferences are stored in Zotero global prefs with edition-specific prefixes.
- Legacy saved values `deepseek-chat` / `deepseek-reasoner` are automatically migrated to `deepseek-v4-flash`.

## Usage

1. Select one or more regular top-level items (not attachments)
2. Right-click -> `AI Classify Papers`
3. Plugin reads title/abstract and requests DeepSeek
4. Plugin creates and routes to `Root/Focused Primary/Controlled Secondary`
5. A summary dialog shows success/failure totals, number of categories, and paper count per category

## Output Behavior

- Missing title -> fails with `Item is missing title`
- Missing abstract -> fails with `Item is missing abstract`
- Non `Primary/Secondary` response -> routed to `Other/<returned-theme>`
- Empty V4 classification -> retries once with the other V4 model

## Build From Source

Chinese edition:

```bash
cd paper-classifier
zip -r ../paper-classifier-1.1.2.xpi . -x '*.DS_Store'
```

English edition:

```bash
cd paper-classifier-en
zip -r ../paper-classifier-1.1.2-en.xpi . -x '*.DS_Store'
```

## Troubleshooting

- Preferences pane does not appear
  - Fully restart Zotero, then wait a few seconds before opening Preferences.
- API Key reported as empty
  - Re-enter key in pane and click validation button to force-save.
- Empty classification
  - Switch model to `deepseek-v4-pro` and retry; also check API quota.
- Duplicate/legacy menus or panes
  - Remove old plugin builds, restart Zotero, then install current package.

## Repository Layout

```text
paper-classifier/
├── paper-classifier/                 # Chinese plugin source
├── paper-classifier-en/              # English plugin source
├── paper-classifier-1.1.2.xpi        # Chinese package
└── paper-classifier-1.1.2-en.xpi     # English package
```
