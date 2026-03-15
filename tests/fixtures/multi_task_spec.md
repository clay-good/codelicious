# Multi-Task Integration Test

A comprehensive integration test specification that exercises task decomposition with dependencies, realistic module creation, and complex build workflows.

## Data Models

Create the core data models for the application in `src/models.py`.

Requirements:
- User model with fields: id (UUID), email (string, unique), created_at (datetime), is_active (boolean)
- Session model with fields: id (UUID), user_id (foreign key to User), token (string, unique), expires_at (datetime)
- Both models should inherit from a BaseModel with common timestamp fields
- Include proper validation and type hints
- Add __repr__ methods for debugging

Dependencies: None

## Database Layer

Implement the database connection and query layer in `src/database.py`.

Requirements:
- Connection pool management using a context manager
- CRUD operations for User model: create, get_by_id, get_by_email, update, delete
- CRUD operations for Session model: create, get_by_token, delete_expired
- Transaction support with rollback on error
- Proper connection cleanup and resource management
- Use parameterized queries to prevent SQL injection

Dependencies: Data Models

## API Endpoints

Create REST API endpoints in `src/api.py`.

Requirements:
- POST /users - Create a new user
- GET /users/{id} - Retrieve user by ID
- POST /auth/login - Create session and return token
- POST /auth/logout - Invalidate session token
- GET /auth/verify - Verify token is valid
- Proper HTTP status codes (200, 201, 400, 401, 404, 500)
- JSON request/response format
- Error handling with descriptive messages

Dependencies: Database Layer, Data Models

## Authentication

Implement authentication middleware in `src/auth.py`.

Requirements:
- Token generation using secure random values
- Token validation function that checks expiration
- Middleware decorator for protecting endpoints
- Password hashing using bcrypt or similar
- Session cleanup job to remove expired sessions
- Rate limiting for login attempts

Dependencies: Data Models, Database Layer

## Tests

Create comprehensive test suite in `tests/test_integration.py`.

Requirements:
- Unit tests for each model's validation logic
- Integration tests for database CRUD operations
- API endpoint tests with mock database
- Authentication flow tests (login, verify, logout)
- Edge cases: expired tokens, invalid inputs, database errors
- Use pytest fixtures for test data setup
- Achieve >80% code coverage

Dependencies: Data Models, Database Layer, API Endpoints, Authentication
