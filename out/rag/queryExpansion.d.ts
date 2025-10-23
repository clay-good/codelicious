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
export declare class QueryExpansion {
    private synonymMap;
    private abbreviationMap;
    private relatedTermsMap;
    private feedbackHistory;
    constructor();
    /**
    * Expand a query
    */
    expand(query: string, strategy?: ExpansionStrategy): ExpandedQuery;
    /**
    * Add feedback for query expansion
    */
    addFeedback(query: string, wasHelpful: boolean): void;
    /**
    * Learn new synonym
    */
    learnSynonym(term: string, synonym: string): void;
    /**
    * Learn new abbreviation
    */
    learnAbbreviation(abbr: string, fullForm: string): void;
    /**
    * Tokenize query
    */
    private tokenize;
    /**
    * Semantic expansion using patterns
    */
    private semanticExpansion;
    /**
    * Calculate confidence based on feedback
    */
    private calculateConfidence;
    /**
    * Get default strategy
    */
    private getDefaultStrategy;
    /**
    * Initialize maps with common programming terms
    */
    private initializeMaps;
}
//# sourceMappingURL=queryExpansion.d.ts.map