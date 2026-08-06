const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '../public/xml-uploads');
const manifestPath = path.join(uploadDir, 'bots.json');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Read directory
const files = fs.readdirSync(uploadDir);
const xmlFiles = files.filter(f => f.toLowerCase().endsWith('.xml'));

// Read existing manifest to preserve custom descriptions/difficulty/strategy if they exist
let existingMap = {};
if (fs.existsSync(manifestPath)) {
    try {
        const existingData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (Array.isArray(existingData)) {
            existingData.forEach(item => {
                if (item.file) {
                    existingMap[item.file] = item;
                }
            });
        }
    } catch (e) {
        console.warn('Failed to parse existing bots.json:', e.message);
    }
}

const list = xmlFiles.map(file => {
    const defaultName = path.basename(file, '.xml').replace(/[_-]/g, ' ');
    
    // If it already exists in the manifest, preserve it
    if (existingMap[file]) {
        return existingMap[file];
    }
    
    // Generate clean details based on name patterns
    let description = `Advanced trading strategy: ${defaultName}. Optimized for consistent returns and automated execution.`;
    let difficulty = 'Intermediate';
    let strategy = 'Multi-Strategy';
    
    const upperName = defaultName.toUpperCase();
    if (upperName.includes('EVEN') || upperName.includes('ODD')) {
        strategy = 'Even/Odd';
    } else if (upperName.includes('SCANNER')) {
        strategy = 'Scanner';
        difficulty = 'Advanced';
    } else if (upperName.includes('AI') || upperName.includes('ROBOT')) {
        strategy = 'AI Grid';
        difficulty = 'Advanced';
    } else if (upperName.includes('SPEED')) {
        strategy = 'Speed Run';
    } else if (upperName.includes('BEGINNER')) {
        difficulty = 'Beginner';
    } else if (upperName.includes('RISE') || upperName.includes('FALL')) {
        strategy = 'Rise & Fall';
    }
    
    return {
        name: defaultName,
        file: file,
        description: description,
        difficulty: difficulty,
        strategy: strategy
    };
});

fs.writeFileSync(manifestPath, JSON.stringify(list, null, 2), 'utf8');
console.log(`Successfully generated manifest with ${list.length} bots.`);
