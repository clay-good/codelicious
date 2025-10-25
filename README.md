# Codelicious

A fully open-source AI development platform that transforms VS Code into an intelligent coding environment with world-class autonomous coding capabilities.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.74.0+-blue.svg)](https://code.visualstudio.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-1007%20passing-brightgreen.svg)](https://github.com/yourusername/codelicious)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Architecture](#architecture)
- [Development](#development)
- [Contributing](#contributing)
- [Performance](#performance)
- [Security](#security)
- [License](#license)

## Overview

Codelicious is a local-first AI coding assistant that prioritizes privacy, performance, and developer productivity. Built on advanced RAG (Retrieval-Augmented Generation) and semantic code understanding, it delivers context-aware assistance that truly understands your codebase.

### Why Codelicious?

- **Open Source**: Fully transparent, community-driven development
- **Privacy-First**: Local processing with optional cloud models
- **BYOK Model**: Bring Your Own Key - you control your AI providers
- **Production-Ready**: 1,007 passing tests, comprehensive validation
- **High Performance**: 4-8x faster indexing, 30% lower memory usage
- **World-Class**: Matches or exceeds GitHub Copilot, Cursor, and Replit Agent

## Features

### Autonomous Coding

- End-to-end feature implementation from specification to deployment
- Intelligent planning with dependency tracking and risk assessment
- Automatic test generation and validation
- Self-healing error recovery with pattern learning
- Multi-step refinement for production-quality code

### Advanced Context Understanding

- 200,000+ token context window for comprehensive codebase awareness
- Persistent codebase indexing with 5-phase progressive enhancement
- Architectural pattern detection and learning
- Semantic code search with hybrid RAG (vector + keyword + hierarchical)
- Cross-file relationship tracking and dependency analysis

### Multi-Model Support

- **Claude Sonnet 4/4.5** (recommended for code generation)
- **OpenAI GPT-4/GPT-4 Turbo** (excellent for complex reasoning)
- **Google Gemini 1.5 Pro/Flash** (cost-effective, fast)
- **Ollama** (local models for complete privacy)
- Intelligent model routing based on task complexity
- Automatic fallback and cost optimization

### Performance & Reliability

- Multi-layer caching (L1: Memory, L2: Disk, L3: Semantic)
- Sub-100ms response times for cached queries
- Progressive indexing (immediate utility, enhanced over time)
- Circuit breaker pattern for external service resilience
- Parallel processing with automatic CPU core detection
- Memory pressure monitoring with automatic cleanup
- Distributed processing for codebases with 100k+ files

### Developer Experience

- Inline code completion with multi-line suggestions
- Chat-driven development with rich code rendering
- Multi-file editing with dependency tracking
- Diff preview before applying changes
- Session persistence and resume capability
- Workflow visualization with real-time progress
- Terminal integration with command suggestions

## Installation

### Prerequisites

- **VS Code**: 1.74.0 or higher
- **Node.js**: 18+ and npm 8+
- **Python**: 3.8+ (for local embeddings)
- **Memory**: 8GB RAM minimum (16GB recommended for large codebases)
- **Storage**: 2GB free space for dependencies and cache

### Quick Start

1. **Clone the repository**
 ```bash
 git clone https://github.com/yourusername/codelicious.git
 cd codelicious
 ```

2. **Install dependencies**
 ```bash
 npm install
 pip install -r requirements.txt
 ```

3. **Build the extension**
 ```bash
 npm run build
 ```

4. **Install in VS Code**

 Development mode:
 ```bash
 # Open in VS Code and press F5
 code .
 ```

 Production install:
 ```bash
 npm run package
 code --install-extension ./dist/codelicious-0.1.0.vsix
 ```

5. **Start the embedding server** (optional, for local embeddings)
 ```bash
 cd server
 chmod +x start_server.sh
 ./start_server.sh
 ```

6. **Configure API keys**
 - Open VS Code Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`)
 - Run "Codelicious: Configure API Keys"
 - Enter your API keys for desired providers (Claude, OpenAI, Gemini, or Ollama)

## Quick Start

### First-Time Setup

1. **Open your project** in VS Code
2. **Build the index**: `Cmd+Shift+P` > "Codelicious: Build Context Index"
3. **Open chat**: `Cmd+Shift+L` (Mac) or `Ctrl+Shift+L` (Windows/Linux)
4. **Start coding**: Ask questions, request features, or get code suggestions

### Basic Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Open Chat | `Cmd/Ctrl+Shift+L` | Open the chat interface |
| Configure API Keys | Command Palette | Set up AI provider credentials |
| Build Index | Command Palette | Index your codebase for context |
| Show Index Status | Command Palette | View indexing progress |
| Generate Documentation | Command Palette | Auto-generate project docs |
| Analyze Code Quality | Command Palette | Run quality analysis |

### Example Queries

**Understanding Code:**
```
What does this project do?
Explain how authentication works in this codebase
Show me all API endpoints
```

**Code Generation:**
```
Add error handling to the API endpoints
Create a new user service with CRUD operations
Implement rate limiting middleware
```

**Refactoring:**
```
Refactor this function for better performance
Extract this logic into a reusable utility
Simplify this complex conditional
```

**Testing:**
```
Generate unit tests for this component
Add integration tests for the API
Create test fixtures for user data
```

**Documentation:**
```
Generate API documentation
Add JSDoc comments to this file
Create a README for this module
```
## Usage

See [USAGE_GUIDE.md](USAGE_GUIDE.md) for comprehensive usage documentation.

## Architecture

Codelicious follows a modular, layered architecture designed for performance, reliability, and extensibility.

### System Overview

```

 VS Code Extension

 User Interface Layer
 • Chat View (Webview)
 • Inline Completion Provider
 • Status Bar & Commands
 • Diff Preview & Workflow Visualization

 ↓

 Extension Manager (Core)
 • Lifecycle Management
 • Component Coordination
 • Progressive Initialization

 ↓

 Service Layer

 Indexing Embedding Models
 Engine Manager Orchestr.

 RAG Execution Session
 Service Engine Manager

 Cache Learning Agent
 Manager Manager Orchestr.

 ↓

 Infrastructure Layer
 • Secure Storage (API Keys)
 • File System Watcher
 • Configuration Manager
 • Performance Monitor

 ↓

 External Services
 • Claude API • OpenAI API
 • Gemini API • Ollama (Local)
 • ChromaDB (Vector Store)

```

### Core Components

#### 1. Indexing Engine
- **Progressive 5-phase indexing**: Basic → Structure → Semantic → Deep → Continuous
- **Parallel processing**: 4-8x faster with automatic CPU core detection
- **Incremental updates**: Real-time file watching and delta indexing
- **Memory-aware**: Automatic batch sizing based on available memory

#### 2. RAG Service
- **Hybrid retrieval**: Vector similarity + keyword search + hierarchical
- **Query expansion**: Automatic synonym and related term expansion
- **Re-ranking**: Semantic relevance scoring and diversity sampling (MMR)
- **Context assembly**: Intelligent chunking with overlap and relationship tracking

#### 3. Model Orchestrator
- **Multi-provider support**: Claude, OpenAI, Gemini, Ollama
- **Intelligent routing**: Task complexity-based model selection
- **Cost optimization**: Automatic fallback to cheaper models for simple tasks
- **Circuit breaker**: Automatic failover and retry with exponential backoff

#### 4. Cache Manager
- **L1 (Memory)**: Sub-millisecond access for hot data
- **L2 (Disk)**: Fast SSD-based persistence
- **L3 (Semantic)**: Vector similarity-based cache hits
- **Intelligent eviction**: LRU with semantic similarity scoring

#### 5. Agent Orchestrator
- **Multi-agent workflow**: Pre-filter, code generation, security review, testing
- **Parallel execution**: Concurrent agent operations where possible
- **Error recovery**: Automatic retry with context-aware fixes
- **Workflow visualization**: Real-time progress tracking

### Data Flow

1. **User Input** → Chat interface or inline completion
2. **Context Gathering** → RAG retrieval + file analysis + pattern matching
3. **Model Selection** → Complexity analysis + cost optimization
4. **Code Generation** → Multi-agent workflow with validation
5. **Quality Assurance** → Security scan + test generation + validation
6. **Delivery** → Diff preview + user approval + file writing

## Development

### Project Structure

```
codelicious/
 src/
 core/ # Core engine and orchestration
 indexer.ts # Progressive indexing engine
 parallelIndexer.ts # Parallel processing
 memoryPressureMonitor.ts # Memory management
 extensionManager.ts # Lifecycle management
 embedding/ # Embedding generation and chunking
 embeddingService.ts
 codeChunker.ts
 semanticAnalyzer.ts
 rag/ # RAG pipeline
 ragService.ts
 vectorStore.ts
 queryExpander.ts
 models/ # AI model adapters
 orchestrator.ts
 claudeAdapter.ts
 openaiAdapter.ts
 geminiAdapter.ts
 agents/ # Multi-agent system
 agentOrchestrator.ts
 preFilterAgent.ts
 securityAgent.ts
 testingAgent.ts
 generation/ # Code generation
 masterCodeGenerator.ts
 selfHealingGenerator.ts
 contextAwareGenerator.ts
 cache/ # Multi-layer caching
 cacheManager.ts
 semanticCache.ts
 utils/ # Utilities
 complexityAnalyzer.ts
 cacheKeyGenerator.ts
 asyncFileUtils.ts
 ui/ # User interface
 chatViewProvider.ts
 completionProvider.ts
 server/ # Python embedding server
 embedding_server.py
 start_server.sh
 scripts/ # Build and validation scripts
 __tests__/ # Test suites (1,007 tests)
```

### Development Setup

1. **Install dependencies**
 ```bash
 npm install
 pip install -r requirements.txt
 ```

2. **Run in development mode**
 ```bash
 # Open in VS Code
 code .

 # Press F5 to launch Extension Development Host
 ```

3. **Run tests**
 ```bash
 # All tests
 npm test

 # With coverage
 npm run test:coverage

 # Specific test file
 npm test -- src/core/__tests__/indexer.test.ts
 ```

4. **Build for production**
 ```bash
 npm run build
 npm run package
 ```

### Testing

Codelicious has comprehensive test coverage:

- **Unit Tests**: 850+ tests covering all core components
- **Integration Tests**: 100+ tests for system integration
- **Stress Tests**: 47 tests for performance validation
- **Total**: 1,007 passing tests (100% pass rate)

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run specific test suite
npm test -- --testPathPattern=indexer

# Run in watch mode
npm test -- --watch
```
## Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### How to Contribute

1. **Fork the repository** on GitHub
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** with clear, descriptive commits
4. **Add tests** for new functionality
5. **Run the test suite**: `npm test`
6. **Submit a pull request** with a clear description

### Development Guidelines

- Follow the existing code style and conventions
- Write comprehensive tests for new features
- Update documentation for API changes
- Keep commits atomic and well-described
- Ensure all tests pass before submitting PR

### Code Review Process

1. All PRs require at least one review
2. CI must pass (tests, linting, build)
3. Code coverage should not decrease
4. Documentation must be updated

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Performance

Codelicious is optimized for performance and efficiency:

### Indexing Performance

- **Speed**: 40+ files/sec (4-8x faster than sequential)
- **Method**: Parallel processing with automatic CPU core detection
- **Memory**: 30% lower peak usage with pressure monitoring
- **Scalability**: Handles codebases with 100k+ files

### Query Performance

- **Cache Hit Rate**: 70%+ (target: 85%+)
- **Response Time**: Sub-100ms for cached queries
- **RAG Retrieval**: <500ms for complex queries
- **Embedding Generation**: Batched and cached

### Resource Usage

- **Memory**: 350-560MB typical (was 500-800MB)
- **CPU**: Efficient parallel processing (75% core utilization)
- **Disk**: Intelligent caching with automatic cleanup
- **Network**: Minimal API calls with aggressive caching

### Optimization Techniques

- **Parallel Indexing**: Worker threads for large projects
- **Memory Pressure Monitoring**: Automatic cleanup under pressure
- **Async File I/O**: Non-blocking operations with descriptor pooling
- **Multi-Layer Caching**: L1 (Memory) + L2 (Disk) + L3 (Semantic)
- **Circuit Breaker**: Prevents cascading failures
- **Request Deduplication**: Eliminates redundant AI calls

## Security

Codelicious takes security seriously:

### API Key Storage

- **Secure Storage**: VS Code SecretStorage API with OS-level encryption
- **Key Rotation**: Support for automatic key rotation
- **Audit Logging**: Track all key access and usage
- **Migration**: Automatic migration from plain text configuration

### Code Execution

- **Sandboxed Execution**: Commands run in isolated environment
- **Confirmation Required**: Destructive operations require user approval
- **Path Validation**: Prevents path traversal attacks
- **Timeout Protection**: Automatic termination of long-running processes

### Security Scanning

- **Pattern Detection**: Identifies common vulnerabilities
 - eval() usage
 - Hardcoded secrets
 - SQL injection risks
 - XSS vulnerabilities
 - Command injection
- **Automatic Fixes**: Suggests secure alternatives
- **Best Practices**: Enforces security best practices

### Input Validation

- **File Size Limits**: Prevents memory exhaustion
- **Type Checking**: Strict TypeScript validation
- **Boundary Validation**: Checks all user inputs
- **Sanitization**: Cleans potentially dangerous input

### Privacy

- **Local-First**: All processing can be done locally
- **BYOK Model**: You control your API keys and data
- **No Telemetry**: No usage data sent to external servers
- **Open Source**: Fully transparent and auditable
