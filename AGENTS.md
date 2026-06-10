# Codex instructions for this ComfyUI custom node pack

This repository is a ComfyUI custom node pack.

## Scope

Codex must work only inside this repository.
Do not modify ComfyUI core files.
Do not assume this repository is the full ComfyUI install.
Do not touch sibling folders in `custom_nodes`.

## Architecture rules

- Keep nodes small and explicit.
- Do not create one huge Python file.
- Put node classes in `nodes/`.
- Put shared pure Python helpers in `utils/`.
- Keep frontend code in `web/js/` only when needed.
- Avoid clever abstractions unless they remove real duplication.
- Never hardcode local paths.
- Never commit models, checkpoints, generated images, logs, secrets, or local output files.
- Do not add automatic shell execution.
- Avoid `install.py` unless explicitly requested.
- Prefer `requirements.txt` for pip dependencies.
- Keep `requirements.txt` minimal.
- Do not add or pin torch unless explicitly requested.

## ComfyUI node rules

Each node class must define:

- `INPUT_TYPES`
- `RETURN_TYPES`
- `FUNCTION`
- `CATEGORY`

Expose nodes through `NODE_CLASS_MAPPINGS` in the root `__init__.py`.
Expose readable names through `NODE_DISPLAY_NAME_MAPPINGS`.

Optional dependencies must not crash ComfyUI at import time.
If a dependency is missing, raise a clear error inside the node function.

## UI and naming rules

- Use clear category names.
- Use stable node internal names.
- Do not rename public node inputs or outputs unless the task asks for it.
- When changing public inputs or outputs, update README and example workflows.

## Architecture documentation rule

If a task changes the architecture, lifecycle, serialized state, reload behavior, API export behavior, dynamic output behavior, or file/module responsibilities, Codex must update the relevant architecture documentation in the same task.

For mAI MainInputV02, update:

- `docs/MAIN_INPUT_V02_ARCHITECTURE.md`

Update it when changing:

- how `fields_config` is stored or serialized
- how dynamic widgets are rebuilt
- how output sockets are created, removed, renamed, or normalized
- how reload/link preservation works
- how API export is expected to work
- supported field types
- image or mask behavior
- file/module responsibilities
- per-node-instance state rules

Do not let implementation and documentation drift apart.

If no architecture documentation update is needed, mention why in the final response.

## Local environment

ComfyUI runs inside a Python virtual environment.

- Do not assume system Python has ComfyUI dependencies.
- When running Python commands, use the repository or ComfyUI `.venv` Python.
- On Windows, prefer:
  - `.venv\Scripts\python.exe`
  - `.venv\Scripts\pip.exe`
- On Linux/macOS, prefer:
  - `.venv/bin/python`
  - `.venv/bin/pip`
- Do not install packages globally.
- Do not add or pin torch unless explicitly requested.
- If `.venv` is not available from this repository, ask before running dependency-based commands.
- For simple static checks, prefer reading files instead of launching ComfyUI.
- Do not launch long-running ComfyUI server processes unless explicitly requested.

## Testing

- Add small pure Python tests for logic when possible.
- Do not require a full ComfyUI launch for basic tests.
- Keep test data tiny.
- Do not depend on local absolute paths.

## Response expectations

After every task, explain:

1. What changed
2. Which files changed
3. How to test it in ComfyUI
4. Any limitation or risk
