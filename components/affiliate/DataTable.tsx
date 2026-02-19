/**
 * Data Table Component
 * 
 * Reusable table with loading states and empty states
 */

'use client';

import { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor: (item: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No data found',
  keyExtractor,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full bg-white/5" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/10">
            {columns.map((column) => (
              <th
                key={column.key}
                className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider py-3 px-4"
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              className="hover:bg-white/5 transition-colors"
            >
              {columns.map((column) => (
                <td key={column.key} className="py-4 px-4 text-sm text-gray-300">
                  {column.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
