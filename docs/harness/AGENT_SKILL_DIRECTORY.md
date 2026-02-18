**Harness version: 1.0**

## Overview

**Plan → Work → Review → Compound → Repeat**

### Agents vs Skills

- **Agents** are autonomous prompts for the Task tool. They research, analyze, or validate independently given a goal.
- **Skills** are step-by-step processes with supporting assets (templates, schemas, references). They guide Claude through structured workflows with decision points.

## 01 Plan

### Agents

| Agent | Description |
|-------|-------------|
| `best-practices-researcher` | Gather external best practices and examples |
| `framework-docs-researcher` | Research framework documentation and best practices |
| `repo-research-analyst` | Research repository structure and conventions |
| `spec-flow-analyzer` | Analyze user flows and identify gaps in specifications |

### Skills

| Skill | Description |
|-------|-------------|
| `brainstorming` | Explore requirements and approaches through collaborative dialogue |

## 02 Work

### Agents

| Agent | Description |
|-------|-------------|
| `implementation-executor` | Execute a plan step by step, checking off items as done |
| `test-writer` | Write tests matching the project's existing test patterns |

## 03 Review

### Agents

| Agent | Description |
|-------|-------------|
| `bug-reproduction-validator` | Systematically reproduce and validate bug reports |
| `code-simplicity-reviewer` | Final pass for simplicity and minimalism |
| `pattern-recognition-specialist` | Analyze code for patterns and anti-patterns |
| `performance-oracle` | Performance analysis and optimization |

## 04 Compound

### Skills

| Skill | Description |
|-------|-------------|
| `compound-docs` | Capture solved problems as categorized documentation |
| `document-review` | Improve documents through structured self-review |
