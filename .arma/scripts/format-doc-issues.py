#!/usr/bin/env python3
"""Formats structured doc review output into a readable report.

Reads JSON from stdin (the report_complete tool output),
writes formatted markdown to stdout for the next agent.
"""
import sys
import json

data = json.load(sys.stdin)

severity = data.get("severity", "unknown")
issues = data.get("issues", [])
missing = data.get("missing_sections", [])
outdated = data.get("outdated", [])

lines = []
lines.append(f"# Documentation Review Report")
lines.append(f"**Overall Severity: {severity.upper()}**")
lines.append(f"**Total Issues: {len(issues)}**\n")

if issues:
    lines.append("## Issues Found")
    for i, issue in enumerate(issues, 1):
        lines.append(f"{i}. {issue}")
    lines.append("")

if missing:
    lines.append("## Missing Sections")
    for section in missing:
        lines.append(f"- [ ] {section}")
    lines.append("")

if outdated:
    lines.append("## Outdated Content")
    for item in outdated:
        lines.append(f"- ⚠️  {item}")
    lines.append("")

lines.append("---")
lines.append("*Please address each item above. Write the corrected or new content for each.*")

print("\n".join(lines))
