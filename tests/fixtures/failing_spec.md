# Intentional Failure Test

This specification is designed to produce code with syntax errors for testing error handling and recovery mechanisms.

## Broken Syntax Module

Create a Python file at `src/broken.py` with the following intentional syntax error:

Requirements:
- Define a function called `incomplete_function` that accepts two parameters: name and age
- Inside the function, print a message using an f-string
- **Important**: The function definition should be missing the closing parenthesis
- For example: `def incomplete_function(name, age:`
- Include a docstring that describes what the function should do
- This will cause a SyntaxError when Python tries to parse the file

The purpose of this module is to test the verifier's ability to detect syntax errors during the build process and trigger appropriate error handling and retry logic.
