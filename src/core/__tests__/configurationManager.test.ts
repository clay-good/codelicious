/**
 * Tests for ConfigurationManager
 */

import { ConfigurationManager } from '../configurationManager';

describe('ConfigurationManager', () => {
 let configManager: ConfigurationManager;

 beforeEach(() => {
 configManager = new ConfigurationManager();
 });

 describe('getConfig', () => {
 it('should return complete configuration', () => {
 const config = configManager.getConfig();

 expect(config).toBeDefined();
 expect(config.indexing).toBeDefined();
 expect(config.models).toBeDefined();
 expect(config.execution).toBeDefined();
 expect(config.cache).toBeDefined();
 expect(config.embeddingServer).toBeDefined();
 });
 });

 describe('getIndexingConfig', () => {
 it('should return indexing configuration with defaults', () => {
 const config = configManager.getIndexingConfig();

 expect(config.progressive).toBe(true);
 expect(config.background).toBe(true);
 expect(config.maxMemory).toBe('2GB');
 });
 });

 describe('getModelsConfig', () => {
 it('should return models configuration with defaults', () => {
 const config = configManager.getModelsConfig();

 expect(config.preferLocal).toBe(true);
 expect(config.fallbackToCloud).toBe(true);
 expect(config.costLimit).toBe(10.0);
 });
 });

 describe('getExecutionConfig', () => {
 it('should return execution configuration with defaults', () => {
 const config = configManager.getExecutionConfig();

 expect(config.sandbox).toBe(true);
 expect(config.timeout).toBe(30000);
 expect(config.requireConfirmation).toBe(true);
 });
 });

 describe('getCacheConfig', () => {
 it('should return cache configuration with defaults', () => {
 const config = configManager.getCacheConfig();

 expect(config.enabled).toBe(true);
 expect(config.maxSize).toBe('1GB');
 expect(config.ttl).toBe(3600000);
 });
 });

 describe('getEmbeddingServerConfig', () => {
 it('should return embedding server configuration with defaults', () => {
 const config = configManager.getEmbeddingServerConfig();

 expect(config.url).toBe('http://localhost:8765');
 expect(config.timeout).toBe(30000);
 });
 });
});

