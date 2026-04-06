<!-- codelicious:start -->

# codelicious

This project is managed by codelicious. Read `.codelicious/STATE.md` for
the current task list and progress.

## Rules
- Read existing files before modifying them.
- Run `/verify-all` after changes to catch issues early.
- Update `.codelicious/STATE.md` as you complete tasks.
- When done, write "DONE" to `.codelicious/BUILD_COMPLETE`.

## How to Work
- Use the **builder** agent for parallel code implementation.
- Use the **tester** agent to run tests and fix failures.
- Use the **reviewer** agent for security and quality checks.
- Use `/run-tests`, `/lint-fix`, `/verify-all` skills for common workflows.
- Use TodoWrite to track sub-steps within complex tasks.

## Security Policy (spec-20)
- Never use `git add .` — always stage files explicitly or use `git add -u`.
- Never pass `--dangerously-skip-permissions` to the Claude CLI.
- All LLM endpoint URLs must be validated for HTTPS and non-private IP.
- Never commit sensitive files (.env, .pem, .key, .p12, .pfx, .netrc, credentials).
- Sanitize all user-supplied values (spec_filter, filenames, config) before rendering into prompts.

## Git & PR Policy
- The codelicious orchestrator owns all git operations: add, commit, push, branch creation.
- You MUST NOT run git or gh commands. The orchestrator handles them.
- Write clear, descriptive commit messages that explain what changed and why.
- One commit per logical unit of work (e.g. one task, one fix).
- Create PRs with meaningful titles and descriptions summarizing actual changes.
- NEVER push to main/master/develop/release branches directly.
- NEVER force-push or amend published commits.

<!-- codelicious:end -->
