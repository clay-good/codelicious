# Codelicious Architecture

## System Overview

Codelicious is built as a modular, layered system that provides progressive enhancement of capabilities while maintaining immediate usability.

## High-Level Architecture

```

 VS Code Extension

 User Interface Layer
 • Chat View (Webview)
 • Status Bar Indicator
 • Command Palette Integration

 ↓

 Extension Manager (Core)
 • Lifecycle Management
 • Component Coordination
 • Progressive Initialization

 ↓

 Service Layer

 Indexing Embedding Models
 Engine Manager Orchestr.

 Cache Execution Session
 Manager Engine Manager

 ↓

 Infrastructure Layer
 • Configuration Manager
 • Secure Storage (API Keys)
 • File System Watcher

 ↓

 External Services

 Python ChromaDB AI Models
 Embedding Vector (Claude,
 Server Database GPT, etc.)

```

## Component Details

### 1. Extension Manager

**Purpose**: Central orchestrator for all subsystems

**Responsibilities**:
- Initialize components in correct order
- Manage lifecycle (activation, deactivation)
- Coordinate between subsystems
- Handle progressive capability unlocking
- Manage file watchers

**Key Methods**:
- `initialize()` - Start all subsystems
- `dispose()` - Clean up resources
- `getModelOrchestrator()` - Access AI models
- `getExecutionEngine()` - Access command execution

### 2. Indexing Engine

**Purpose**: Progressive code understanding

**Phases**:
1. **Basic (0-5s)**: File structure, project type
2. **Structure (5-30s)**: Symbols, imports, exports
3. **Semantic (30s-2m)**: Embeddings, relationships
4. **Deep (2-5m)**: Security, metrics, profiling
5. **Continuous**: Real-time updates

**Key Features**:
- Non-blocking background processing
- Incremental updates on file changes
- Priority queue for important files
- Memory-efficient streaming

### 3. Embedding Manager

**Purpose**: Generate and manage code embeddings

**Architecture**:
```
TypeScript Extension
 ↓
 HTTP Request
 ↓
Python Embedding Server
 ↓
Sentence-Transformers
 ↓
 Embeddings
 ↓
 ChromaDB
```

**Features**:
- Local embedding generation
- Hierarchical embeddings (line → function → file)
- Code-aware chunking
- Batch processing
- Caching

### 4. Model Orchestrator

**Purpose**: Unified interface to AI models

**Supported Providers**:
- Claude (Anthropic)
- GPT-4 (OpenAI)
- Gemini (Google)
- Local models

**Features**:
- Intelligent routing based on task
- Automatic fallback on failure
- Cost tracking and limits
- Context window management
- Streaming responses

**Routing Logic**:
```
Complex reasoning → Claude Opus
Simple generation → Claude Sonnet / GPT-3.5
Large context → Gemini
Privacy sensitive → Local models
```

### 5. Cache Manager

**Purpose**: Multi-layer caching for performance

**Cache Levels**:
1. **L1 (Exact)**: In-memory, <10ms
2. **L2 (Semantic)**: Similarity-based, <50ms
3. **L3 (Partial)**: Composable results, <100ms
4. **L4 (Persistent)**: Disk-based, historical

**Features**:
- Semantic similarity matching
- Automatic invalidation
- Predictive warming
- LRU eviction with frequency weighting

### 6. Execution Engine

**Purpose**: Safe command execution

**Features**:
- Sandboxed execution
- Command sanitization
- Timeout protection
- Output capture (stdout, stderr)
- Error recovery
- Project type detection

**Safety Measures**:
- Workspace boundary enforcement
- Confirmation for destructive ops
- Resource limits
- Command injection protection

### 7. Session Manager

**Purpose**: Maintain conversation context

**Features**:
- Complete session persistence
- Snapshots at decision points
- Rollback capability
- Workspace change detection
- Context rebuilding
- Multi-window sync

**Storage**:
```
.codelicious/
 sessions/
 {session-id}/
 state.json
 snapshots/
 messages.json
```

### 8. RAG Pipeline

**Purpose**: Retrieve relevant code context

**Pipeline Stages**:
```
Query
 ↓
Vector Search (top 50)
 ↓
Cross-Encoder Re-ranking
 ↓
MMR Diversity Sampling
 ↓
BM25 Keyword Matching
 ↓
Context Assembly
 ↓
Token Limit Enforcement
 ↓
Final Context
```

**Specialized Retrievers**:
- Error patterns for debugging
- Similar implementations
- Related tests
- Documentation

## Data Flow

### User Query Flow

```
1. User types in chat
 ↓
2. Chat View → Extension Manager
 ↓
3. Session Manager (save message)
 ↓
4. Cache Manager (check cache)
 ↓
5. RAG Pipeline (retrieve context)
 ↓
6. Model Orchestrator (select model)
 ↓
7. AI Provider (generate response)
 ↓
8. Cache Manager (store result)
 ↓
9. Session Manager (save response)
 ↓
10. Chat View (display to user)
```

### Indexing Flow

```
1. File change detected
 ↓
2. FileSystemWatcher event
 ↓
3. Indexing Engine (queue file)
 ↓
4. Worker Thread (process file)
 ↓
5. AST Parser (extract symbols)
 ↓
6. Embedding Manager (generate embeddings)
 ↓
7. ChromaDB (store vectors)
 ↓
8. Status Bar (update progress)
```

## Progressive Enhancement

Codelicious provides immediate utility while building deeper understanding:

**Immediate (0s)**:
- Chat interface available
- Basic file awareness
- Command execution

**Quick (5s)**:
- File structure mapped
- Project type detected
- Basic completions

**Medium (30s)**:
- Symbols extracted
- Imports/exports mapped
- Context-aware suggestions

**Deep (2m)**:
- Embeddings generated
- Semantic search enabled
- Full RAG pipeline active

**Continuous**:
- Real-time updates
- Pattern learning
- Performance optimization

## Security Architecture

### API Key Storage
```
VS Code Secrets API
 ↓
Encrypted Storage
 ↓
Never logged or exposed
```

### Command Execution
```
User Request
 ↓
Sanitization
 ↓
Sandbox Check
 ↓
Confirmation (if destructive)
 ↓
Execution
 ↓
Output Capture
```

### File Access
```
Request
 ↓
Path Validation
 ↓
Workspace Boundary Check
 ↓
Permission Check
 ↓
Access Granted/Denied
```

## Performance Optimizations

1. **Lazy Loading**: Components load on-demand
2. **Worker Threads**: CPU-intensive tasks off main thread
3. **Streaming**: Large data processed incrementally
4. **Caching**: Multiple layers for sub-100ms responses
5. **Batching**: Group similar operations
6. **Debouncing**: Reduce redundant operations

## Extensibility

### Adding a New AI Provider

1. Create adapter in `src/models/adapters/`
2. Implement `ModelAdapter` interface
3. Register in `ModelOrchestrator`
4. Add configuration options

### Adding a New Language

1. Add Tree-sitter grammar
2. Update language detection
3. Add language-specific chunking
4. Update symbol extraction

### Adding a New Cache Layer

1. Implement `CacheLayer` interface
2. Add to `CacheManager`
3. Configure eviction policy
4. Update cache statistics

## Deployment Architecture

```
Development:
 VS Code Extension Host
 ↓
 Local Extension Instance
 ↓
 Local Embedding Server

Production:
 VS Code
 ↓
 Installed Extension
 ↓
 Optional: Local Embedding Server
 Optional: Cloud AI Providers
```

## Monitoring & Observability

- Status bar for indexing progress
- Cost tracking for AI usage
- Cache hit rate monitoring
- Performance metrics
- Error logging
- Usage analytics (opt-in)

## Future Architecture Considerations

1. **Distributed Caching**: Share cache across team
2. **Cloud Sync**: Sync sessions across devices
3. **Plugin System**: Third-party extensions
4. **Multi-Workspace**: Handle multiple projects
5. **GPU Acceleration**: For local models
6. **Federated Learning**: Improve without sharing code

