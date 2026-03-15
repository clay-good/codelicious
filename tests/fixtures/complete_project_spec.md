# Complete Project Spec: Task Tracker API

A RESTful API for tracking tasks and projects. This spec covers all five core modules.

## 1. Data Models

Define the core data models for the task tracker application.

Create `src/models.py` with:
- `Task` dataclass with fields: id (str), title (str), description (str), status (str), created_at (str)
- `Project` dataclass with fields: id (str), name (str), tasks (list[Task])
- `TaskStatus` enum with values: PENDING, IN_PROGRESS, DONE, CANCELLED
- Both dataclasses should have `to_dict()` and `from_dict()` class methods

## 2. Storage Layer

Implement file-based JSON storage for tasks and projects.

Create `src/storage.py` with:
- `Storage` class that reads/writes JSON files in a data/ directory
- `save_task(task: Task) -> None` method
- `load_task(task_id: str) -> Task` method that raises `KeyError` if not found
- `list_tasks(project_id: str | None = None) -> list[Task]` method
- `save_project(project: Project) -> None` method
- `load_project(project_id: str) -> Project` method
- Thread-safe writes using a lock

## 3. Business Logic Service

Implement the core business logic for task management.

Create `src/service.py` with:
- `TaskService` class that wraps `Storage`
- `create_task(title: str, description: str, project_id: str | None = None) -> Task`
- `update_status(task_id: str, status: TaskStatus) -> Task`
- `get_task(task_id: str) -> Task`
- `list_tasks(project_id: str | None = None) -> list[Task]`
- All methods should validate inputs and raise `ValueError` on invalid data

## 4. HTTP API Routes

Implement JSON HTTP endpoints for the task tracker.

Create `src/routes.py` with:
- `handle_request(method: str, path: str, body: str) -> tuple[int, str]` function
- Routes: GET /tasks, POST /tasks, GET /tasks/{id}, PATCH /tasks/{id}/status
- Returns (status_code, json_response_body) tuples
- Handle 404 for unknown tasks, 400 for invalid input, 200/201 for success

## 5. Unit Tests

Write comprehensive unit tests for all modules.

Create `tests/test_models.py`, `tests/test_storage.py`, `tests/test_service.py`, `tests/test_routes.py` with:
- At least 3 test cases per module
- Test happy paths and error cases
- Use pytest and tmp_path fixture for storage tests
- Mock the storage layer in service tests
