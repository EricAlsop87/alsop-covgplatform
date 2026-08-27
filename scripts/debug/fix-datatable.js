const fs = require('fs');

const filePath = 'src/components/dashboard/DataTable.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Remove the Actions column td element
content = content.replace(
    /\s+<td className=\{styles\.td\}>[\s\S]*?<Link[\s\S]*?View Client[\s\S]*?<\/Link>[\s\S]*?<\/td>/,
    ''
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Actions column removed successfully!');
