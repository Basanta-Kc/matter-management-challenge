import { useState, useEffect, useCallback } from 'react';
import { MatterListItem, MatterListResponseOptimized } from '../types/matter';
import { useDebounce } from './useDebounce';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface UseMatterParams {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  search: string;
}

export function useMatters(params: UseMatterParams) {
  const [data, setData] = useState<MatterListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(params.search, 300);

  const fetchMatters = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        page: params.page.toString(),
        limit: params.limit.toString(),
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        search: debouncedSearch,
      });

      const response = await fetch(`${API_URL}/matters?${queryParams}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: MatterListResponseOptimized = await response.json();
      setData(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch matters');
      console.error('Error fetching matters:', err);
    } finally {
      setLoading(false);
    }
  }, [params.page, params.limit, params.sortBy, params.sortOrder, debouncedSearch]);

  useEffect(() => {
    fetchMatters();
  }, [fetchMatters]);

  return {
    data,
    total,
    totalPages,
    loading,
    error,
    refetch: fetchMatters,
  };
}

