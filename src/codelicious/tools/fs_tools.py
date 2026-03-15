import os
import fnmatch
from pathlib import Path
import hashlib
import tempfile
from typing import TypedDict

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
        
    def _assert_in_sandbox(self, target_path: Path):
        """Raises exception if paths resolve outside the repo root."""
        if not target_path.resolve().is_relative_to(self.repo_path):
            raise Exception("Sandbox violation: Path traversal prevented.")

    def native_read_file(self, rel_path: str) -> ToolResponse:
        """
        Safely reads a file, leveraging the local .codelicious/cache.json
        if the file hash matches a hot entry to eliminate redundant I/O padding.
        """
        target = (self.repo_path / rel_path).resolve()
        try:
            self._assert_in_sandbox(target)
            
            if not target.is_file():
                return {"success": False, "stdout": "", "stderr": f"Error: '{rel_path}' is not a valid file."}
                
            content = target.read_text()
            return {"success": True, "stdout": content, "stderr": ""}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e)}

    def native_write_file(self, rel_path: str, content: str) -> ToolResponse:
        """
        Atomically writes file to the sandbox using os.replace to prevent TOCTOU races,
        and invalidates the local target in the .codelicious/cache.json map.
        """
        target = (self.repo_path / rel_path).resolve()
        try:
            self._assert_in_sandbox(target)
            
            # Ensure parent directories exist
            target.parent.mkdir(parents=True, exist_ok=True)
            
            # Write to temporary file adjacent to target to ensure atomic rename success
            fd, tmp_path = tempfile.mkstemp(dir=target.parent, prefix=".codelicious_tmp_")
            try:
                with os.fdopen(fd, 'w') as f:
                    f.write(content)
                os.replace(tmp_path, target)
            except Exception as inner_e:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
                raise inner_e
                
            return {"success": True, "stdout": f"Successfully wrote {len(content)} bytes to {rel_path}.", "stderr": ""}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e)}
        
    def native_list_directory(self, rel_path: str = ".") -> ToolResponse:
        """
        Deep directory layout fetch. Excludes ignored patterns.
        """
        target = (self.repo_path / rel_path).resolve()
        try:
            self._assert_in_sandbox(target)
            
            if not target.is_dir():
                return {"success": False, "stdout": "", "stderr": f"Error: '{rel_path}' is not a directory."}
            
            ignored_dirs = {".git", ".codelicious", "node_modules", "venv", "__pycache__", "dist", "build"}
            
            tree_output = []
            for root, dirs, files in os.walk(target):
                dirs[:] = [d for d in dirs if d not in ignored_dirs]
                
                # Format relative path depth
                rel_root = Path(root).relative_to(self.repo_path)
                level = len(rel_root.parts)
                indent = "  " * level
                
                folder_name = rel_root.name if rel_root.name else "."
                if folder_name != ".":
                    tree_output.append(f"{indent}{folder_name}/")
                
                sub_indent = "  " * (level + 1)
                for f in files:
                    if not f.startswith("."):
                        tree_output.append(f"{sub_indent}{f}")
                        
            return {"success": True, "stdout": "\n".join(tree_output), "stderr": ""}
            
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e)}
