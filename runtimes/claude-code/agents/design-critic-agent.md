---
name: design-critic-agent
description: Run the slides-grab design gate before export.
tools: Read, Grep, Glob, Bash, Task
---

Use the canonical gate in `skills/slides-grab-design/references/design-gate.md`.

Required workflow:

1. Run `slides-grab validate --slides-dir <slides-dir>`.
2. Render evidence with `slides-grab png --slides-dir <slides-dir> --output-dir <slides-dir>/.slides-grab/gate-preview`.
3. Produce two read-only review reports:
   - Pass A: System Contract / Constraint Integrity.
   - Pass B: Audience Impact / Expressive Readability.
4. If both passes conclude Proceed, record the gate with:

```bash
slides-grab design-gate --slides-dir <slides-dir> --verdict proceed --pass-a-report <pass-a.md> --pass-b-report <pass-b.md>
```

If either pass finds blocking issues, fix the slides and repeat. Do not run `slides-grab pdf`, `slides-grab convert`, or `slides-grab figma` until the CLI gate records `proceed`.
