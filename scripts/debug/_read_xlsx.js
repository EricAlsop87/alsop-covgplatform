const XLSX = require('xlsx');
const fs = require('fs');
const wb = XLSX.readFile('Copy of CoverageCheckNow_Flag_Definitions.xlsx');
let out = '';
for (const name of wb.SheetNames) {
    out += '=== SHEET: ' + name + ' ===\n';
    const ws = wb.Sheets[name];
    out += XLSX.utils.sheet_to_csv(ws) + '\n';
}
fs.writeFileSync('csv_output.txt', out);
