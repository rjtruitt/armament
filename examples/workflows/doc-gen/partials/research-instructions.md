# Research Instructions (Condensed)

## Source Hierarchy
1. **Code** — ground truth, always wins
2. **PRDs/Design Docs** — intended behavior, may be outdated
3. **[KB]/Slack** — tribal knowledge, context, may be wrong

## Quality Rules
- CITE EVERYTHING. No claim without a source.
- Include file paths and line numbers for code references.
- If two sources conflict, trust the higher-ranked one.
- Flag uncertainty: "[UNVERIFIED]" for single-source claims.
- Never invent behavior. If unsure, say "needs verification."

## Output Format
Structure findings as:
- **What**: the fact/behavior
- **Where**: source (file:line, URL, channel/person)
- **Confidence**: high (code) | medium (PRD) | low (Slack)
