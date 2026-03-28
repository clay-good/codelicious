"""
Security constants for codelicious.

This module provides a single source of truth for security-related constants
used across multiple modules, including command_runner.py and verifier.py.

These constants are HARDCODED and not configurable via external files to
prevent the LLM agent from escalating its own permissions.
"""

# Shell metacharacters that enable injection/chaining.
# Blocking these prevents: cmd1 ; cmd2, cmd1 | cmd2, $(cmd), etc.
# This is the canonical superset used by both command_runner and verifier.
BLOCKED_METACHARACTERS: frozenset[str] = frozenset("|&;$`(){}><!")

# Dangerous commands that are NEVER allowed regardless of context.
# This includes:
# - System administration commands (rm, sudo, chmod, etc.)
# - Network listeners and data exfiltration tools (nc, curl, wget)
# - Interpreter binaries that could execute arbitrary code
DENIED_COMMANDS: frozenset[str] = frozenset(
    {
        # File/directory destruction
        "rm",
        "rmdir",
        # Privilege escalation
        "sudo",
        "su",
        # Permission modification
        "chmod",
        "chown",
        "chgrp",
        # Disk/filesystem operations
        "mkfs",
        "dd",
        "fdisk",
        "gdisk",
        "parted",
        "mount",
        "umount",
        "format",
        "diskpart",
        # Process termination
        "kill",
        "killall",
        "pkill",
        # System control
        "reboot",
        "shutdown",
        "halt",
        "poweroff",
        "init",
        # Firewall/network config
        "iptables",
        "nft",
        "ufw",
        # User/group management
        "useradd",
        "userdel",
        "usermod",
        "passwd",
        "groupadd",
        # Scheduled tasks
        "crontab",
        "at",
        # Network listeners/exfiltration
        "nc",
        "ncat",
        "socat",
        "curl",
        "wget",
        # Interpreter binaries (can execute arbitrary code via -c, -e, etc.)
        "python",
        "python2",
        "python3",
        "perl",
        "ruby",
        "node",
        "nodejs",
        "bash",
        "sh",
        "zsh",
        "fish",
        "dash",
        "csh",
        "tcsh",
        "ksh",
        "php",
        "lua",
        "Rscript",
        "julia",
        "pwsh",
        "powershell",
        # Alternative tool names that can bypass the denylist (Finding 39)
        # Environment / execution wrappers
        "env",
        "xargs",
        "nohup",
        "timeout",
        # Debuggers / tracers (can inject code into running processes)
        "strace",
        "ltrace",
        "gdb",
        # Container / package managers that spawn arbitrary environments
        "docker",
        "kubectl",
        "nix-shell",
        "flatpak",
        "snap",
        # Swiss-army-knife binary that bundles many POSIX tools
        "busybox",
        # Git is managed exclusively by the orchestrator; the agent must not run it
        "git",
        # Package managers / build tools that execute arbitrary code
        # make: executes arbitrary Makefile recipes
        "make",
        # pip/pip3: pip install runs setup.py / build hooks
        "pip",
        "pip3",
        # pipx: installs and runs packages in isolated environments
        "pipx",
        # npx: downloads and executes arbitrary npm packages
        "npx",
        # go: `go run` compiles and executes arbitrary Go source
        "go",
    }
)
