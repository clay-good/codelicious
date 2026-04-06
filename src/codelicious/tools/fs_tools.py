import logging
import os
from pathlib import Path
from typing import TypedDict

from codelicious.sandbox import Sandbox
from codelicious.errors import (
    PathTraversalError,
    SandboxViolationError,
)

logger = logging.getLogger("codelicious.fs_tools")


class ToolResponse(TypedDict):
    success: bool
    stdout: str
    stderr: str


class FSTooling:
    """
    Provides native Python FS manipulation tools meant strictly to replace shell commands
    like `ls` and `cat`. Operates strictly within a Sandbox, ensuring no path traversal escapes.
    """

    def __init__(self, repo_path: Path, cache_manager):
        self.repo_path = repo_path.resolve()
        self.cache_manager = cache_manager
        self.sandbox = Sandbox(self.repo_path)

    def native_read_file(self, rel_path: str) -> ToolResponse:
        """
        Safely reads a file using the sandbox's read_file() which includes
        post-read TOCTOU verification to prevent symlink-swap attacks.
        """
        try:
            content = self.sandbox.read_file(rel_path)
            return {"success": True, "stdout": content, "stderr": ""}
        except FileNotFoundError:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Error: '{rel_path}' is not a valid file.",
            }
        except PathTraversalError as e:
            return {"success": False, "stdout": "", "stderr": str(e)}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e)}

    def native_write_file(self, rel_path: str, content: str) -> ToolResponse:
        """
        Atomically writes file to the sandbox using os.replace to prevent TOCTOU races,
        and invalidates the local target in the .codelicious/cache.json map.

        All security checks (extension allowlist, denied patterns, size limits, count limits,
        symlink detection, TOCTOU mitigation) are delegated to Sandbox.write_file.
        """
        try:
            self.sandbox.write_file(rel_path, content)
            return {
                "success": True,
                "stdout": f"Successfully wrote {len(content)} bytes to {rel_path}.",
                "stderr": "",
            }
        except SandboxViolationError as e:
            # Return sandbox violations (path traversal, denied path, extension, size, count)
            # without leaking full traceback to the LLM
            return {"success": False, "stdout": "", "stderr": str(e)}
        except Exception as e:
            # Catch any other unexpected errors
            return {"success": False, "stdout": "", "stderr": str(e)}

    # Default limits for directory listing to prevent DoS via large directory trees
    DEFAULT_MAX_DEPTH = 10
    DEFAULT_MAX_ENTRIES = 5000

    def native_list_directory(
        self,
        rel_path: str = ".",
        max_depth: int | None = None,
        max_entries: int | None = None,
    ) -> ToolResponse:
        """
        Directory layout fetch with depth and entry limits.

        Excludes ignored patterns (.git, __pycache__, etc.).
        Enforces resource limits to prevent DoS via deeply nested or wide directories.
        Validates every yielded path against the sandbox boundary (S20-P2-2).

        Args:
            rel_path: Relative path to list (defaults to ".")
            max_depth: Maximum depth to traverse (default 10). Depth 0 is the target directory.
            max_entries: Maximum entries to return (default 5000). Includes truncation marker.
        """
        if max_depth is None:
            max_depth = self.DEFAULT_MAX_DEPTH
        if max_entries is None:
            max_entries = self.DEFAULT_MAX_ENTRIES

        try:
            # Use sandbox.resolve_path for consistent path validation
            target = self.sandbox.resolve_path(rel_path)

            if not target.is_dir():
                return {
                    "success": False,
                    "stdout": "",
                    "stderr": f"Error: '{rel_path}' is not a directory.",
                }

            ignored_dirs = {
                ".git",
                ".codelicious",
                "node_modules",
                "venv",
                "__pycache__",
                "dist",
                "build",
            }

            # Pre-compute the resolved repo prefix for sandbox boundary checks (S20-P2-2)
            repo_prefix = str(self.repo_path.resolve()) + os.sep

            tree_output: list[str] = []
            entry_count = 0
            truncated = False

            # followlinks=False prevents symlinks from escaping the sandbox (S20-P2-2)
            for root, dirs, files in os.walk(target, followlinks=False):
                # Validate the walk root against the sandbox boundary (S20-P2-2)
                resolved_root = Path(root).resolve()
                if not str(resolved_root).startswith(repo_prefix) and resolved_root != self.repo_path.resolve():
                    logger.debug("Skipping path outside sandbox: %s", root)
                    dirs[:] = []
                    continue

                # Calculate current depth relative to the target directory
                rel_root = Path(root).relative_to(target)
                current_depth = len(rel_root.parts)

                # Prune directories beyond max_depth
                if current_depth >= max_depth:
                    dirs[:] = []
                else:
                    dirs[:] = [d for d in dirs if d not in ignored_dirs]

                # Format relative path from repo_path for display
                display_rel = Path(root).relative_to(self.repo_path)
                level = len(display_rel.parts)
                indent = "  " * level

                folder_name = display_rel.name if display_rel.name else "."
                if folder_name != ".":
                    if entry_count >= max_entries:
                        truncated = True
                        break
                    tree_output.append(f"{indent}{folder_name}/")
                    entry_count += 1

                sub_indent = "  " * (level + 1)
                for f in files:
                    if entry_count >= max_entries:
                        truncated = True
                        break
                    # Validate individual file paths against sandbox (S20-P2-2)
                    file_resolved = (resolved_root / f).resolve()
                    if not str(file_resolved).startswith(repo_prefix):
                        logger.debug("Skipping file outside sandbox: %s", f)
                        continue
                    if not f.startswith("."):
                        tree_output.append(f"{sub_indent}{f}")
                        entry_count += 1

                if truncated:
                    break

            if truncated:
                tree_output.append("[truncated: max entries reached]")

            return {"success": True, "stdout": "\n".join(tree_output), "stderr": ""}

        except PathTraversalError as e:
            return {"success": False, "stdout": "", "stderr": str(e)}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e)}
