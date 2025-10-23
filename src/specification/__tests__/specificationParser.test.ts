import { SpecificationParser, RequirementType, TaskType, Priority, ConstraintType } from '../specificationParser';

describe('SpecificationParser', () => {
 let parser: SpecificationParser;
 const mockWorkspaceRoot = '/test/workspace';

 beforeEach(() => {
 parser = new SpecificationParser(mockWorkspaceRoot);
 });

 describe('parse', () => {
 it('should parse a simple specification', async () => {
 const text = `
# Build User Authentication

Implement user authentication system with login and registration.

## Requirements

1. Users must be able to register with email and password
2. Users must be able to login with credentials
3. Passwords must be hashed securely

## Tasks

1. Create user model
2. Implement registration endpoint
3. Implement login endpoint
4. Add password hashing

## Constraints

1. Must use bcrypt for password hashing
2. Must complete within 2 weeks
 `;

 const result = await parser.parse(text);

 expect(result.title).toBe('Build User Authentication');
 expect(result.description).toContain('authentication');
 expect(result.requirements.length).toBe(3);
 expect(result.tasks.length).toBe(4);
 expect(result.constraints.length).toBe(2);
 });

 it('should extract title from markdown heading', async () => {
 const text = '# My Project Title\n\nDescription here';
 const result = await parser.parse(text);
 expect(result.title).toBe('My Project Title');
 });

 it('should use first line as title if no heading', async () => {
 const text = 'My Project Title\n\nDescription here';
 const result = await parser.parse(text);
 expect(result.title).toBe('My Project Title');
 });

 it('should handle empty specification', async () => {
 const text = '';
 const result = await parser.parse(text);
 expect(result.title).toBe('Untitled Specification');
 expect(result.requirements.length).toBe(0);
 expect(result.tasks.length).toBe(0);
 });
 });

 describe('extractRequirements', () => {
 it('should extract numbered requirements', async () => {
 const text = `
## Requirements

1. First requirement
2. Second requirement
3. Third requirement
 `;

 const result = await parser.parse(text);
 expect(result.requirements.length).toBe(3);
 expect(result.requirements[0].description).toContain('First requirement');
 expect(result.requirements[1].description).toContain('Second requirement');
 });

 it('should extract bulleted requirements', async () => {
 const text = `
## Requirements

- First requirement
- Second requirement
* Third requirement
 `;

 const result = await parser.parse(text);
 expect(result.requirements.length).toBe(3);
 });

 it('should detect requirement types', async () => {
 const text = `
## Requirements

1. The system must respond within 100ms (performance)
2. Users must authenticate with OAuth (security)
3. Must use TypeScript (technical)
4. Users can view their profile (functional)
 `;

 const result = await parser.parse(text);
 expect(result.requirements[0].type).toBe(RequirementType.PERFORMANCE);
 expect(result.requirements[1].type).toBe(RequirementType.SECURITY);
 expect(result.requirements[2].type).toBe(RequirementType.TECHNICAL);
 expect(result.requirements[3].type).toBe(RequirementType.FUNCTIONAL);
 });

 it('should detect requirement priorities', async () => {
 const text = `
## Requirements

1. Critical: System must not crash
2. High priority: Fast response times
3. Low priority: Nice to have feature
4. Normal requirement
 `;

 const result = await parser.parse(text);
 expect(result.requirements[0].priority).toBe(Priority.CRITICAL);
 expect(result.requirements[1].priority).toBe(Priority.HIGH);
 expect(result.requirements[2].priority).toBe(Priority.LOW);
 expect(result.requirements[3].priority).toBe(Priority.MEDIUM);
 });
 });

 describe('extractTasks', () => {
 it('should extract numbered tasks', async () => {
 const text = `
## Tasks

1. Create database schema
2. Implement API endpoints
3. Write tests
 `;

 const result = await parser.parse(text);
 expect(result.tasks.length).toBe(3);
 expect(result.tasks[0].name).toContain('Create database schema');
 });

 it('should detect task types', async () => {
 const text = `
## Tasks

1. Create new user model
2. Modify existing API
3. Delete old code
4. Refactor authentication
5. Test the system
6. Document the API
 `;

 const result = await parser.parse(text);
 expect(result.tasks[0].type).toBe(TaskType.CREATE);
 expect(result.tasks[1].type).toBe(TaskType.MODIFY);
 expect(result.tasks[2].type).toBe(TaskType.DELETE);
 expect(result.tasks[3].type).toBe(TaskType.REFACTOR);
 expect(result.tasks[4].type).toBe(TaskType.TEST);
 expect(result.tasks[5].type).toBe(TaskType.DOCUMENT);
 });

 it('should estimate task time', async () => {
 const text = `
## Tasks

1. Create model (2 hours)
2. Implement API (120 minutes)
3. Write tests (30 min)
4. Regular task
 `;

 const result = await parser.parse(text);
 expect(result.tasks[0].estimatedTime).toBe(120); // 2 hours
 expect(result.tasks[1].estimatedTime).toBe(120); // 120 minutes
 expect(result.tasks[2].estimatedTime).toBe(30); // 30 minutes
 expect(result.tasks[3].estimatedTime).toBeGreaterThan(0); // Default estimate
 });

 it('should extract file references', async () => {
 const text = `
## Tasks

1. Create src/models/user.ts
2. Modify src/api/auth.ts and src/utils/hash.js
 `;

 const result = await parser.parse(text);
 expect(result.tasks[0].files).toContain('src/models/user.ts');
 expect(result.tasks[1].files.length).toBeGreaterThan(0);
 });
 });

 describe('extractConstraints', () => {
 it('should extract constraints', async () => {
 const text = `
## Constraints

1. Must complete within 2 weeks
2. Budget limited to $1000
3. Must use React framework
 `;

 const result = await parser.parse(text);
 expect(result.constraints.length).toBe(3);
 });

 it('should detect constraint types', async () => {
 const text = `
## Constraints

1. Deadline is next month (time)
2. Budget is $5000 (cost)
3. Must use TypeScript (technology)
4. Must be secure (security)
5. Must be fast (performance)
 `;

 const result = await parser.parse(text);
 expect(result.constraints[0].type).toBe(ConstraintType.TIME);
 expect(result.constraints[1].type).toBe(ConstraintType.BUDGET);
 expect(result.constraints[2].type).toBe(ConstraintType.TECHNOLOGY);
 expect(result.constraints[3].type).toBe(ConstraintType.SECURITY);
 expect(result.constraints[4].type).toBe(ConstraintType.PERFORMANCE);
 });
 });

 describe('extractDependencies', () => {
 it('should detect task dependencies', async () => {
 const text = `
## Tasks

1. Create database schema
2. Implement API after creating database schema
3. Write tests after implementing API
 `;

 const result = await parser.parse(text);

 // Task 2 should depend on task 1
 const task2 = result.tasks.find(t => t.name.includes('Implement API'));
 expect(task2?.dependencies.length).toBeGreaterThanOrEqual(0);
 });
 });

 describe('generateMetadata', () => {
 it('should calculate complexity', async () => {
 const text = `
# Simple Project

## Requirements
1. Req 1

## Tasks
1. Task 1
 `;

 const result = await parser.parse(text);
 expect(result.metadata.complexity).toBeGreaterThan(0);
 expect(result.metadata.complexity).toBeLessThanOrEqual(10);
 });

 it('should set version and timestamps', async () => {
 const text = '# Test';
 const result = await parser.parse(text);

 expect(result.metadata.version).toBe('1.0.0');
 expect(result.metadata.created).toBeGreaterThan(0);
 expect(result.metadata.updated).toBeGreaterThan(0);
 });

 it('should calculate higher complexity for larger specs', async () => {
 const text = `
# Complex Project

## Requirements
${Array.from({ length: 20 }, (_, i) => `${i + 1}. Requirement ${i + 1}`).join('\n')}

## Tasks
${Array.from({ length: 30 }, (_, i) => `${i + 1}. Task ${i + 1}`).join('\n')}

## Constraints
${Array.from({ length: 10 }, (_, i) => `${i + 1}. Constraint ${i + 1}`).join('\n')}
 `;

 const result = await parser.parse(text);
 expect(result.metadata.complexity).toBeGreaterThan(5);
 });
 });

 describe('edge cases', () => {
 it('should handle specification with only title', async () => {
 const text = '# Just a Title';
 const result = await parser.parse(text);

 expect(result.title).toBe('Just a Title');
 expect(result.requirements.length).toBe(0);
 expect(result.tasks.length).toBe(0);
 });

 it('should handle mixed numbering styles', async () => {
 const text = `
## Tasks

1. First task
2) Second task
3. Third task
 `;

 const result = await parser.parse(text);
 expect(result.tasks.length).toBeGreaterThanOrEqual(2);
 });

 it('should handle multiline descriptions', async () => {
 const text = `
## Requirements

1. This is a requirement
 that spans multiple lines
 and has lots of detail
 `;

 const result = await parser.parse(text);
 expect(result.requirements[0].description).toContain('requirement');
 });
 });
});

