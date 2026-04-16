import dataclasses
import logging
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

from codelicious.context.cache_engine import CacheManager
from codelicious.engines import select_engine
from codelicious.git.git_orchestrator import GitManager
from codelicious.spec_discovery import CHECKED_RE, UNCHECKED_RE, discover_incomplete_specs, walk_for_specs


@dataclasses.dataclass(frozen=True)
class PreFlightResult:
    """Result of the pre-flight authentication and environment checks.

    Populated at CLI startup and available to downstream code so engines
    and the git orchestrator can reference the authenticated user and
    detected platform without re-running checks.
    """

    platform: str  # "github", "gitlab", or "unknown"
    authenticated_user: str  # GitHub/GitLab username, or "" if unknown
    cli_tool: str  # "gh", "glab", or "" if not available
    skipped: bool  # True when --skip-auth-check was used


def _handle_sigterm(signum: int, frame: object) -> None:
    """Handle SIGTERM for graceful shutdown in container/orchestrator environments."""
    logging.getLogger("codelicious").warning("Received SIGTERM (signal %d), shutting down gracefully", signum)
    raise SystemExit(143)


def _detect_platform(repo_path: Path) -> str:
    """Detect whether the repo's origin remote points to GitHub or GitLab.

    Returns "github", "gitlab", or "unknown".
    """
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            url = result.stdout.strip().lower()
            if "gitlab" in url:
                return "gitlab"
            if "github" in url:
                return "github"
    except (subprocess.TimeoutExpired, OSError):
        pass
    return "unknown"


def _run_auth_preflight(repo_path: Path, skip: bool = False) -> PreFlightResult:
    """Validate git hosting authentication at startup (spec-27 Phase 0.1).

    Checks that the user can push code and create PRs via ``gh`` (GitHub)
    or ``glab`` (GitLab).  If the CLI tool is installed but not
    authenticated, launches the interactive login flow so the credential
    is cached for the session (and beyond, via the tool's own store).

    When ``skip`` is True (``--skip-auth-check`` or ``GITHUB_TOKEN`` set),
    returns immediately without running checks — useful for CI.
    """
    _logger = logging.getLogger("codelicious")

    if skip:
        _logger.info("Auth pre-flight skipped (--skip-auth-check or CI token detected).")
        return PreFlightResult(platform="unknown", authenticated_user="", cli_tool="", skipped=True)

    platform = _detect_platform(repo_path)
    _logger.info("Detected platform: %s", platform)

    # ── GitLab path ──────────────────────────────────────────────
    if platform == "gitlab":
        if shutil.which("glab") is None:
            print(
                "Error: GitLab remote detected but `glab` CLI is not installed.\n"
                "  Install: https://gitlab.com/gitlab-org/cli#installation\n"
                "  Or use --skip-auth-check if auth is pre-provisioned.",
                file=sys.stderr,
            )
            sys.exit(1)

        try:
            auth_result = subprocess.run(
                ["glab", "auth", "status"],
                capture_output=True,
                text=True,
                timeout=15,
            )
        except subprocess.TimeoutExpired:
            _logger.warning("glab auth status timed out — continuing without auth verification.")
            return PreFlightResult(platform="gitlab", authenticated_user="", cli_tool="glab", skipped=False)

        if auth_result.returncode != 0:
            _logger.warning("glab is not authenticated. Launching interactive login...")
            print("\n  glab is installed but not authenticated.")
            print("  Please complete the login flow below to continue.\n")
            login_result = subprocess.run(["glab", "auth", "login"], timeout=300)
            if login_result.returncode != 0:
                print("Error: glab authentication failed. Cannot create MRs.", file=sys.stderr)
                sys.exit(1)
            # Re-check after login
            auth_result = subprocess.run(["glab", "auth", "status"], capture_output=True, text=True, timeout=15)

        # Extract username from auth status output
        user = ""
        for line in (auth_result.stdout + auth_result.stderr).splitlines():
            line_stripped = line.strip()
            if "Logged in" in line_stripped or "logged in" in line_stripped:
                # glab prints "Logged in to gitlab.com as USERNAME"
                parts = line_stripped.split(" as ")
                if len(parts) >= 2:
                    user = parts[-1].strip().rstrip(".")
                break

        _logger.info("Authenticated with GitLab as: %s", user or "(unknown)")
        return PreFlightResult(platform="gitlab", authenticated_user=user, cli_tool="glab", skipped=False)

    # ── GitHub path (default) ────────────────────────────────────
    if shutil.which("gh") is None:
        print(
            "Error: GitHub CLI (`gh`) is not installed.\n"
            "  Install: https://cli.github.com/\n"
            "  Or use --skip-auth-check if auth is pre-provisioned (e.g. GITHUB_TOKEN).",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        auth_result = subprocess.run(
            ["gh", "auth", "status"],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except subprocess.TimeoutExpired:
        _logger.warning("gh auth status timed out — continuing without auth verification.")
        return PreFlightResult(platform="github", authenticated_user="", cli_tool="gh", skipped=False)

    if auth_result.returncode != 0:
        _logger.warning("gh is not authenticated. Launching interactive login...")
        print("\n  gh is installed but not authenticated.")
        print("  Please complete the login flow below to continue.\n")
        login_result = subprocess.run(["gh", "auth", "login"], timeout=300)
        if login_result.returncode != 0:
            print("Error: gh authentication failed. Cannot create PRs.", file=sys.stderr)
            sys.exit(1)
        # Re-check after login
        auth_result = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True, timeout=15)

    # Extract username from gh auth status output
    # gh prints: "Logged in to github.com account USERNAME (keyring)"
    user = ""
    for line in (auth_result.stdout + auth_result.stderr).splitlines():
        line_stripped = line.strip()
        if "Logged in" in line_stripped or "logged in" in line_stripped:
            # Pattern: "Logged in to github.com account USER ..."
            if " account " in line_stripped:
                after_account = line_stripped.split(" account ", 1)[-1]
                user = after_account.split()[0].strip("()") if after_account else ""
            break

    _logger.info("Authenticated with GitHub as: %s", user or "(unknown)")
    return PreFlightResult(platform="github", authenticated_user=user, cli_tool="gh", skipped=False)


def _validate_dependencies(engine_name: str) -> str:
    """Validate external dependencies at startup (spec-18 Phase 4: SV-1, SV-2, SV-3).

    Returns the effective engine name (may change from "auto" to "huggingface"
    if claude is not found).
    """
    _logger = logging.getLogger("codelicious")

    # SV-1: git is always required
    if shutil.which("git") is None:
        print("Error: git is required but not found on PATH. Install git and try again.", file=sys.stderr)
        sys.exit(1)

    # SV-2: claude binary check
    if engine_name in ("claude", "auto") and shutil.which("claude") is None:
        if engine_name == "claude":
            print(
                "Error: claude binary not found on PATH. Install Claude Code CLI and try again.",
                file=sys.stderr,
            )
            sys.exit(1)
        else:
            _logger.info("claude binary not found, falling back to HuggingFace engine")
            engine_name = "huggingface"

    # SV-3: HF token check
    if engine_name == "huggingface":
        hf_token = os.environ.get("HF_TOKEN", "") or os.environ.get("LLM_API_KEY", "")
        if not hf_token:
            print(
                "Error: HF_TOKEN or LLM_API_KEY environment variable is required for HuggingFace engine.\n"
                "Get a token at https://huggingface.co/settings/tokens",
                file=sys.stderr,
            )
            sys.exit(1)
        if not hf_token.startswith("hf_"):
            _logger.warning("HF_TOKEN does not start with 'hf_' -- this may not be a valid HuggingFace token")

    return engine_name


def setup_logger():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    # Attach SanitizingFilter to root logger and each of its handlers to ensure
    # third-party library secrets are redacted at both the logger and handler level (Finding 44)
    from codelicious.logger import SanitizingFilter

    root = logging.getLogger()
    root.addFilter(SanitizingFilter())
    for handler in logging.root.handlers:
        handler.addFilter(SanitizingFilter())
    return logging.getLogger("codelicious")


def _print_banner(repo_path: Path, engine_name: str, branch: str, all_specs, incomplete_specs):
    """Print a verbose startup banner with spec discovery summary."""
    total = len(all_specs)
    incomplete = len(incomplete_specs)
    complete = total - incomplete

    bar_width = 30
    filled = int(bar_width * complete / total) if total else 0
    bar = "\u2588" * filled + "\u2591" * (bar_width - filled)
    pct = (complete / total * 100) if total else 0

    print()
    print("=" * 64)
    print("  CODELICIOUS BUILD")
    print("=" * 64)
    print(f"  Project:  {repo_path}")
    print(f"  Engine:   {engine_name}")
    print(f"  Branch:   {branch}")
    print("-" * 64)
    print(f"  Specs found:      {total}")
    print(f"  Already complete: {complete}")
    print(f"  To build:         {incomplete}")
    print()
    print(f"  Progress: [{bar}] {pct:.0f}%")
    print()
    if incomplete_specs:

        def rel(p):
            return p.relative_to(repo_path) if p.is_relative_to(repo_path) else p

        print("  Specs to build:")
        for i, s in enumerate(incomplete_specs, 1):
            print(f"    {i}. {rel(s)}")
        print()
    print("=" * 64)
    print()


def _print_result(repo_path: Path, result, elapsed: float, initial_incomplete: int):
    """Print a verbose completion summary."""
    # Re-scan to see what's left using the same logic as discover_incomplete_specs
    all_specs = walk_for_specs(repo_path)
    remaining = []
    completed_now = []
    for path in all_specs:
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            has_unchecked = bool(UNCHECKED_RE.search(content))
            has_checked = bool(CHECKED_RE.search(content))
            if has_unchecked or not has_checked:
                remaining.append(path)
            else:
                completed_now.append(path)
        except OSError:
            pass

    total = len(all_specs)
    complete = len(completed_now)
    # Clamp to avoid negative numbers if new specs were added during the build
    built_this_run = max(0, initial_incomplete - len(remaining))

    bar_width = 30
    filled = int(bar_width * complete / total) if total else bar_width
    bar = "\u2588" * filled + "\u2591" * (bar_width - filled)
    pct = (complete / total * 100) if total else 100

    mins, secs = divmod(int(elapsed), 60)
    time_str = f"{mins}m {secs}s" if mins else f"{secs}s"

    print()
    print("=" * 64)
    if result.success:
        print("  BUILD COMPLETE")
    else:
        print("  BUILD FINISHED (with issues)")
    print("=" * 64)
    print(f"  Duration:       {time_str}")
    print(f"  Specs built:    {built_this_run}/{initial_incomplete}")
    print(f"  Total progress: {complete}/{total} specs complete")
    print()
    print(f"  Progress: [{bar}] {pct:.0f}%")
    print()
    if remaining:

        def rel(p):
            return p.relative_to(repo_path) if p.is_relative_to(repo_path) else p

        print("  Remaining specs:")
        for i, s in enumerate(remaining, 1):
            print(f"    {i}. {rel(s)}")
        print()
    if result.message:
        print(f"  Status: {result.message}")
        print()
    print("=" * 64)
    print()


def _parse_args(argv: list[str]) -> dict:
    """Parse CLI arguments into a config dict.

    Supports:
        codelicious <repo_path> [options]

    Options:
        --engine claude|huggingface|auto
        --model MODEL_NAME
        --agent-timeout SECONDS
        --spec PATH              Build a single spec file
        --dry-run                Plan only, no writes
        --max-commits-per-pr N   PR commit cap (default: 50, max: 100)
        --platform auto|github|gitlab
    """
    _USAGE = (
        "Usage: codelicious <repo_path> [--engine ENGINE] [--model MODEL]\n"
        "                              [--agent-timeout SECS] [--spec PATH]\n"
        "                              [--dry-run] [--max-commits-per-pr N]\n"
        "                              [--platform auto|github|gitlab]\n"
        "                              [--parallel N] [--skip-auth-check]"
    )

    args = argv[1:]
    opts: dict = {
        "repo_path": "",
        "engine": "",
        "model": "",
        "agent_timeout_s": 1800,
        "resume_session_id": "",
        "parallel": 1,
        "skip_auth_check": False,
        "dry_run": False,
        "spec": "",
        "max_commits_per_pr": 50,
        "platform": "auto",
    }

    # Flags that take a value
    _VALUE_FLAGS = {
        "--engine": "engine",
        "--model": "model",
        "--agent-timeout": "agent_timeout_s",
        "--resume": "resume_session_id",
        "--parallel": "parallel",
        "--spec": "spec",
        "--max-commits-per-pr": "max_commits_per_pr",
        "--platform": "platform",
    }

    # Integer-valued flags that need int() conversion
    _INT_KEYS = {"agent_timeout_s", "parallel", "max_commits_per_pr"}

    # Boolean flags that take no value
    _BOOL_FLAGS = {
        "--skip-auth-check": "skip_auth_check",
        "--dry-run": "dry_run",
    }

    i = 0
    while i < len(args):
        if args[i] in ("-V", "--version"):
            from codelicious import __version__

            print(f"codelicious {__version__}")
            sys.exit(0)
        elif args[i] in ("-h", "--help"):
            print(_USAGE)
            print()
            print("Point codelicious at a repo and it builds every spec to completion.")
            print("Discovers specs, chunks work, commits per chunk, creates PR.")
            print("One command. That's it.")
            print()
            print("Options:")
            print("  --engine ENGINE        Force engine: claude, huggingface, auto (default: auto)")
            print("  --model MODEL          Model name (e.g. claude-sonnet-4-20250514)")
            print("  --agent-timeout SECS   Max seconds per agent run (default: 1800)")
            print("  --spec PATH            Build a single spec file (skip discovery)")
            print("  --dry-run              Discover specs and print plan, no execution")
            print("  --max-commits-per-pr N PR commit cap (default: 50, max: 100)")
            print("  --platform PLATFORM    github, gitlab, or auto (default: auto)")
            print("  --parallel N           Concurrent agentic loops, HF engine only (default: 1)")
            print("  --skip-auth-check      Skip gh/glab auth validation (for CI with GITHUB_TOKEN)")
            print()
            print("Environment variables:")
            print("  CODELICIOUS_ENGINE           Same as --engine (CLI flag takes precedence)")
            print("  GITHUB_TOKEN                 Auto-skips auth check when set")
            sys.exit(0)
        elif args[i] in _BOOL_FLAGS:
            opts[_BOOL_FLAGS[args[i]]] = True
            i += 1
        elif args[i] in _VALUE_FLAGS and i + 1 < len(args):
            key = _VALUE_FLAGS[args[i]]
            value = args[i + 1]
            if key in _INT_KEYS:
                try:
                    value = int(value)
                except ValueError:
                    print(f"Error: {args[i]} requires an integer, got '{value}'")
                    sys.exit(2)
            opts[key] = value
            i += 2
        elif not args[i].startswith("-") and not opts["repo_path"]:
            opts["repo_path"] = args[i]
            i += 1
        else:
            print(f"Unknown argument: {args[i]}")
            print(_USAGE)
            sys.exit(2)

    if not opts["repo_path"]:
        print(_USAGE)
        sys.exit(2)

    # Env var fallback for engine
    if not opts["engine"]:
        opts["engine"] = os.environ.get("CODELICIOUS_ENGINE", "auto")

    # Validate --max-commits-per-pr range
    if not (1 <= opts["max_commits_per_pr"] <= 100):
        print(f"Error: --max-commits-per-pr must be between 1 and 100, got {opts['max_commits_per_pr']}")
        sys.exit(2)

    # Validate --platform
    if opts["platform"] not in ("auto", "github", "gitlab"):
        print(f"Error: --platform must be auto, github, or gitlab, got '{opts['platform']}'")
        sys.exit(2)

    return opts


def main():
    logger = setup_logger()

    # Register SIGTERM handler for graceful shutdown (spec-18 Phase 1: GS-1)
    signal.signal(signal.SIGTERM, _handle_sigterm)

    opts = _parse_args(sys.argv)

    repo_path = Path(opts["repo_path"]).resolve()
    if not repo_path.is_dir():
        logger.error("Repository path %s does not exist or is not a directory.", repo_path)
        sys.exit(1)

    logger.info("Starting Codelicious workflow in %s", repo_path)

    # 0. Validate external dependencies before anything else (spec-18 Phase 4)
    opts["engine"] = _validate_dependencies(opts["engine"])

    # 0.1: Auth pre-flight — validate gh/glab auth (spec-27 Phase 0.1)
    skip_auth = opts.get("skip_auth_check", False) or bool(os.environ.get("GITHUB_TOKEN"))
    preflight = _run_auth_preflight(repo_path, skip=skip_auth)
    logger.info(
        "Pre-flight: platform=%s, user=%s, cli=%s, skipped=%s",
        preflight.platform,
        preflight.authenticated_user or "(none)",
        preflight.cli_tool or "(none)",
        preflight.skipped,
    )

    # 1. Select build engine
    try:
        engine = select_engine(opts["engine"])
    except RuntimeError as e:
        logger.error(str(e))
        sys.exit(1)

    # 2. Initialize Git Orchestration
    git_manager = GitManager(repo_path)
    git_manager.verify_git_identity()  # spec-27 Phase 0.2
    git_manager.assert_safe_branch()

    # 3. Hydrate centralized cache context
    cache_manager = CacheManager(repo_path)
    cache_manager.load_cache()

    # 4. Discover specs and print startup banner
    # spec-27 Phase 1.1 / 1.2: --spec overrides discovery for a single file
    spec_override = opts.get("spec", "")
    if spec_override:
        spec_path = (repo_path / spec_override).resolve()
        if not spec_path.is_file():
            logger.error("Spec file not found: %s", spec_path)
            sys.exit(1)
        all_specs = [spec_path]
        incomplete_specs = [spec_path]  # Always treat the targeted spec as "to build"
        logger.info("Targeting single spec: %s", spec_path)
    else:
        # Walk the repo tree once and reuse the result so discover_incomplete_specs
        # does not repeat the filesystem traversal (Finding 25).
        all_specs = walk_for_specs(repo_path)
        incomplete_specs = discover_incomplete_specs(repo_path, all_specs=all_specs)

    _print_banner(repo_path, engine.name, git_manager.current_branch, all_specs, incomplete_specs)

    if not incomplete_specs:
        logger.info("Nothing to build — all specs are complete.")
        _print_result(
            repo_path,
            type("R", (), {"success": True, "message": "All specs already complete."})(),
            0.0,
            0,
        )
        sys.exit(0)

    # spec-27 Phase 1.1: --dry-run prints the plan and exits
    if opts.get("dry_run", False):
        print()
        print("[codelicious] DRY RUN — no changes will be made")
        print(f"[codelicious] Discovered {len(incomplete_specs)} incomplete spec(s)")
        for i, spec in enumerate(incomplete_specs, 1):
            rel = spec.relative_to(repo_path) if spec.is_relative_to(repo_path) else spec
            print(f"  {i}. {rel}")
            # Show unchecked tasks within each spec
            try:
                from codelicious.spec_discovery import UNCHECKED_RE as _uc_re

                content = spec.read_text(encoding="utf-8", errors="replace")
                tasks = _uc_re.findall(content)
                if tasks:
                    print(f"     ({len(tasks)} unchecked task(s))")
            except OSError:
                pass
        print()
        print(f"[codelicious] Max commits per PR: {opts.get('max_commits_per_pr', 50)}")
        print(f"[codelicious] Platform: {opts.get('platform', 'auto')}")
        print()
        sys.exit(0)

    initial_incomplete = len(incomplete_specs)
    build_start = time.monotonic()
    build_deadline = build_start + opts["agent_timeout_s"]

    try:
        # 5. Run the v2 chunk-based orchestration loop (spec-27 Phase 4.1)
        from codelicious.orchestrator import V2Orchestrator

        v2_orch = V2Orchestrator(
            repo_path=repo_path,
            git_manager=git_manager,
            engine=engine,
            max_commits_per_pr=opts.get("max_commits_per_pr", 50),
            model=opts.get("model", ""),
        )
        result = v2_orch.run(
            specs=incomplete_specs,
            deadline=build_deadline,
            push_pr=True,
        )

        elapsed = time.monotonic() - build_start
        _print_result(repo_path, result, elapsed, initial_incomplete)

        if result.success:
            logger.info("Build completed successfully. %s", result.message)
        else:
            logger.error("Build failed: %s", result.message)
            sys.exit(1)

    except KeyboardInterrupt:
        elapsed = time.monotonic() - build_start
        logger.warning("\nExecution interrupted by user after %.1fs.", elapsed)
        sys.exit(130)
    except Exception as e:
        logger.exception("Fatal unhandled error in Codelicious core: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
