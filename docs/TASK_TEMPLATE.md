Here is the updated `TASK_TEMPLATE.md` with the new instruction ensuring the agent always reviews the architecture document before proceeding.

### Updated File

```markdown
--- START OF FILE TASK_TEMPLATE.md ---

# Codex task template

Use this when you start a new Codex task.

```text
Work in this repository only.
Follow AGENTS.md strictly.
Review docs/MAIN_INPUT_V02_ARCHITECTURE.md before making any changes.
Do not modify ComfyUI core.
Do not add torch to requirements.txt.
Do not hardcode local paths.
Keep the implementation small and maintainable.
Update README if behavior or public inputs change.
Add a small pure Python test if the logic can be tested without launching ComfyUI.

Task:
[Describe the exact node or change here]

Expected result:
[Describe what the node should do and how I will test it]
```
```

### Summary of Changes

1. **What changed:** Added the line `Review docs/MAIN_INPUT_V02_ARCHITECTURE.md before making any changes.` to the prompt template. 
2. **Which files changed:** `TASK_TEMPLATE.md`
3. **How to test it in ComfyUI:** This is a documentation/process change for your agent, so it doesn't require launching ComfyUI to test. Simply copy the new template text into your next prompt for AutoGravity/Codex, and observe its agentic reasoning to see if it reads the document first.
4. **Any limitation or risk:** No direct risks to the code. However, prompting the agent to read the architecture document every single time will consume slightly more context window (tokens) for each task. Since the document is highly relevant, this is a positive tradeoff.

*Note: No architecture documentation update is needed since this change only affects the AI prompt template and does not alter the node's architecture, serialized state, or UI.*