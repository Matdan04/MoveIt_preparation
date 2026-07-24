import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// A thin, config-driven wrapper over the table primitives: sticky header,
// 40px rows, hairline row borders, no zebra. Numeric columns right-align and
// switch to the mono/tabular data face so figures stack on the decimal.
export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  numeric?: boolean;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  empty?: ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            {columns.map((col, i) => (
              <TableHead
                key={i}
                className={cn(
                  "h-10",
                  col.numeric && "text-right",
                  col.className,
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={getRowKey(row)} className="h-10">
              {columns.map((col, i) => (
                <TableCell
                  key={i}
                  className={cn(
                    col.numeric && "text-right font-mono tabular-nums",
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
