/**
 * Core type definitions for Codelicious
 */
export declare enum IndexingPhase {
    BASIC = "basic",
    STRUCTURE = "structure",
    SEMANTIC = "semantic",
    DEEP = "deep",
    CONTINUOUS = "continuous"
}
export interface IndexingProgress {
    phase: IndexingPhase;
    progress: number;
    filesProcessed: number;
    totalFiles: number;
    currentFile?: string;
    startTime: number;
    estimatedTimeRemaining?: number;
}
export interface FileMetadata {
    path: string;
    language: string;
    size: number;
    lastModified: number;
    hash: string;
    symbols: Symbol[];
    imports: string[];
    exports: string[];
}
export interface Symbol {
    name: string;
    kind: SymbolKind;
    range: Range;
    documentation?: string;
    signature?: string;
}
export declare enum SymbolKind {
    FILE = "file",
    MODULE = "module",
    NAMESPACE = "namespace",
    PACKAGE = "package",
    CLASS = "class",
    METHOD = "method",
    PROPERTY = "property",
    FIELD = "field",
    CONSTRUCTOR = "constructor",
    ENUM = "enum",
    INTERFACE = "interface",
    FUNCTION = "function",
    VARIABLE = "variable",
    CONSTANT = "constant",
    STRING = "string",
    NUMBER = "number",
    BOOLEAN = "boolean",
    ARRAY = "array",
    OBJECT = "object"
}
export interface Range {
    start: Position;
    end: Position;
}
export interface Position {
    line: number;
    character: number;
}
export interface Embedding {
    id: string;
    vector: number[];
    metadata: EmbeddingMetadata;
}
export interface EmbeddingMetadata {
    text?: string;
    source: string;
    language: string;
    type: string;
    timestamp: number;
    filePath?: string;
    startLine?: number;
    endLine?: number;
    symbolName?: string;
    symbolKind?: string;
}
export declare enum ChunkType {
    LINE = "line",
    FUNCTION = "function",
    CLASS = "class",
    FILE = "file",
    MODULE = "module",
    COMMENT = "comment",
    DOCSTRING = "docstring",
    TEST = "test"
}
export interface RetrievalResult {
    chunks: RetrievedChunk[];
    totalResults: number;
    retrievalTime: number;
}
export interface RetrievedChunk {
    id: string;
    text: string;
    metadata: EmbeddingMetadata;
    score: number;
    rerankedScore?: number;
}
export interface RetrievalContext {
    currentFile?: string;
    cursorPosition?: Position;
    recentEdits?: string[];
    query: string;
    maxResults?: number;
    includeTests?: boolean;
    includeDocs?: boolean;
}
export declare enum ModelProvider {
    CLAUDE = "claude",
    OPENAI = "openai",
    GEMINI = "gemini",
    LOCAL = "local"
}
export interface ModelConfig {
    provider: ModelProvider;
    model: string;
    apiKey?: string;
    maxTokens: number;
    temperature: number;
    contextWindow: number;
    costPerToken: number;
}
export interface ModelRequest {
    messages: Message[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export interface ModelResponse {
    content: string;
    model: string;
    usage: TokenUsage;
    cost: number;
    latency: number;
}
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
export declare enum CacheLevel {
    L1_EXACT = "l1_exact",
    L2_SEMANTIC = "l2_semantic",
    L3_PARTIAL = "l3_partial",
    L4_PERSISTENT = "l4_persistent"
}
export interface CacheEntry<T> {
    key: string;
    value: T;
    timestamp: number;
    hits: number;
    size: number;
    level: CacheLevel;
}
export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    totalSize: number;
    entryCount: number;
    evictions: number;
}
export interface ExecutionResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    duration: number;
    command: string;
}
export interface ExecutionContext {
    workingDirectory: string;
    environment: Record<string, string>;
    timeout: number;
    sandbox: boolean;
}
export interface Session {
    id: string;
    startTime: number;
    lastActivity: number;
    messages: Message[];
    context: SessionContext;
    snapshots: SessionSnapshot[];
}
export interface SessionContext {
    workspaceRoot: string;
    activeFiles: string[];
    recentEdits: FileEdit[];
    executionHistory: ExecutionResult[];
}
export interface SessionSnapshot {
    id: string;
    timestamp: number;
    description: string;
    state: SessionState;
}
export interface SessionState {
    messages: Message[];
    context: SessionContext;
    indexingProgress: IndexingProgress;
}
export interface FileEdit {
    file: string;
    timestamp: number;
    changes: TextChange[];
}
export interface TextChange {
    range: Range;
    text: string;
}
export interface CodeAnalysis {
    file: string;
    ast: ASTNode;
    symbols: Symbol[];
    dependencies: Dependency[];
    metrics: CodeMetrics;
    issues: CodeIssue[];
}
export interface ASTNode {
    type: string;
    range: Range;
    children: ASTNode[];
    metadata?: Record<string, any>;
}
export interface Dependency {
    source: string;
    target: string;
    type: DependencyType;
}
export declare enum DependencyType {
    IMPORT = "import",
    CALL = "call",
    INHERITANCE = "inheritance",
    COMPOSITION = "composition"
}
export interface CodeMetrics {
    linesOfCode: number;
    cyclomaticComplexity: number;
    maintainabilityIndex: number;
    technicalDebt: number;
}
export interface CodeIssue {
    severity: IssueSeverity;
    message: string;
    range: Range;
    category: IssueCategory;
    suggestion?: string;
}
export declare enum IssueSeverity {
    ERROR = "error",
    WARNING = "warning",
    INFO = "info",
    HINT = "hint"
}
export declare enum IssueCategory {
    SECURITY = "security",
    PERFORMANCE = "performance",
    MAINTAINABILITY = "maintainability",
    STYLE = "style",
    BUG = "bug"
}
export interface CodeliciousConfig {
    indexing: IndexingConfig;
    models: ModelsConfig;
    execution: ExecutionConfig;
    cache: CacheConfig;
    embeddingServer: EmbeddingServerConfig;
}
export interface IndexingConfig {
    progressive: boolean;
    background: boolean;
    maxMemory: string;
    excludePatterns?: string[];
}
export interface ModelsConfig {
    preferLocal: boolean;
    fallbackToCloud: boolean;
    costLimit: number;
    defaultProvider?: ModelProvider;
}
export interface ExecutionConfig {
    sandbox: boolean;
    timeout: number;
    requireConfirmation: boolean;
}
export interface CacheConfig {
    enabled: boolean;
    maxSize: string;
    ttl: number;
}
export interface EmbeddingServerConfig {
    url: string;
    timeout: number;
}
//# sourceMappingURL=index.d.ts.map