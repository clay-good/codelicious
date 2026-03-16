"""Entry point for running codelicious as a module via python -m codelicious."""

__all__: list[str] = []

import sys

from codelicious.cli import main

sys.exit(main())
