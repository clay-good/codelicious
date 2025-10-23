# Development Guide for Codelicious

This guide is for developers who want to contribute to or understand the Codelicious codebase.

## Architecture Overview

Codelicious follows a modular, layered architecture:

```

 User Interface Layer
 (Chat, Status Bar, Commands)

 ↓

 Extension Manager (Core)
 (Lifecycle, Coordination)

 ↓

 Service Layer

 Indexing Embedding Models

 Cache Execution Session

 ↓

 Infrastructure Layer
 (Storage, Config, Security)

```

## Core Components

### 1. Extension Manager (`src/core/extensionManager.ts`)

The central orchestrator that:
- Initializes all subsystems
- Manages lifecycle
- Coordinates between components
- Handles progressive capability unlocking

### 2. Indexing Engine (`src/core/indexer.ts`)

Responsible for:
- Progressive code indexing (5 phases)
- File watching and incremental updates
- Symbol extraction
- Dependency graph building

### 3. Embedding Manager (`src/embedding/embeddingManager.ts`)

Handles:
- Local embedding generation
- Communication with embedding server
- Hierarchical embeddings
- Vector storage in ChromaDB

### 4. Model Orchestrator (`src/models/orchestrator.ts`)

Manages:
- Multiple AI provider adapters
- Intelligent routing
- Cost tracking
- Automatic fallback
- Streaming responses

### 5. Cache Manager (`src/cache/cacheManager.ts`)

Implements:
- 4-layer caching (L1-L4)
- Semantic similarity matching
- Cache invalidation
- Predictive warming

### 6. Execution Engine (`src/core/executionEngine.ts`)

Provides:
- Sandboxed command execution
- Error recovery
- Timeout protection
- Output capture

### 7. Session Manager (`src/core/sessionManager.ts`)

Maintains:
- Conversation history
- Session snapshots
- Context preservation
- Resume capability

## Development Workflow

### Setting Up Development Environment

1. **Clone and install**
 ```bash
 git clone https://github.com/clay-good/reviewr.git
 cd codelicious
 npm install
 ```

2. **Open in VS Code**
 ```bash
 code .
 ```

3. **Start development**
 - Press `F5` to launch Extension Development Host
 - Make changes to the code
 - Reload the extension with `Cmd+R` (Mac) or `Ctrl+R` (Windows/Linux)

### Project Structure

```
codelicious/
 src/
 core/ # Core engine components
 extensionManager.ts
 indexer.ts
 executionEngine.ts
 sessionManager.ts
 configurationManager.ts
 secureStorage.ts
 embedding/ # Embedding and RAG
 embeddingManager.ts
 generator.ts
 vectordb.ts
 retrieval.ts
 models/ # AI model adapters
 orchestrator.ts
 abstraction.ts
 router.ts
 adapters/
 claude.ts
 openai.ts
 gemini.ts
 local.ts
 cache/ # Caching system
 cacheManager.ts
 semantic.ts
 lru.ts
 session.ts
 analysis/ # Code analysis
 ast.ts
 security.ts
 performance.ts
 ui/ # User interface
 chatViewProvider.ts
 statusBar.ts
 types/ # TypeScript types
 index.ts
 extension.ts # Entry point
 server/ # Python embedding server
 embedding_server.py
 start_server.sh
 test/ # Test files
 resources/ # Static resources
```

### Adding a New Feature

1. **Create a new branch**
 ```bash
 git checkout -b feature/your-feature
 ```

2. **Implement the feature**
 - Add types to `src/types/index.ts`
 - Create implementation files
 - Add tests in `__tests__` directories

3. **Write tests**
 ```bash
 npm run test:unit
 ```

4. **Update documentation**
 - Update README.md if needed
 - Add JSDoc comments
 - Update CHANGELOG.md

5. **Submit PR**
 - Push to your fork
 - Create pull request
 - Wait for review

### Testing

#### Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npm run test:unit -- configurationManager.test.ts

# Run with coverage
npm run coverage
```

#### Integration Tests

```bash
# Run integration tests
npm run test:integration
```

#### E2E Tests

```bash
# Run end-to-end tests
npm run test:e2e
```

### Debugging

#### Extension Debugging

1. Set breakpoints in VS Code
2. Press `F5` to start debugging
3. Extension runs in new window
4. Breakpoints hit in original window

#### Server Debugging

```bash
# Run server with debug logging
cd server
python3 -m pdb embedding_server.py
```

### Code Style

#### TypeScript

- Use TypeScript strict mode
- Add JSDoc comments for public APIs
- Use meaningful variable names
- Keep functions small and focused
- Follow existing patterns

Example:
```typescript
/**
 * Generate embeddings for the provided text
 * @param text - The text to embed
 * @returns Promise resolving to embedding vector
 */
async generateEmbedding(text: string): Promise<number[]> {
 // Implementation
}
```

#### Python

- Follow PEP 8
- Use type hints
- Add docstrings
- Keep functions focused

Example:
```python
def generate_embeddings(texts: List[str]) -> List[List[float]]:
 """
 Generate embeddings for multiple texts.

 Args:
 texts: List of texts to embed

 Returns:
 List of embedding vectors
 """
 # Implementation
```

### Performance Considerations

1. **Async Operations**
 - Use async/await for I/O operations
 - Don't block the main thread
 - Use worker threads for CPU-intensive tasks

2. **Memory Management**
 - Dispose resources properly
 - Use streaming for large data
 - Implement pagination

3. **Caching**
 - Cache expensive operations
 - Invalidate cache appropriately
 - Use semantic caching for similar queries

### Security Considerations

1. **API Keys**
 - Store in VS Code secrets
 - Never log or expose
 - Validate before use

2. **Command Execution**
 - Sanitize all inputs
 - Use sandboxing
 - Require confirmation for destructive ops

3. **File Access**
 - Respect workspace boundaries
 - Validate file paths
 - Handle permissions errors

## Release Process

1. **Update version**
 ```bash
 npm version patch|minor|major
 ```

2. **Update CHANGELOG.md**

3. **Build and test**
 ```bash
 npm run build
 npm test
 ```

4. **Package extension**
 ```bash
 npm run package
 ```

5. **Create release**
 - Tag in git
 - Create GitHub release
 - Upload .vsix file

## Useful Commands

```bash
# Development
npm run watch # Watch mode for development
npm run compile # Compile TypeScript
npm run lint # Run linter
npm run build # Production build

# Testing
npm test # Run all tests
npm run coverage # Generate coverage report

# Packaging
npm run package # Create .vsix package
```

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Sentence-Transformers](https://www.sbert.net/)
- [ChromaDB](https://docs.trychroma.com/)

## Getting Help

- Check existing documentation
- Search closed issues
- Ask in discussions
- Join community chat

Happy coding!

