# Paper Classifier v1.1.1 Release Notes

**Release type:** UI maintenance update  
**Plugin IDs:** `paper-classifier@example.com`, `paper-classifier-en@example.com`

## What Changed

- Optimized the final classification dialog for large batches.
- Successful results are now grouped by final collection/category path and displayed as category counts.
- Failed results are grouped by error reason and displayed as counts.
- The dialog no longer lists every processed paper title, preventing oversized alert windows on smaller screens.

## Example

Instead of listing every paper, the dialog now reports:

```text
Classification completed: 128 succeeded, 2 failed

Routed into 9 categories
1. Root/Evidence Synthesis/Stroke Rehabilitation: 24 papers
2. Root/Intervention and Trial Research/Diabetes Education: 18 papers
...
```
