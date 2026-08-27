const fs = require('fs');

const filePath = 'src/lib/api.ts';
const content = fs.readFileSync(filePath, 'utf8');

// Client IDs and DIC companies for 30 records
const clientData = [
    { id: 'client-001', dic: "Lloyd's of London", email: 'johndoe@email.com', phone: '(555) 234-5678' },
    { id: 'client-002', dic: 'Chubb Limited', email: 'robert.smith@email.com', phone: '(555) 345-6789' },
    { id: 'client-003', dic: 'None', email: 'sarah.johnson@email.com', phone: '(555) 456-7890' },
    { id: 'client-004', dic: 'AIG', email: 'michael.williams@email.com', phone: '(555) 567-8901' },
    { id: 'client-005', dic: 'None', email: 'emily.brown@email.com', phone: '(555) 678-9012' },
    { id: 'client-006', dic: 'Zurich Insurance', email: 'david.jones@email.com', phone: '(555) 789-0123' },
    { id: 'client-007', dic: 'None', email: 'jennifer.garcia@email.com', phone: '(555) 890-1234' },
    { id: 'client-008', dic: 'Liberty Mutual', email: 'charles.miller@email.com', phone: '(555) 901-2345' },
    { id: 'client-009', dic: 'None', email: 'nancy.davis@email.com', phone: '(555) 012-3456' },
    { id: 'client-010', dic: 'Berkshire Hathaway', email: 'james.rodriguez@email.com', phone: '(555) 123-4567' },
    { id: 'client-011', dic: 'Travelers', email: 'mary.martinez@email.com', phone: '(555) 234-5678' },
    { id: 'client-012', dic: 'None', email: 'thomas.hernandez@email.com', phone: '(555) 345-6789' },
    { id: 'client-001', dic: "Lloyd's of London", email: 'johndoe@email.com', phone: '(555) 234-5678' }, // Same client
    { id: 'client-013', dic: 'Allianz', email: 'daniel.lopez@email.com', phone: '(555) 456-7890' },
    { id: 'client-014', dic: 'None', email: 'lisa.gonzalez@email.com', phone: '(555) 567-8901' },
    { id: 'client-015', dic: 'CNA Financial', email: 'mark.wilson@email.com', phone: '(555) 678-9012' },
    { id: 'client-016', dic: 'None', email: 'susan.anderson@email.com', phone: '(555) 789-0123' },
    { id: ' 'client- 017', dic: 'Nationwide', email: 'paul.thomas@email.com', phone: '(555) 890 - 1234' },
    { id: 'client-018', dic: 'Hartford', email: 'karen.taylor@email.com', phone: '(555) 901-2345' },
    { id: 'client-019', dic: 'None', email: 'kevin.moore@email.com', phone: '(555) 012-3456' },
    { id: 'client-020', dic: 'Allstate', email: 'betty.jackson@email.com', phone: '(555) 123-4567' },
    { id: 'client-021', dic: 'None', email: 'ronald.martin@email.com', phone: '(555) 234-5678' },
    { id: 'client-022', dic: 'Progressive', email: 'dorothy.lee@email.com', phone: '(555) 345-6789' },
    { id: 'client-023', dic: 'Farmers', email: 'jason.perez@email.com', phone: '(555) 456-7890' },
    { id: 'client-024', dic: 'None', email: 'barbara.thompson@email.com', phone: '(555) 567-8901' },
    { id: 'client-025', dic: 'State Farm', email: 'matthew.white@email.com', phone: '(555) 678-9012' },
    { id: 'client-026', dic: 'None', email: 'stephanie.harris@email.com', phone: '(555) 789-0123' },
    { id: 'client-027', dic: 'USAA', email: 'andrew.sanchez@email.com', phone: '(555) 890-1234' },
    { id: 'client-028', dic: 'American Family', email: 'rebecca.clark@email.com', phone: '(555) 901-2345' },
    { id: 'client-029', dic: 'None', email: 'justin.ramirez@email.com', phone: '(555) 012-3456' },
];

// Add client_id, email, phone, and dic_company to each record
let updatedContent = content;
let recordIndex = 0;

// Find and update each record
const recordRegex = /(\s+{\r?\n\s+id: ')(\d+)(',\r?\n)(\s+insured_name:)/g;

updatedContent = updatedContent.replace(recordRegex, (match, prefix, id, comma, insuranceLine) => {
    const idx = parseInt(id) - 1;
    if (idx < clientData.length) {
        const data = clientData[idx];
        const indent = prefix.match(/^\s+/)[0];
        return `${prefix}${id}${comma}${indent}    client_id: '${data.id}',\r\n${indent}    client_email: '${data.email}',\r\n${indent}    client_phone: '${data.phone}',\r\n${indent}${insuranceLine}`;
    }
    return match;
});

// Add dic_company after mortgagee fields
const mortgageeRegex = /(mortgagee_\d_code: '[^']*'|mortgagee_\d_code: undefined),(\r?\n\s+)(status:|flags:)/g;
recordIndex = 0;

updatedContent = updatedContent.replace(mortgageeRegex, (match, mortg, newline, statusOrFlags) => {
    if (recordIndex < client Data.length) {
    const data = clientData[recordIndex];
    recordIndex++;
    const indent = newline.trim() ? newline : '\r\n        ';
    return `${mortg},${indent}dic_company: '${data.dic}',${indent}${statusOrFlags}`;
}
return match;
});

fs.writeFileSync(filePath, updatedContent, 'utf8');
console.log(`Updated ${recordIndex} records`);
