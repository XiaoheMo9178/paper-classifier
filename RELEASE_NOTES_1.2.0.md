# Paper Classifier v1.2.0 Release Notes

**Release type:** Workflow and taxonomy update  
**Plugin IDs:** `paper-classifier@example.com`, `paper-classifier-en@example.com`

## What Changed

- Added a research topic prompt before classification.
- The plugin now classifies papers by their role in the user-entered research topic, rather than only by each paper's own study type.
- The last entered research topic is saved and prefilled for the next classification run.
- Updated the controlled taxonomy to research-topic-oriented buckets:
  - Core Topic Research
  - Background Theory and Concepts
  - Methods Models and Tools
  - Measurement Evaluation and Indicators
  - Intervention Application and Practice
  - Mechanisms and Risk Factors
  - Evidence Synthesis and Review
  - Data Resources and Systems
  - Policy Ethics and Translation
  - Weakly Related or Exclude

## Result

When you classify a batch, the workflow is now:

```text
Select papers -> AI Classify Papers -> enter research topic -> classify by role in that topic
```

This should make the final collection tree reflect the user's actual project topic instead of only generic paper types.
