/**
 * Query Expansion System
 *
 * Expands user queries to improve retrieval by:
 * - Adding synonyms and related terms
 * - Expanding abbreviations
 * - Adding programming language specific terms
 * - Using semantic similarity
 * - Learning from user feedback
 */

export interface ExpandedQuery {
 original: string;
 expanded: string[];
 synonyms: string[];
 relatedTerms: string[];
 abbreviations: Map<string, string>;
 confidence: number;
}

export interface ExpansionStrategy {
 useSynonyms: boolean;
 useAbbreviations: boolean;
 useRelatedTerms: boolean;
 useSemanticExpansion: boolean;
 maxExpansions: number;
}

export class QueryExpansion {
 private synonymMap: Map<string, string[]>;
 private abbreviationMap: Map<string, string>;
 private relatedTermsMap: Map<string, string[]>;
 private feedbackHistory: Map<string, number>;

 constructor() {
 this.synonymMap = new Map();
 this.abbreviationMap = new Map();
 this.relatedTermsMap = new Map();
 this.feedbackHistory = new Map();
 this.initializeMaps();
 }

 /**
 * Expand a query
 */
 expand(query: string, strategy: ExpansionStrategy = this.getDefaultStrategy()): ExpandedQuery {
 const expanded: string[] = [query];
 const synonyms: string[] = [];
 const relatedTerms: string[] = [];
 const abbreviations = new Map<string, string>();

 const tokens = this.tokenize(query);

 for (const token of tokens) {
 const tokenLower = token.toLowerCase();

 // Expand abbreviations
 if (strategy.useAbbreviations && this.abbreviationMap.has(tokenLower)) {
 const fullForm = this.abbreviationMap.get(tokenLower)!;
 abbreviations.set(token, fullForm);
 expanded.push(query.replace(token, fullForm));
 }

 // Add synonyms
 if (strategy.useSynonyms && this.synonymMap.has(tokenLower)) {
 const syns = this.synonymMap.get(tokenLower)!;
 synonyms.push(...syns);
 for (const syn of syns.slice(0, 2)) {
 expanded.push(query.replace(token, syn));
 }
 }

 // Add related terms
 if (strategy.useRelatedTerms && this.relatedTermsMap.has(tokenLower)) {
 const related = this.relatedTermsMap.get(tokenLower)!;
 relatedTerms.push(...related);
 }
 }

 // Semantic expansion
 if (strategy.useSemanticExpansion) {
 const semantic = this.semanticExpansion(query);
 expanded.push(...semantic);
 }

 // Limit expansions
 const limitedExpanded = expanded.slice(0, strategy.maxExpansions);

 // Calculate confidence based on feedback
 const confidence = this.calculateConfidence(query);

 return {
 original: query,
 expanded: limitedExpanded,
 synonyms,
 relatedTerms,
 abbreviations,
 confidence
 };
 }

 /**
 * Add feedback for query expansion
 */
 addFeedback(query: string, wasHelpful: boolean): void {
 const current = this.feedbackHistory.get(query) || 0;
 this.feedbackHistory.set(query, current + (wasHelpful ? 1 : -1));
 }

 /**
 * Learn new synonym
 */
 learnSynonym(term: string, synonym: string): void {
 const termLower = term.toLowerCase();
 const existing = this.synonymMap.get(termLower) || [];
 if (!existing.includes(synonym)) {
 existing.push(synonym);
 this.synonymMap.set(termLower, existing);
 }
 }

 /**
 * Learn new abbreviation
 */
 learnAbbreviation(abbr: string, fullForm: string): void {
 this.abbreviationMap.set(abbr.toLowerCase(), fullForm);
 }

 /**
 * Tokenize query
 */
 private tokenize(query: string): string[] {
 return query.split(/\s+/).filter(t => t.length > 0);
 }

 /**
 * Semantic expansion using patterns
 */
 private semanticExpansion(query: string): string[] {
 const expanded: string[] = [];
 const queryLower = query.toLowerCase();

 // Pattern: "how to X" -> "X implementation", "X example"
 if (queryLower.startsWith('how to ')) {
 const action = query.substring(7);
 expanded.push(`${action} implementation`);
 expanded.push(`${action} example`);
 expanded.push(`${action} tutorial`);
 }

 // Pattern: "X error" -> "X exception", "X bug", "X issue"
 if (queryLower.includes('error')) {
 expanded.push(query.replace(/error/gi, 'exception'));
 expanded.push(query.replace(/error/gi, 'bug'));
 expanded.push(query.replace(/error/gi, 'issue'));
 }

 // Pattern: "create X" -> "build X", "make X", "generate X"
 if (queryLower.includes('create')) {
 expanded.push(query.replace(/create/gi, 'build'));
 expanded.push(query.replace(/create/gi, 'make'));
 expanded.push(query.replace(/create/gi, 'generate'));
 }

 return expanded;
 }

 /**
 * Calculate confidence based on feedback
 */
 private calculateConfidence(query: string): number {
 const feedback = this.feedbackHistory.get(query) || 0;
 const confidence = 0.5 + (feedback * 0.1);
 return Math.max(0, Math.min(1, confidence));
 }

 /**
 * Get default strategy
 */
 private getDefaultStrategy(): ExpansionStrategy {
 return {
 useSynonyms: true,
 useAbbreviations: true,
 useRelatedTerms: true,
 useSemanticExpansion: true,
 maxExpansions: 10
 };
 }

 /**
 * Initialize maps with common programming terms
 */
 private initializeMaps(): void {
 // Synonyms
 this.synonymMap.set('function', ['method', 'procedure', 'routine', 'func']);
 this.synonymMap.set('method', ['function', 'procedure', 'routine']);
 this.synonymMap.set('class', ['type', 'object', 'struct']);
 this.synonymMap.set('variable', ['var', 'field', 'property', 'attribute']);
 this.synonymMap.set('parameter', ['param', 'argument', 'arg']);
 this.synonymMap.set('return', ['returns', 'output', 'result']);
 this.synonymMap.set('error', ['exception', 'bug', 'issue', 'problem']);
 this.synonymMap.set('create', ['build', 'make', 'generate', 'construct']);
 this.synonymMap.set('delete', ['remove', 'destroy', 'drop']);
 this.synonymMap.set('update', ['modify', 'change', 'edit', 'alter']);
 this.synonymMap.set('get', ['fetch', 'retrieve', 'obtain', 'read']);
 this.synonymMap.set('set', ['assign', 'write', 'store']);
 this.synonymMap.set('check', ['validate', 'verify', 'test']);
 this.synonymMap.set('handle', ['process', 'manage', 'deal with']);
 this.synonymMap.set('initialize', ['init', 'setup', 'start']);
 this.synonymMap.set('configure', ['config', 'setup', 'set up']);
 this.synonymMap.set('implement', ['code', 'write', 'develop']);
 this.synonymMap.set('fix', ['repair', 'resolve', 'correct']);
 this.synonymMap.set('optimize', ['improve', 'enhance', 'speed up']);
 this.synonymMap.set('refactor', ['restructure', 'reorganize', 'clean up']);

 // Abbreviations
 this.abbreviationMap.set('api', 'application programming interface');
 this.abbreviationMap.set('ui', 'user interface');
 this.abbreviationMap.set('db', 'database');
 this.abbreviationMap.set('auth', 'authentication');
 this.abbreviationMap.set('config', 'configuration');
 this.abbreviationMap.set('impl', 'implementation');
 this.abbreviationMap.set('util', 'utility');
 this.abbreviationMap.set('mgr', 'manager');
 this.abbreviationMap.set('svc', 'service');
 this.abbreviationMap.set('ctrl', 'controller');
 this.abbreviationMap.set('repo', 'repository');
 this.abbreviationMap.set('dto', 'data transfer object');
 this.abbreviationMap.set('orm', 'object relational mapping');
 this.abbreviationMap.set('crud', 'create read update delete');
 this.abbreviationMap.set('http', 'hypertext transfer protocol');
 this.abbreviationMap.set('json', 'javascript object notation');
 this.abbreviationMap.set('xml', 'extensible markup language');
 this.abbreviationMap.set('sql', 'structured query language');
 this.abbreviationMap.set('cli', 'command line interface');
 this.abbreviationMap.set('gui', 'graphical user interface');
 this.abbreviationMap.set('sdk', 'software development kit');
 this.abbreviationMap.set('ide', 'integrated development environment');
 this.abbreviationMap.set('ci', 'continuous integration');
 this.abbreviationMap.set('cd', 'continuous deployment');
 this.abbreviationMap.set('tdd', 'test driven development');
 this.abbreviationMap.set('bdd', 'behavior driven development');

 // Related terms
 this.relatedTermsMap.set('authentication', ['login', 'signin', 'auth', 'credentials', 'password', 'token']);
 this.relatedTermsMap.set('authorization', ['permissions', 'access', 'roles', 'rights']);
 this.relatedTermsMap.set('database', ['sql', 'query', 'table', 'schema', 'orm', 'migration']);
 this.relatedTermsMap.set('api', ['endpoint', 'route', 'request', 'response', 'rest', 'graphql']);
 this.relatedTermsMap.set('testing', ['test', 'spec', 'unit', 'integration', 'e2e', 'mock']);
 this.relatedTermsMap.set('error', ['exception', 'try', 'catch', 'throw', 'handling']);
 this.relatedTermsMap.set('async', ['promise', 'await', 'callback', 'concurrent']);
 this.relatedTermsMap.set('validation', ['validate', 'check', 'verify', 'sanitize']);
 this.relatedTermsMap.set('logging', ['log', 'logger', 'debug', 'trace', 'monitor']);
 this.relatedTermsMap.set('cache', ['caching', 'memoize', 'store', 'redis']);
 this.relatedTermsMap.set('security', ['secure', 'encrypt', 'hash', 'ssl', 'tls']);
 this.relatedTermsMap.set('performance', ['optimize', 'speed', 'benchmark', 'profile']);
 this.relatedTermsMap.set('deployment', ['deploy', 'release', 'publish', 'ci', 'cd']);
 this.relatedTermsMap.set('configuration', ['config', 'settings', 'environment', 'env']);
 this.relatedTermsMap.set('middleware', ['interceptor', 'filter', 'handler', 'pipeline']);
 }
}

