#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Function to identify and remove duplicate function definitions from public/index.html
function removeDuplicateFunctions() {
    const indexPath = path.join(__dirname, 'index.html');
    const publicPath = path.join(__dirname, 'public/index.html');
    
    // Read both files
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const publicContent = fs.readFileSync(publicPath, 'utf8');
    
    // Split by lines
    const indexLines = indexContent.split('\n');
    const publicLines = publicContent.split('\n');
    
    // Find function definitions in index.html
    const indexFunctions = {};
    const indexFuncLines = [];
    
    for (let i = 0; i < indexLines.length; i++) {
        const line = indexLines[i];
        if (/^\s*function\s+(\w+)/.test(line)) {
            const match = line.match(/^\s*function\s+(\w+)/);
            const funcName = match[1];
            indexFunctions[funcName] = i + 1;
            indexFuncLines.push(i + 1);
        }
    }
    
    console.log('=== Functions defined in index.html ===');
    console.log(`Total functions: ${indexFuncLines.length}`);
    console.log(`Function lines: ${indexFuncLines.join(', ')}`);
    console.log('');
    
    // Find function definitions in public/index.html
    const publicFunctions = {};
    const publicFuncLines = [];
    
    for (let i = 0; i < publicLines.length; i++) {
        const line = publicLines[i];
        if (/^\s*function\s+(\w+)/.test(line)) {
            const match = line.match(/^\s*function\s+(\w+)/);
            const funcName = match[1];
            publicFunctions[funcName] = i + 1;
            publicFuncLines.push(i + 1);
        }
    }
    
    console.log('=== Functions defined in public/index.html ===');
    console.log(`Total functions: ${publicFuncLines.length}`);
    console.log(`Function lines: ${publicFuncLines.join(', ')}`);
    console.log('');
    
    // Find duplicates - functions that are defined in both files
    const duplicateFunctions = {};
    for (const funcName of Object.keys(indexFunctions)) {
        if (publicFunctions.hasOwnProperty(funcName)) {
            duplicateFunctions[funcName] = {
                indexLine: indexFunctions[funcName],
                publicLine: publicFunctions[funcName]
            };
        }
    }
    
    if (Object.keys(duplicateFunctions).length > 0) {
        console.log('=== DUPLICATE FUNCTIONS FOUND ===');
        for (const funcName of Object.keys(duplicateFunctions)) {
            console.log(`${funcName}: index.html line ${duplicateFunctions[funcName].indexLine}, public/index.html line ${duplicateFunctions[funcName].publicLine}`);
        }
        console.log('');
        console.log('This is causing duplicate definitions that can cause JavaScript errors!');
        console.log('All functions should only be defined in index.html');
    } else {
        console.log('No duplicate functions found');
    }
    
    // Create a cleaned version of public/index.html
    console.log('');
    console.log('=== Creating cleaned version of public/index.html ===');
    
    const cleanedLines = [];
    let inScriptTag = false;
    let scriptBlockLines = [];
    
    for (let i = 0; i < publicLines.length; i++) {
        const line = publicLines[i];
        const trimmed = line.trim();
        
        // Track script tags
        if (trimmed.startsWith('<script>')) {
            inScriptTag = true;
            scriptBlockLines = [];
        } else if (inScriptTag) {
            scriptBlockLines.push(line);
            
            if (trimmed.startsWith('</script>')) {
                // Process the script block content
                const scriptContent = scriptBlockLines.join('\n');
                const cleanedScript = scriptContent.split('\n').filter(scriptLine => {
                    return !/^\s*function\s+(\w+)/.test(scriptLine);
                }).join('\n');
                
                cleanedLines.push(...cleanedScript.split('\n'));
                inScriptTag = false;
            }
        } else {
            cleanedLines.push(line);
        }
    }
    
    // Write the cleaned content back to public/index.html
    fs.writeFileSync(publicPath, cleanedLines.join('\n'), 'utf8');
    
    console.log(`Cleaned public/index.html: ${publicLines.length} lines -> ${cleanedLines.length} lines`);
    console.log('');
    console.log('=== Fix complete! ===');
}

// Run the fix
removeDuplicateFunctions();