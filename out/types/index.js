"use strict";
/**
 * Core type definitions for Codelicious
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssueCategory = exports.IssueSeverity = exports.DependencyType = exports.CacheLevel = exports.ModelProvider = exports.ChunkType = exports.SymbolKind = exports.IndexingPhase = void 0;
// Indexing types
var IndexingPhase;
(function (IndexingPhase) {
    IndexingPhase["BASIC"] = "basic";
    IndexingPhase["STRUCTURE"] = "structure";
    IndexingPhase["SEMANTIC"] = "semantic";
    IndexingPhase["DEEP"] = "deep";
    IndexingPhase["CONTINUOUS"] = "continuous";
})(IndexingPhase || (exports.IndexingPhase = IndexingPhase = {}));
var SymbolKind;
(function (SymbolKind) {
    SymbolKind["FILE"] = "file";
    SymbolKind["MODULE"] = "module";
    SymbolKind["NAMESPACE"] = "namespace";
    SymbolKind["PACKAGE"] = "package";
    SymbolKind["CLASS"] = "class";
    SymbolKind["METHOD"] = "method";
    SymbolKind["PROPERTY"] = "property";
    SymbolKind["FIELD"] = "field";
    SymbolKind["CONSTRUCTOR"] = "constructor";
    SymbolKind["ENUM"] = "enum";
    SymbolKind["INTERFACE"] = "interface";
    SymbolKind["FUNCTION"] = "function";
    SymbolKind["VARIABLE"] = "variable";
    SymbolKind["CONSTANT"] = "constant";
    SymbolKind["STRING"] = "string";
    SymbolKind["NUMBER"] = "number";
    SymbolKind["BOOLEAN"] = "boolean";
    SymbolKind["ARRAY"] = "array";
    SymbolKind["OBJECT"] = "object";
})(SymbolKind || (exports.SymbolKind = SymbolKind = {}));
var ChunkType;
(function (ChunkType) {
    ChunkType["LINE"] = "line";
    ChunkType["FUNCTION"] = "function";
    ChunkType["CLASS"] = "class";
    ChunkType["FILE"] = "file";
    ChunkType["MODULE"] = "module";
    ChunkType["COMMENT"] = "comment";
    ChunkType["DOCSTRING"] = "docstring";
    ChunkType["TEST"] = "test";
})(ChunkType || (exports.ChunkType = ChunkType = {}));
// Model types
var ModelProvider;
(function (ModelProvider) {
    ModelProvider["CLAUDE"] = "claude";
    ModelProvider["OPENAI"] = "openai";
    ModelProvider["GEMINI"] = "gemini";
    ModelProvider["LOCAL"] = "local";
})(ModelProvider || (exports.ModelProvider = ModelProvider = {}));
// Cache types
var CacheLevel;
(function (CacheLevel) {
    CacheLevel["L1_EXACT"] = "l1_exact";
    CacheLevel["L2_SEMANTIC"] = "l2_semantic";
    CacheLevel["L3_PARTIAL"] = "l3_partial";
    CacheLevel["L4_PERSISTENT"] = "l4_persistent";
})(CacheLevel || (exports.CacheLevel = CacheLevel = {}));
var DependencyType;
(function (DependencyType) {
    DependencyType["IMPORT"] = "import";
    DependencyType["CALL"] = "call";
    DependencyType["INHERITANCE"] = "inheritance";
    DependencyType["COMPOSITION"] = "composition";
})(DependencyType || (exports.DependencyType = DependencyType = {}));
var IssueSeverity;
(function (IssueSeverity) {
    IssueSeverity["ERROR"] = "error";
    IssueSeverity["WARNING"] = "warning";
    IssueSeverity["INFO"] = "info";
    IssueSeverity["HINT"] = "hint";
})(IssueSeverity || (exports.IssueSeverity = IssueSeverity = {}));
var IssueCategory;
(function (IssueCategory) {
    IssueCategory["SECURITY"] = "security";
    IssueCategory["PERFORMANCE"] = "performance";
    IssueCategory["MAINTAINABILITY"] = "maintainability";
    IssueCategory["STYLE"] = "style";
    IssueCategory["BUG"] = "bug";
})(IssueCategory || (exports.IssueCategory = IssueCategory = {}));
//# sourceMappingURL=index.js.map