// ---------------------------------------------------------------------------
// readSheetAsJson
//
// Reads a named sheet from an Excel file and returns its rows as an array
// of plain objects, with Excel column headers translated to camelCase keys
// via a caller-supplied headerMap.
//
// filePath  : string   — path to the .xlsx file to read
// sheetName : string   — exact tab name to read (must exist in the workbook)
// headerMap : object   — { 'Human Readable Header': 'camelCaseKey', ... }
//                        Columns whose header is NOT in the map are silently
//                        omitted from each result object.
//
// Returns: Promise<object[]>
//   Each element is one data row. Empty rows (all null/blank cells) are
//   filtered out automatically.
// ---------------------------------------------------------------------------
const readSheetAsJson = async (filePath, sheetName, headerMap) => {
  const workbook = XLSX.readFile(filePath);

  if (!workbook.Sheets[sheetName]) {
    throw new Error(`Sheet "${sheetName}" not found in "${filePath}"`);
  }

  const sheet = workbook.Sheets[sheetName];

  // header:1 → array-of-arrays; defval:null → missing cells become null
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (rows.length === 0) return [];

  const headers = rows[0]; // row 0 is always the header row

  return rows
    .slice(1)                         // skip header row
    .filter(row => row.some(cell => cell !== null && cell !== ''))  // drop empty rows
    .map(row =>
      headers.reduce((obj, header, i) => {
        const key = headerMap[header];
        if (key !== undefined) {
          obj[key] = row[i] ?? null;
        }
        return obj;
      }, {})
    );
};


// Use case:

// const { readSheetAsJson } = require('./excelUtils');

// const headerMap = {
//   'First Name':    'firstName',
//   'Last Name':     'lastName',
//   'Date of Birth': 'dateOfBirth',
//   'Employee ID':   'employeeId',
// };

// const rows = await readSheetAsJson('./data/employees.xlsx', 'Staff', headerMap);
// // [
// //   { firstName: 'Jane', lastName: 'Smith', dateOfBirth: 45123, employeeId: 'E001' },
// //   ...
// // ]
