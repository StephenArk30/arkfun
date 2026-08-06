This repository is mainly used to store my personal miscellaneous items, such as code snippets, AI SKILLs, npm packages, etc.

## Commit message convention for AI-generated commits

When the AI agent (e.g. CodeBuddy Code) creates a git commit, it MUST append a `Co-authored-by` trailer to the commit message identifying the agent and the model that produced the change. This makes AI-authored work traceable in `git log` and renders as a co-author on GitHub.

Format:

```
<normal commit subject and body>

Co-authored-by: CodeBuddy Code (<Model-Display-Name>)
```

Rules:

- The model display name is taken from the `codebuddy_background_info` block in the system prompt (e.g. `GLM-5.2`). Use the human-readable display name, not the exact model ID.
- The trailer goes at the very end of the commit message, separated from the body by a blank line, exactly as GitHub's `Co-authored-by` convention requires.
- Every commit authored or co-authored by the AI must include this trailer — including `refactor:`, `feat:`, `fix:`, `docs:`, `chore:`, etc. No exceptions for "small" commits.
- Human-authored commits are not affected by this rule; it only governs commits the AI creates.
- If the agent has no `codebuddy_background_info` available (unusual), fall back to the agent's product name without a parenthetical: `Co-authored-by: CodeBuddy Code`.

Example:

```
feat(skill): add project-baseline skill

Renames project-startup to project-baseline and rewrites the description
to cover both greenfield scaffolding and legacy retrofit scenarios.

Co-authored-by: CodeBuddy Code (GLM-5.2)
```

