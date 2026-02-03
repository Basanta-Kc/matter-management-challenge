import { MatterListItem } from '../types/matter';
import { getStatusBadgeColor, getSLABadgeColor, formatDate } from '../utils/formatting';

interface MatterTableProps {
  matters: MatterListItem[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
}

type FieldRenderer = (matter: MatterListItem) => JSX.Element;

export function MatterTable({ matters, sortBy, sortOrder, onSort }: MatterTableProps) {
  const NA = () => <span className="text-gray-400">N/A</span>;

  const renderSortIcon = (column: string) => {
    if (sortBy !== column) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    
    return sortOrder === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Field-specific renderers - clear, testable, maintainable
  const fieldRenderers: Record<string, FieldRenderer> = {
    subject: (matter) => (
      <div className="text-sm font-medium text-gray-900">
        {matter.fields.subject || <NA />}
      </div>
    ),
    
    'Case Number': (matter) => (
      <span className="text-sm text-gray-500">
        {matter.fields['Case Number'] || <NA />}
      </span>
    ),
    
    Status: (matter) => 
      matter.fields.Status ? (
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(String(matter.fields.Status))}`}>
          {String(matter.fields.Status)}
        </span>
      ) : <NA />,
    
    'Assigned To': (matter) => (
      <span className="text-sm text-gray-500">
        {matter.fields['Assigned To'] || <NA />}
      </span>
    ),
    
    Priority: (matter) => (
      <span className="text-sm text-gray-500">
        {matter.fields.Priority || <NA />}
      </span>
    ),
    
    'Contract Value': (matter) => (
      <span className="text-sm text-gray-500 font-medium">
        {matter.fields['Contract Value'] || <NA />}
      </span>
    ),
    
    'Due Date': (matter) => (
      <span className="text-sm text-gray-500">
        {matter.fields['Due Date'] ? formatDate(String(matter.fields['Due Date'])) : <NA />}
      </span>
    ),
    
    Urgent: (matter) => 
      matter.fields.Urgent ? (
        <span className={String(matter.fields.Urgent) === '✓' ? 'text-green-600' : 'text-gray-400'}>
          {String(matter.fields.Urgent)}
        </span>
      ) : <NA />,
    
    'Resolution Time': (matter) => (
      <span className="text-sm text-gray-500">
        {matter.resolutionTime || <NA />}
      </span>
    ),
    
    SLA: (matter) => 
      matter.sla ? (
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getSLABadgeColor(matter.sla)}`}>
          {matter.sla}
        </span>
      ) : (
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-500">
          N/A
        </span>
      ),
  };

  if (matters.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No matters found</h3>
        <p className="mt-1 text-sm text-gray-500">Try adjusting your search criteria.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th
              onClick={() => onSort('subject')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                Subject
                {renderSortIcon('subject')}
              </div>
            </th>
            <th
              onClick={() => onSort('Case Number')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                Case Number
                {renderSortIcon('Case Number')}
              </div>
            </th>
            <th
              onClick={() => onSort('Status')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                Status
                {renderSortIcon('Status')}
              </div>
            </th>
            <th
              onClick={() => onSort('Assigned To')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                Assigned To
                {renderSortIcon('Assigned To')}
              </div>
            </th>
            <th
              onClick={() => onSort('Priority')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                Priority
                {renderSortIcon('Priority')}
              </div>
            </th>
            <th
              onClick={() => onSort('Contract Value')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                Contract Value
                {renderSortIcon('Contract Value')}
              </div>
            </th>
            <th
              onClick={() => onSort('Due Date')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                Due Date
                {renderSortIcon('Due Date')}
              </div>
            </th>
            <th
              onClick={() => onSort('Urgent')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                Urgent
                {renderSortIcon('Urgent')}
              </div>
            </th>
            <th
              onClick={() => onSort('Resolution Time')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                Resolution Time
                {renderSortIcon('Resolution Time')}
              </div>
            </th>
            <th
              onClick={() => onSort('SLA')}
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
            >
              <div className="flex items-center gap-1">
                SLA
                {renderSortIcon('SLA')}
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {matters.map((matter) => (
            <tr key={matter.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                {fieldRenderers.subject(matter)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {fieldRenderers['Case Number'](matter)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {fieldRenderers.Status(matter)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {fieldRenderers['Assigned To'](matter)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {fieldRenderers.Priority(matter)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {fieldRenderers['Contract Value'](matter)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {fieldRenderers['Due Date'](matter)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center">
                {fieldRenderers.Urgent(matter)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {fieldRenderers['Resolution Time'](matter)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {fieldRenderers.SLA(matter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

