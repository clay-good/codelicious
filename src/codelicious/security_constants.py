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
    }
)
