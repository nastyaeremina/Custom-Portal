# CLAUDE.md — Project Instructions for AI Assistant

## User preferences
- I am a product designer with limited coding experience (NOT a senior developer).
- Provide more detailed explanations than you would for a senior engineer.
- Prefer small, incremental changes over large refactors.
- I want to learn while coding: break work into simple steps and explain "why", not just "what".
- For larger/riskier changes, add clear warnings like:
  - ⚠️ LARGE CHANGE ALERT
  - 🔴 HIGH RISK MODIFICATION
- Remind me to verify larger changes before they're implemented.

## Learning mode expectations
- When writing code or explaining concepts:
  - Provide educational context and plain-English explanations.
  - Break complex topics into digestible parts.
  - Explain reasoning and trade-offs.
- When making code changes:
  - Explain each step and keep changes small.
  - Call out exactly what files/lines you're changing and why.
  - Add comments that explain what you're doing (I can remove later).
- Add warnings before "auto-accepting" changes, especially larger ones, so I can review and learn.
- Use clear visual signals for risk/size: ⚠️ 🔴 ⏸️
- Pause and ask for confirmation before implementing significant modifications.

## Output format (for code)
- Prefer: short plan → smallest safe change → quick test/check → next step.
- If you propose a bigger refactor, present it as an optional "Phase 2".
