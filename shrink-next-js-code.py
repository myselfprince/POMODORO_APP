import os
import re
from pathlib import Path

def minify_code(code):
    # 1. Remove "use client" directives (handling both single and double quotes)
    code = re.sub(r'[\'"]use client[\'"];?\s*', '', code)
    
    # 2. Remove block comments (/* ... */)
    code = re.sub(r'/\*[\s\S]*?\*/', '', code)
    
    # 3. Remove single line comments (// ...)
    # Negative lookbehind (?<![:]) ensures we don't accidentally remove URLs like http:// or https://
    code = re.sub(r'(?<![:])//.*', '', code)

    # 4. Strip extra spaces and preserve essential line breaks to avoid ASI (Automatic Semicolon Insertion) bugs
    minified_lines = []
    for line in code.splitlines():
        clean_line = line.strip() # Removes leading/trailing whitespace (indentation)
        if clean_line:            # Drops entirely empty lines
            minified_lines.append(clean_line)
            
    # Join the lines back together. 
    # We use a newline rather than a single space to ensure the AI doesn't misinterpret 
    # missing semicolons in standard JS/TS. Stripping indentation already saves ~40% of the space.
    return '\n'.join(minified_lines)

def consolidate_nextjs_project(root_dir, output_file):
    root_path = Path(root_dir)
    
    # Folders that are useless for AI context and will consume massive tokens
    ignore_dirs = {'.git', 'node_modules', '.next', 'public', 'dist', 'build'}
    
    # Target extensions (You can add '.css' or '.json' if you need styling/config context)
    valid_extensions = {'.js', '.jsx', '.ts', '.tsx'} 
    
    files_processed = 0
    
    print(f"Scanning project, writing output to: {output_file}...")
    
    with open(output_file, 'w', encoding='utf-8') as outfile:
        for filepath in root_path.rglob('*'):
            # Skip ignored directories
            if any(part in ignore_dirs for part in filepath.parts):
                continue
            
            # Only process specific file extensions
            if filepath.is_file() and filepath.suffix in valid_extensions:
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    minified_content = minify_code(content)
                    
                    # Only write files that actually have code in them
                    if minified_content:
                        # Get relative path (e.g., app/page.js)
                        rel_path = filepath.relative_to(root_path)
                        
                        outfile.write(f"{rel_path}\n")
                        outfile.write(f"{minified_content}\n\n")
                        files_processed += 1
                        
                except Exception as e:
                    print(f"Skipped {filepath} due to error: {e}")
                    
    print(f"Done! Successfully shrunk {files_processed} files into {output_file}.")

if __name__ == "__main__":
    # Scans the current directory where the script is run
    PROJECT_DIR = "." 
    OUTPUT_TXT = "ai_context_compressed.txt"
    
    consolidate_nextjs_project(PROJECT_DIR, OUTPUT_TXT)