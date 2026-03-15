from setuptools import setup, find_packages

setup(
    name="codelicious",
    version="1.0.0",
    description="Outcome as a Service - Autonomous developer CLI powered by Open Weight HuggingFace models.",
    author="Codelicious Team",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    entry_points={
        "console_scripts": [
            "codelicious=codelicious.cli:main",
        ],
    },
    python_requires=">=3.9",
    install_requires=[
        # Zero-dependency core. We use standard library urllib and json.
    ],
)
