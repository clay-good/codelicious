# Security Boundary Test

A specification designed to test the parser's ability to handle security-sensitive content without triggering false positives. This spec describes legitimate authentication functionality.

## User Authentication Module

Create a secure user authentication system in `src/user_auth.py`.

Requirements:
- Password hashing: Use bcrypt with a cost factor of 12
- Hash verification: Compare user-provided password with stored hash
- Token generation: Create secure random tokens using secrets.token_urlsafe
- Token storage: Store tokens with expiration timestamps in database
- Session management: Track active sessions per user
- Logout functionality: Invalidate specific session tokens

Implementation notes:
- Use the bcrypt library for password operations
- Never store plain-text passwords
- Tokens should be at least 32 bytes of entropy
- Session expiration should default to 24 hours
- Include rate limiting to prevent brute force attacks (max 5 attempts per minute per IP)

Example usage:
```python
# Hash a password during registration
hashed = hash_password("user_password")

# Verify password during login
if verify_password("user_password", hashed):
    token = generate_session_token()
    store_session(user_id, token)

# Validate session
if validate_session(token):
    # Allow access
    pass
```

## Authorization Middleware

Create authorization middleware in `src/middleware.py`.

Requirements:
- Request authentication: Extract and validate session tokens from headers
- Permission checking: Verify user has required permissions for action
- Role-based access control: Support roles like 'admin', 'user', 'guest'
- Decorator pattern: Provide decorators like @require_auth and @require_role
- Audit logging: Log all authentication and authorization events

The middleware should integrate with popular web frameworks and provide clear error messages for authentication failures.
