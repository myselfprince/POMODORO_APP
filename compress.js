const fs = require('fs');
const path = require('path');

// Folders to ignore to save massive token count
// (Removed compress.js from here, as this is only for directories)
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.next', 'public', 'dist', 'build', '.vscode']);
const VALID_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

// Dynamically grab the name of this exact script so it never processes itself
const SCRIPT_NAME = path.basename(__filename); 

function minifyForAI(code) {
    // 1. Remove "use client" directives
    code = code.replace(/['"]use client['"];?\s*/g, '');

    // 2. Remove block comments (/* ... */)
    code = code.replace(/\/\*[\s\S]*?\*\//g, '');

    // 3. Remove single line comments safely (avoids breaking URLs like http://)
    code = code.replace(/(?<!:)\/\/.*$/gm, '');

    // 4. Strip extra spaces and drop empty lines
    const lines = code.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return '';

    let result = lines[0];

    // Tokens that safely indicate a line continuation
    const endContinuation = /[\[\{\(\<\=\+\-\*\/\&\|\:\,\>]$/;
    const startContinuation = /^[\}\]\)\>\.\,\:\?\=\+\-\*\/\&\|]/;

    // 5. Smart Joining: The JSX Wrapper
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const prev = result;

        // JSX Smart Wrapping Heuristics
        const prevIsJSXStartOrAttr = /(?:<[a-zA-Z0-9\-]+|[a-zA-Z\-]+=(?:{[^}]*}|"[^"]*"|'[^']*'))$/.test(prev);
        const currentIsJSXAttr = /^[a-zA-Z\-]+(?:={?|\s|\/>|>)/.test(line);

        if (
            endContinuation.test(prev) || 
            startContinuation.test(line) || 
            (prevIsJSXStartOrAttr && currentIsJSXAttr)
        ) {
            // Tightly bind JSX brackets to save maximum space
            if ((prev.endsWith('>') && line.startsWith('<')) || 
                (prev.endsWith('>') && line.startsWith('{')) || 
                (prev.endsWith('}') && line.startsWith('<'))) {
                result += line;
            } else {
                result += ' ' + line; // Space prevents breaking attribute names
            }
        } else {
            // Keep newline to prevent Automatic Semicolon Insertion (ASI) syntax bugs
            result += '\n' + line;
        }
    }

    // 6. Final tight compaction for remaining JSX gaps
    return result.replace(/>\s+</g, '><').replace(/}\s+</g, '}<').replace(/>\s+{/g, '>{');
}

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const filepath = path.join(dir, file);
        const stats = fs.statSync(filepath);
        
        if (stats.isDirectory()) {
            if (!IGNORE_DIRS.has(file)) walkDir(filepath, callback);
        } else if (stats.isFile()) {
            // NEW: Skip this script entirely so it doesn't compress itself
            if (file === SCRIPT_NAME) continue;

            if (VALID_EXTENSIONS.has(path.extname(file))) callback(filepath);
        }
    }
}

function consolidateProject(rootDir, outputFile) {
    let filesProcessed = 0;
    console.log(`Scanning project, writing output to: ${outputFile}...`);

    const outputFd = fs.openSync(outputFile, 'w');

    walkDir(rootDir, (filepath) => {
        try {
            const content = fs.readFileSync(filepath, 'utf-8');
            const minified = minifyForAI(content);

            if (minified) {
                const relPath = path.relative(rootDir, filepath).replace(/\\/g, '/');
                
                // Wrapping the path in clear tags drastically improves AI file contextualization
                fs.writeSync(outputFd, `${relPath}\n${minified}\n\n`);
                filesProcessed++;
            }
        } catch (err) {
            console.error(`Skipped ${filepath} due to error: ${err.message}`);
        }
    });

    fs.closeSync(outputFd);
    console.log(`Done! Compressed ${filesProcessed} files into ${outputFile}.`);
}

// Run script in the current directory
consolidateProject(process.cwd(), "Compressed_Code.txt");