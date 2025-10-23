/**
 * Specification Parser
 *
 * Parses natural language specifications into structured requirements,
 * tasks, constraints, and dependencies.
 */

export interface ParsedSpecification {
 title: string;
 description: string;
 requirements: Requirement[];
 tasks: SpecTask[];
 constraints: Constraint[];
 dependencies: Dependency[];
 metadata: SpecMetadata;
}

export interface Requirement {
 id: string;
 type: RequirementType;
 description: string;
 priority: Priority;
 acceptance: string[];
 tags: string[];
}

export enum RequirementType {
 FUNCTIONAL = 'functional',
 NON_FUNCTIONAL = 'non-functional',
 TECHNICAL = 'technical',
 BUSINESS = 'business',
 SECURITY = 'security',
 PERFORMANCE = 'performance'
}

export interface SpecTask {
 id: string;
 name: string;
 description: string;
 type: TaskType;
 priority: Priority;
 estimatedTime: number; // minutes
 dependencies: string[]; // task IDs
 requirements: string[]; // requirement IDs
 files: string[]; // files to create/modify
 tests: string[]; // tests to create
}

export enum TaskType {
 CREATE = 'create',
 MODIFY = 'modify',
 DELETE = 'delete',
 REFACTOR = 'refactor',
 TEST = 'test',
 DOCUMENT = 'document',
 REVIEW = 'review'
}

export enum Priority {
 CRITICAL = 'critical',
 HIGH = 'high',
 MEDIUM = 'medium',
 LOW = 'low'
}

export interface Constraint {
 id: string;
 type: ConstraintType;
 description: string;
 value?: string;
}

export enum ConstraintType {
 TIME = 'time',
 BUDGET = 'budget',
 TECHNOLOGY = 'technology',
 COMPATIBILITY = 'compatibility',
 SECURITY = 'security',
 PERFORMANCE = 'performance',
 QUALITY = 'quality'
}

export interface Dependency {
 id: string;
 from: string; // task ID
 to: string; // task ID
 type: DependencyType;
}

export enum DependencyType {
 REQUIRES = 'requires',
 BLOCKS = 'blocks',
 RELATED = 'related'
}

export interface SpecMetadata {
 version: string;
 author?: string;
 created: number;
 updated: number;
 tags: string[];
 complexity: number; // 1-10
}

export class SpecificationParser {
 private workspaceRoot: string;

 constructor(workspaceRoot: string) {
 this.workspaceRoot = workspaceRoot;
 }

 /**
 * Parse a specification from text
 */
 async parse(text: string): Promise<ParsedSpecification> {
 const lines = text.split('\n');

 const title = this.extractTitle(lines);
 const description = this.extractDescription(lines);
 const requirements = this.extractRequirements(lines);
 const tasks = this.extractTasks(lines, requirements);
 const constraints = this.extractConstraints(lines);
 const dependencies = this.extractDependencies(lines, tasks);
 const metadata = this.generateMetadata(requirements, tasks, constraints);

 return {
 title,
 description,
 requirements,
 tasks,
 constraints,
 dependencies,
 metadata
 };
 }

 /**
 * Extract title from specification
 */
 private extractTitle(lines: string[]): string {
 // Look for markdown heading or first non-empty line
 for (const line of lines) {
 const trimmed = line.trim();
 if (trimmed.startsWith('# ')) {
 return trimmed.substring(2).trim();
 }
 if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
 return trimmed;
 }
 }
 return 'Untitled Specification';
 }

 /**
 * Extract description from specification
 */
 private extractDescription(lines: string[]): string {
 const descLines: string[] = [];
 let inDescription = false;

 for (const line of lines) {
 const trimmed = line.trim();

 // Skip title
 if (trimmed.startsWith('# ')) {
 inDescription = true;
 continue;
 }

 // Stop at first section
 if (trimmed.startsWith('## ')) {
 break;
 }

 if (inDescription && trimmed) {
 descLines.push(trimmed);
 }
 }

 return descLines.join(' ').trim() || 'No description provided';
 }

 /**
 * Extract requirements from specification
 */
 private extractRequirements(lines: string[]): Requirement[] {
 const requirements: Requirement[] = [];
 let inRequirements = false;
 let currentReq: Partial<Requirement> | null = null;

 for (const line of lines) {
 const trimmed = line.trim();

 // Check for requirements section
 if (trimmed.startsWith('##') && trimmed.toLowerCase().includes('requirement')) {
 inRequirements = true;
 continue;
 }

 // Stop at next section
 if (trimmed.startsWith('##') && !trimmed.toLowerCase().includes('requirement')) {
 if (currentReq) {
 requirements.push(this.finalizeRequirement(currentReq));
 currentReq = null;
 }
 inRequirements = false;
 continue;
 }

 if (inRequirements && trimmed) {
 // Numbered or bulleted requirement
 if (/^[\d\-\*]+\.?\s/.test(trimmed)) {
 if (currentReq) {
 requirements.push(this.finalizeRequirement(currentReq));
 }
 currentReq = {
 id: `req-${requirements.length + 1}`,
 description: trimmed.replace(/^[\d\-\*]+\.?\s/, ''),
 type: this.detectRequirementType(trimmed),
 priority: this.detectPriority(trimmed),
 acceptance: [],
 tags: []
 };
 } else if (currentReq && trimmed) {
 // Add to current requirement description
 currentReq.description += ' ' + trimmed;
 }
 }
 }

 if (currentReq) {
 requirements.push(this.finalizeRequirement(currentReq));
 }

 return requirements;
 }

 /**
 * Extract tasks from specification
 */
 private extractTasks(lines: string[], requirements: Requirement[]): SpecTask[] {
 const tasks: SpecTask[] = [];
 let inTasks = false;

 for (const line of lines) {
 const trimmed = line.trim();

 // Check for tasks section
 if (trimmed.startsWith('##') && (trimmed.toLowerCase().includes('task') || trimmed.toLowerCase().includes('step'))) {
 inTasks = true;
 continue;
 }

 // Stop at next section
 if (trimmed.startsWith('##') && !trimmed.toLowerCase().includes('task') && !trimmed.toLowerCase().includes('step')) {
 inTasks = false;
 continue;
 }

 if (inTasks && trimmed && /^[\d\-\*]+\.?\s/.test(trimmed)) {
 const taskDesc = trimmed.replace(/^[\d\-\*]+\.?\s/, '');
 tasks.push({
 id: `task-${tasks.length + 1}`,
 name: taskDesc.split(':')[0] || taskDesc,
 description: taskDesc,
 type: this.detectTaskType(taskDesc),
 priority: this.detectPriority(taskDesc),
 estimatedTime: this.estimateTime(taskDesc),
 dependencies: [],
 requirements: [],
 files: this.extractFiles(taskDesc),
 tests: []
 });
 }
 }

 return tasks;
 }

 /**
 * Extract constraints from specification
 */
 private extractConstraints(lines: string[]): Constraint[] {
 const constraints: Constraint[] = [];
 let inConstraints = false;

 for (const line of lines) {
 const trimmed = line.trim();

 if (trimmed.startsWith('##') && (trimmed.toLowerCase().includes('constraint') || trimmed.toLowerCase().includes('limitation'))) {
 inConstraints = true;
 continue;
 }

 if (trimmed.startsWith('##') && !trimmed.toLowerCase().includes('constraint') && !trimmed.toLowerCase().includes('limitation')) {
 inConstraints = false;
 continue;
 }

 if (inConstraints && trimmed && /^[\d\-\*]+\.?\s/.test(trimmed)) {
 const desc = trimmed.replace(/^[\d\-\*]+\.?\s/, '');
 constraints.push({
 id: `constraint-${constraints.length + 1}`,
 type: this.detectConstraintType(desc),
 description: desc
 });
 }
 }

 return constraints;
 }

 /**
 * Extract dependencies between tasks
 */
 private extractDependencies(lines: string[], tasks: SpecTask[]): Dependency[] {
 const dependencies: Dependency[] = [];

 // Analyze task descriptions for dependency keywords
 for (const task of tasks) {
 const desc = task.description.toLowerCase();

 // Look for "after", "before", "requires", "depends on"
 if (desc.includes('after') || desc.includes('requires') || desc.includes('depends')) {
 // Find referenced tasks
 for (const otherTask of tasks) {
 if (task.id !== otherTask.id && desc.includes(otherTask.name.toLowerCase())) {
 dependencies.push({
 id: `dep-${dependencies.length + 1}`,
 from: task.id,
 to: otherTask.id,
 type: DependencyType.REQUIRES
 });
 task.dependencies.push(otherTask.id);
 }
 }
 }
 }

 return dependencies;
 }

 // Helper methods

 private finalizeRequirement(req: Partial<Requirement>): Requirement {
 return {
 id: req.id || 'req-unknown',
 type: req.type || RequirementType.FUNCTIONAL,
 description: req.description || '',
 priority: req.priority || Priority.MEDIUM,
 acceptance: req.acceptance || [],
 tags: req.tags || []
 };
 }

 private detectRequirementType(text: string): RequirementType {
 const lower = text.toLowerCase();
 if (lower.includes('performance') || lower.includes('speed') || lower.includes('latency')) {
 return RequirementType.PERFORMANCE;
 }
 if (lower.includes('security') || lower.includes('auth') || lower.includes('permission')) {
 return RequirementType.SECURITY;
 }
 if (lower.includes('technical') || lower.includes('architecture')) {
 return RequirementType.TECHNICAL;
 }
 return RequirementType.FUNCTIONAL;
 }

 private detectTaskType(text: string): TaskType {
 const lower = text.toLowerCase();
 if (lower.includes('create') || lower.includes('add') || lower.includes('new')) {
 return TaskType.CREATE;
 }
 if (lower.includes('modify') || lower.includes('update') || lower.includes('change')) {
 return TaskType.MODIFY;
 }
 if (lower.includes('delete') || lower.includes('remove')) {
 return TaskType.DELETE;
 }
 if (lower.includes('refactor') || lower.includes('restructure')) {
 return TaskType.REFACTOR;
 }
 if (lower.includes('test')) {
 return TaskType.TEST;
 }
 if (lower.includes('document') || lower.includes('doc')) {
 return TaskType.DOCUMENT;
 }
 return TaskType.CREATE;
 }

 private detectPriority(text: string): Priority {
 const lower = text.toLowerCase();
 if (lower.includes('critical') || lower.includes('urgent') || lower.includes('must')) {
 return Priority.CRITICAL;
 }
 if (lower.includes('high') || lower.includes('important')) {
 return Priority.HIGH;
 }
 if (lower.includes('low') || lower.includes('nice to have')) {
 return Priority.LOW;
 }
 return Priority.MEDIUM;
 }

 private detectConstraintType(text: string): ConstraintType {
 const lower = text.toLowerCase();
 if (lower.includes('time') || lower.includes('deadline') || lower.includes('schedule')) {
 return ConstraintType.TIME;
 }
 if (lower.includes('budget') || lower.includes('cost')) {
 return ConstraintType.BUDGET;
 }
 if (lower.includes('technology') || lower.includes('stack') || lower.includes('framework')) {
 return ConstraintType.TECHNOLOGY;
 }
 if (lower.includes('security')) {
 return ConstraintType.SECURITY;
 }
 if (lower.includes('performance')) {
 return ConstraintType.PERFORMANCE;
 }
 return ConstraintType.QUALITY;
 }

 private estimateTime(text: string): number {
 const lower = text.toLowerCase();

 // Look for explicit time estimates
 const hourMatch = lower.match(/(\d+)\s*hour/);
 if (hourMatch) {
 return parseInt(hourMatch[1]) * 60;
 }

 const minMatch = lower.match(/(\d+)\s*min/);
 if (minMatch) {
 return parseInt(minMatch[1]);
 }

 // Estimate based on task type
 if (lower.includes('create') || lower.includes('implement')) {
 return 120; // 2 hours
 }
 if (lower.includes('modify') || lower.includes('update')) {
 return 60; // 1 hour
 }
 if (lower.includes('test')) {
 return 30; // 30 minutes
 }
 if (lower.includes('document')) {
 return 20; // 20 minutes
 }

 return 60; // Default 1 hour
 }

 private extractFiles(text: string): string[] {
 const files: string[] = [];

 // Look for file patterns
 const filePattern = /[\w\/\-\.]+\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h)/g;
 const matches = text.match(filePattern);

 if (matches) {
 files.push(...matches);
 }

 return files;
 }

 private generateMetadata(
 requirements: Requirement[],
 tasks: SpecTask[],
 constraints: Constraint[]
 ): SpecMetadata {
 // Calculate complexity based on number of requirements, tasks, and constraints
 const complexity = Math.min(10, Math.ceil(
 (requirements.length * 0.3 + tasks.length * 0.5 + constraints.length * 0.2)
 ));

 return {
 version: '1.0.0',
 created: Date.now(),
 updated: Date.now(),
 tags: [],
 complexity
 };
 }
}

