"use strict";
/**
 * Multi-Agent System Types
 *
 * Defines the types and interfaces for the multi-agent AI system.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentTaskStatus = exports.AgentPriority = exports.AgentTaskType = exports.AgentRole = void 0;
/**
 * Agent roles in the system
 */
var AgentRole;
(function (AgentRole) {
    AgentRole["PRE_FILTER"] = "pre_filter";
    AgentRole["CODE_GENERATOR"] = "code_generator";
    AgentRole["SECURITY_REVIEWER"] = "security_reviewer";
    AgentRole["QUALITY_REVIEWER"] = "quality_reviewer";
    AgentRole["TESTING_VALIDATOR"] = "testing_validator";
    AgentRole["ORCHESTRATOR"] = "orchestrator";
})(AgentRole || (exports.AgentRole = AgentRole = {}));
/**
 * Agent task types
 */
var AgentTaskType;
(function (AgentTaskType) {
    AgentTaskType["OPTIMIZE_PROMPT"] = "optimize_prompt";
    AgentTaskType["GENERATE_CODE"] = "generate_code";
    AgentTaskType["REVIEW_SECURITY"] = "review_security";
    AgentTaskType["REVIEW_QUALITY"] = "review_quality";
    AgentTaskType["GENERATE_TESTS"] = "generate_tests";
    AgentTaskType["VALIDATE_TESTS"] = "validate_tests";
    AgentTaskType["ORCHESTRATE"] = "orchestrate";
})(AgentTaskType || (exports.AgentTaskType = AgentTaskType = {}));
/**
 * Agent task priority
 */
var AgentPriority;
(function (AgentPriority) {
    AgentPriority["LOW"] = "low";
    AgentPriority["MEDIUM"] = "medium";
    AgentPriority["HIGH"] = "high";
    AgentPriority["CRITICAL"] = "critical";
})(AgentPriority || (exports.AgentPriority = AgentPriority = {}));
/**
 * Agent task status
 */
var AgentTaskStatus;
(function (AgentTaskStatus) {
    AgentTaskStatus["PENDING"] = "pending";
    AgentTaskStatus["IN_PROGRESS"] = "in_progress";
    AgentTaskStatus["COMPLETED"] = "completed";
    AgentTaskStatus["FAILED"] = "failed";
    AgentTaskStatus["CANCELLED"] = "cancelled";
})(AgentTaskStatus || (exports.AgentTaskStatus = AgentTaskStatus = {}));
//# sourceMappingURL=types.js.map