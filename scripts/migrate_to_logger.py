#!/usr/bin/env python3
"""
Automated migration script to replace console.* with centralized logger
"""

import os
import re
import sys
from pathlib import Path

def get_logger_import_path(file_path: str) -> str:
    """Calculate relative path to logger based on file location"""
    depth = file_path.count('/') - 1  # Subtract 1 for 'src/'
    if depth == 0:
        return './utils/logger'
    return '../' * depth + 'utils/logger'

def get_category_name(file_path: str) -> str:
    """Extract category name from file path"""
    # Get filename without extension
    filename = Path(file_path).stem
    # Convert to PascalCase
    return ''.join(word.capitalize() for word in filename.split('_'))

def migrate_file(file_path: str) -> tuple[bool, int]:
    """
    Migrate a single file to use centralized logger
    Returns: (success, num_replacements)
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Check if file has console statements
        if not re.search(r'console\.(log|error|warn|debug|info)', content):
            return (True, 0)
        
        # Check if already migrated
        if 'createLogger' in content or 'from \'./logger\'' in content or 'from \'../utils/logger\'' in content:
            print(f"  ⚠️  Already migrated: {file_path}")
            return (True, 0)
        
        original_content = content
        replacements = 0
        
        # Find the import section (after initial comments, before first export/class/interface)
        import_match = re.search(r'(import\s+.*?;\s*\n)+', content, re.MULTILINE)
        if not import_match:
            print(f"  ❌ Could not find import section: {file_path}")
            return (False, 0)
        
        # Add logger import after last import
        import_end = import_match.end()
        logger_import_path = get_logger_import_path(file_path)
        category_name = get_category_name(file_path)
        
        logger_import = f"import {{ createLogger }} from '{logger_import_path}';\n\nconst logger = createLogger('{category_name}');\n"
        
        content = content[:import_end] + logger_import + content[import_end:]
        
        # Replace console.error with logger.error
        content, n = re.subn(
            r'console\.error\((.*?)\);',
            lambda m: f'logger.error({m.group(1)});',
            content
        )
        replacements += n
        
        # Replace console.warn with logger.warn
        content, n = re.subn(
            r'console\.warn\((.*?)\);',
            lambda m: f'logger.warn({m.group(1)});',
            content
        )
        replacements += n
        
        # Replace console.log with logger.info
        content, n = re.subn(
            r'console\.log\((.*?)\);',
            lambda m: f'logger.info({m.group(1)});',
            content
        )
        replacements += n
        
        # Replace console.debug with logger.debug
        content, n = re.subn(
            r'console\.debug\((.*?)\);',
            lambda m: f'logger.debug({m.group(1)});',
            content
        )
        replacements += n
        
        # Replace console.info with logger.info
        content, n = re.subn(
            r'console\.info\((.*?)\);',
            lambda m: f'logger.info({m.group(1)});',
            content
        )
        replacements += n
        
        if replacements > 0:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  ✅ Migrated {replacements} statements: {file_path}")
            return (True, replacements)
        else:
            print(f"  ⚠️  No replacements made: {file_path}")
            return (True, 0)
            
    except Exception as e:
        print(f"  ❌ Error migrating {file_path}: {e}")
        return (False, 0)

def main():
    """Main migration function"""
    # List of files to migrate
    files = [
        "src/ui/fileAttachmentManager.ts",
        "src/ui/codeActionHandler.ts",
        "src/ui/configurationWizard.ts",
        "src/ui/chatViewProvider.ts",
        "src/ui/enhancedStatusBar.ts",
        "src/documentation/documentationGenerator.ts",
        "src/context/incrementalIndexer.ts",
        "src/context/contextCache.ts",
        "src/context/persistentContextEngine.ts",
        "src/core/memoryPressureMonitor.ts",
        "src/core/intelligentRequestRouter.ts",
        "src/core/parallelIndexer.ts",
        "src/core/indexer.ts",
        "src/core/enhancedExecutionEngine.ts",
        "src/core/executionEngine.ts",
        "src/core/extensionManager.ts",
        "src/core/circuitBreaker.ts",
        "src/core/sessionManager.ts",
        "src/cache/cacheManager.ts",
        "src/cache/diskCache.ts",
        "src/cache/semanticCache.ts",
        "src/distributed/distributedProcessor.ts",
        "src/distributed/workerPool.ts",
        "src/distributed/worker.ts",
        "src/security/secureKeyStorage.ts",
        "src/learning/learningManager.ts",
        "src/learning/feedbackManager.ts",
        "src/learning/patternLearner.ts",
    ]
    
    print(f"🚀 Starting migration of {len(files)} files...\n")
    
    total_replacements = 0
    successful = 0
    failed = 0
    
    for file_path in files:
        if not os.path.exists(file_path):
            print(f"  ⚠️  File not found: {file_path}")
            continue
        
        success, replacements = migrate_file(file_path)
        if success:
            successful += 1
            total_replacements += replacements
        else:
            failed += 1
    
    print(f"\n✨ Migration complete!")
    print(f"   Successful: {successful}/{len(files)}")
    print(f"   Failed: {failed}/{len(files)}")
    print(f"   Total replacements: {total_replacements}")
    
    return 0 if failed == 0 else 1

if __name__ == '__main__':
    sys.exit(main())

