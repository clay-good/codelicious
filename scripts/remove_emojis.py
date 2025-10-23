#!/usr/bin/env python3
"""
Remove all emojis and emoticons from TypeScript files
"""

import os
import re
from pathlib import Path

# Common emojis to remove
EMOJIS = [
    '🚀', '✅', '❌', '🎯', '🎉', '💡', '📝', '🔍', '🏗️', '📊',
    '🤖', '💰', '🔥', '⚡', '🌟', '👍', '🎊', '😊', '😄', '📈',
    '🔧', '🛠️', '📦', '🎨', '🐛', '♻️', '🔒', '🔓', '⚠️', '🚨',
    '💻', '📱', '🖥️', '⌨️', '🖱️', '🎮', '🕹️', '🎲', '🎰', '🎪'
]

def remove_emojis_from_file(file_path):
    """Remove emojis from a single file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Remove all emojis
        for emoji in EMOJIS:
            content = content.replace(emoji, '')
        
        # Remove any remaining emoji characters (Unicode ranges)
        # Emoji ranges: U+1F300-U+1F9FF, U+2600-U+26FF, U+2700-U+27BF
        emoji_pattern = re.compile(
            "["
            "\U0001F300-\U0001F9FF"  # Emoticons
            "\U00002600-\U000027BF"  # Dingbats
            "\U0001F000-\U0001F02F"  # Mahjong tiles
            "\U0001F0A0-\U0001F0FF"  # Playing cards
            "\U0001F100-\U0001F64F"  # Enclosed characters
            "\U0001F680-\U0001F6FF"  # Transport and map symbols
            "\U0001F700-\U0001F77F"  # Alchemical symbols
            "\U0001F780-\U0001F7FF"  # Geometric shapes
            "\U0001F800-\U0001F8FF"  # Supplemental arrows
            "\U0001F900-\U0001F9FF"  # Supplemental symbols
            "\U0001FA00-\U0001FA6F"  # Chess symbols
            "\U0001FA70-\U0001FAFF"  # Symbols and pictographs
            "\U00002702-\U000027B0"  # Dingbats
            "\U000024C2-\U0001F251"  # Enclosed characters
            "]+",
            flags=re.UNICODE
        )
        content = emoji_pattern.sub('', content)
        
        # Clean up extra spaces left by emoji removal
        content = re.sub(r'  +', ' ', content)  # Multiple spaces to single
        content = re.sub(r' \n', '\n', content)  # Space before newline
        content = re.sub(r'\n\n\n+', '\n\n', content)  # Multiple newlines
        
        # Only write if content changed
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def main():
    """Main function"""
    src_dir = Path('src')
    files_modified = 0
    
    # Find all TypeScript files
    for ts_file in src_dir.rglob('*.ts'):
        if remove_emojis_from_file(ts_file):
            print(f"Cleaned: {ts_file}")
            files_modified += 1
    
    # Also clean markdown files
    for md_file in Path('.').glob('*.md'):
        if remove_emojis_from_file(md_file):
            print(f"Cleaned: {md_file}")
            files_modified += 1
    
    print(f"\nTotal files modified: {files_modified}")

if __name__ == '__main__':
    main()

