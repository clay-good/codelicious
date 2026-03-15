"""Entry point for running proxilion-build as a module via python -m proxilion_build."""

__all__: list[str] = []

import sys

from proxilion_build.cli import main

sys.exit(main())
