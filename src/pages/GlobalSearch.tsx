import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/store/appContext";
import { search } from "@/lib/redis-api";
import { Search, AlertTriangle, Eye, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "@/hooks/useDebounce";

interface SearchResult {
  key: string;
  type: string;
  db: number;
  matchType: 'name' | 'value';
  matchLocation?: string;
}

interface SearchState {
  query: string;
  mode: 'names' | 'values' | 'both';
  typeFilters: Set<string>;
  dbFilter: number | null;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  cursor: string | null;
}

const REDIS_TYPES = ['string', 'list', 'hash', 'set', 'zset', 'stream'];
const DATABASES = Array.from({ length: 16 }, (_, i) => i);

/**
 * Get badge color for Redis data type
 */
function getTypeBadgeColor(type: string): string {
  const colors: Record<string, string> = {
    string: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    list: "bg-green-500/20 text-green-400 border-green-500/30",
    hash: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    set: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    zset: "bg-pink-500/20 text-pink-400 border-pink-500/30",
    stream: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  };
  return colors[type] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
}

/**
 * Get badge color for match type
 */
function getMatchTypeBadgeColor(matchType: 'name' | 'value'): string {
  return matchType === 'name' 
    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    : "bg-red-500/20 text-red-400 border-red-500/30";
}

export default function GlobalSearch() {
  const { activeConnectionId, activeDb } = useApp();
  const navigate = useNavigate();
  
  const [state, setState] = useState<SearchState>({
    query: "",
    mode: 'names',
    typeFilters: new Set<string>(),
    dbFilter: null,
    results: [],
    loading: false,
    error: null,
    hasMore: false,
    cursor: null,
  });

  // Debounce search query with 500ms delay
  const debouncedQuery = useDebounce(state.query, 500);

  const performSearch = useCallback(async (isLoadMore = false) => {
    if (!activeConnectionId || !debouncedQuery.trim()) {
      setState(prev => ({ ...prev, results: [], hasMore: false, cursor: null }));
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const typeFiltersArray = Array.from(state.typeFilters);
      const cursor = isLoadMore ? state.cursor : undefined;
      
      const result = await search.searchKeys(
        Number(activeConnectionId),
        debouncedQuery.trim(),
        state.mode,
        typeFiltersArray.length > 0 ? typeFiltersArray : undefined,
        state.dbFilter ?? undefined,
        cursor,
        100
      );

      setState(prev => ({
        ...prev,
        results: isLoadMore ? [...prev.results, ...result.results] : result.results,
        hasMore: result.hasMore,
        cursor: result.cursor,
        loading: false,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to search";
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
      toast.error(errorMessage);
    }
  }, [activeConnectionId, debouncedQuery, state.mode, state.typeFilters, state.dbFilter, state.cursor]);

  // Trigger search when debounced query or filters change
  useEffect(() => {
    if (debouncedQuery.trim()) {
      performSearch();
    } else {
      setState(prev => ({ ...prev, results: [], hasMore: false, cursor: null }));
    }
  }, [debouncedQuery, state.mode, state.typeFilters, state.dbFilter]);

  // Reset results when connection or database changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      results: [],
      hasMore: false,
      cursor: null,
      error: null,
    }));
  }, [activeConnectionId, activeDb]);

  const handleQueryChange = (value: string) => {
    setState(prev => ({ ...prev, query: value, cursor: null }));
  };

  const handleModeChange = (mode: 'names' | 'values' | 'both') => {
    setState(prev => ({ ...prev, mode, cursor: null }));
  };

  const handleTypeFilterChange = (type: string, checked: boolean) => {
    setState(prev => {
      const newTypeFilters = new Set(prev.typeFilters);
      if (checked) {
        newTypeFilters.add(type);
      } else {
        newTypeFilters.delete(type);
      }
      return { ...prev, typeFilters: newTypeFilters, cursor: null };
    });
  };

  const handleDbFilterChange = (value: string) => {
    const dbFilter = value === "all" ? null : parseInt(value, 10);
    setState(prev => ({ ...prev, dbFilter, cursor: null }));
  };

  const handleViewKey = (result: SearchResult) => {
    // Navigate to Key Browser with the specific key
    navigate(`/keys?key=${encodeURIComponent(result.key)}&db=${result.db}`);
  };

  const handleLoadMore = () => {
    performSearch(true);
  };

  const showPerformanceWarning = state.mode === 'values' || state.mode === 'both';

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Search className="w-5 h-5" />
            Global Search
          </h1>
          <p className="text-sm text-muted-foreground">
            Search across key names and values in your Redis instance
          </p>
        </div>
      </div>

      {/* Search Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Search Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div>
            <label className="text-sm font-medium">Search Query</label>
            <Input
              value={state.query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Enter search term..."
              className="mt-1"
            />
          </div>

          {/* Search Mode */}
          <div>
            <label className="text-sm font-medium">Search Mode</label>
            <Select value={state.mode} onValueChange={handleModeChange}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="names">Key Names Only</SelectItem>
                <SelectItem value="values">Key Values Only</SelectItem>
                <SelectItem value="both">Both Names and Values</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type Filters */}
          <div>
            <label className="text-sm font-medium">Type Filters</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {REDIS_TYPES.map((type) => (
                <div key={type} className="flex items-center space-x-2">
                  <Checkbox
                    id={`type-${type}`}
                    checked={state.typeFilters.has(type)}
                    onCheckedChange={(checked) => 
                      handleTypeFilterChange(type, checked as boolean)
                    }
                  />
                  <label
                    htmlFor={`type-${type}`}
                    className="text-sm font-medium capitalize cursor-pointer"
                  >
                    {type}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Database Filter */}
          <div>
            <label className="text-sm font-medium">Database</label>
            <Select 
              value={state.dbFilter?.toString() || "all"} 
              onValueChange={handleDbFilterChange}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Databases</SelectItem>
                {DATABASES.map((db) => (
                  <SelectItem key={db} value={db.toString()}>
                    Database {db}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Performance Warning */}
          {showPerformanceWarning && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-yellow-400">Performance Warning</p>
                <p className="text-yellow-300/80 mt-1">
                  Searching key values can be slow on large datasets. The search is limited to the first 1000 keys per database.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Search Results</CardTitle>
            {state.results.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {state.results.length} results
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Loading State */}
          {state.loading && state.results.length === 0 && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          )}

          {/* Error State */}
          {state.error && state.results.length === 0 && (
            <Card className="p-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5" />
                <p>{state.error}</p>
              </div>
              <Button 
                onClick={() => performSearch()} 
                variant="outline" 
                size="sm" 
                className="mt-4"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </Card>
          )}

          {/* Empty State */}
          {!state.loading && !state.error && state.results.length === 0 && debouncedQuery.trim() && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No results found for "{debouncedQuery}"</p>
              <p className="text-sm mt-1">Try adjusting your search query or filters</p>
            </div>
          )}

          {/* No Query State */}
          {!debouncedQuery.trim() && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Enter a search query to find keys</p>
            </div>
          )}

          {/* Results List */}
          {state.results.length > 0 && (
            <div className="space-y-3">
              {state.results.map((result, index) => (
                <div
                  key={`${result.key}-${result.db}-${index}`}
                  className="flex items-center justify-between p-3 border border-border rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="font-mono text-sm text-[#22d3ee] truncate">
                        {result.key}
                      </code>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getTypeBadgeColor(result.type)}`}
                      >
                        {result.type}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        DB {result.db}
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getMatchTypeBadgeColor(result.matchType)}`}
                      >
                        {result.matchType === 'name' ? 'Name Match' : 'Value Match'}
                      </Badge>
                    </div>
                    {result.matchLocation && (
                      <p className="text-xs text-muted-foreground">
                        Match in: {result.matchLocation}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleViewKey(result)}
                    className="ml-2 flex-shrink-0"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    View
                  </Button>
                </div>
              ))}

              {/* Load More Button */}
              {state.hasMore && (
                <div className="text-center pt-4">
                  <Button
                    onClick={handleLoadMore}
                    variant="outline"
                    disabled={state.loading}
                  >
                    {state.loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}