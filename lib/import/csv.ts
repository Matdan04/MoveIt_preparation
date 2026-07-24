// A small, dependency-free CSV reader. The vendor files are plain comma CSV;
// this handles the one thing a naive split would get wrong — quoted fields
// containing commas or escaped quotes — and nothing more. No streaming: these
// exports are kilobytes, not gigabytes.

// Parse CSV text into records keyed by the header row. Leading/trailing spaces
// inside a field are preserved deliberately — the importer treats them as dirt
// to be recorded and normalised downstream, not silently trimmed here.
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text.replace(/^﻿/, "")); // drop a BOM if present
  if (rows.length === 0) return [];

  const header = rows[0];
  return rows
    .slice(1)
    .filter((cells) => cells.some((c) => c.trim() !== "")) // skip blank lines
    .map((cells) => {
      const record: Record<string, string> = {};
      header.forEach((key, i) => {
        record[key.trim()] = cells[i] ?? "";
      });
      return record;
    });
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++; // CRLF
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // Flush a trailing field/row with no final newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
