import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RSSFeedItem } from "./RSSFeedItem";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export const RSSFeed = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastAutoRefresh, setLastAutoRefresh] = useState<Date | null>(null);

  const { data: feedItems, isLoading, error, refetch } = useQuery({
    queryKey: ['rss-feed'],
    queryFn: async () => {
      console.log('Fetching RSS feed items...');
      const { data, error } = await supabase
        .from('rss_items')
        .select('*')
        .order('published_date', { ascending: false })
        .order('updated_at', { ascending: false }); // Secondary sort for items with null published_date
      
      if (error) {
        console.error('Error fetching RSS items:', error);
        throw error;
      }
      
      console.log('Fetched RSS items:', data?.length, 'items');
      console.log('Sample item:', data?.[0]);
      
      // Sort to put items with published_date first, then by published_date desc, then by updated_at desc
      const sortedData = data?.sort((a, b) => {
        // Items with published_date come first
        if (a.published_date && !b.published_date) return -1;
        if (!a.published_date && b.published_date) return 1;
        
        // If both have published_date, sort by published_date desc
        if (a.published_date && b.published_date) {
          return new Date(b.published_date).getTime() - new Date(a.published_date).getTime();
        }
        
        // If neither has published_date, sort by updated_at desc
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      
      return sortedData;
    },
    staleTime: 1000 * 60 * 30, // Consider data stale after 30 minutes
    refetchInterval: 1000 * 60 * 60, // Auto-refetch every hour
  });

  const { data: feedMetadata } = useQuery({
    queryKey: ['feed-metadata'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feed_metadata')
        .select('*')
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
  });

  const refreshFeed = async () => {
    setIsRefreshing(true);
    try {
      console.log('Starting feed refresh...');
      const { data, error } = await supabase.functions.invoke('fetch-ao3-feed');
      
      if (error) {
        console.error('Supabase function error:', error);
        throw error;
      }
      
      console.log('Refresh response:', data);
      
      if (data?.success) {
        toast.success(`${data.message || "Successfully refreshed the RSS feed"}`);
        setLastAutoRefresh(new Date());
        refetch();
      } else {
        throw new Error(data?.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error refreshing feed:', error);
      toast.error(`Failed to refresh the feed: ${error.message || 'Please try again.'}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh on component mount if no data or data is old
  useEffect(() => {
    const shouldAutoRefresh = () => {
      if (!feedItems || feedItems.length === 0) return true;
      
      if (feedMetadata?.last_updated) {
        const lastUpdate = new Date(feedMetadata.last_updated);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // Changed to 1 hour
        return lastUpdate < oneHourAgo;
      }
      
      return false;
    };

    if (shouldAutoRefresh()) {
      console.log('Auto-refreshing feed...');
      refreshFeed();
    }
  }, [feedMetadata]);

  // Set up auto-refresh every hour
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Hourly auto-refresh triggered');
      setLastAutoRefresh(new Date());
      refreshFeed();
    }, 60 * 60 * 1000); // Changed to 1 hour

    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Feed</h2>
        <p className="text-gray-600 mb-4">Failed to load the RSS feed</p>
        <Button onClick={refreshFeed} disabled={isRefreshing}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  const formatAutoRefreshTime = () => {
    if (!lastAutoRefresh && !feedMetadata?.last_updated) return 'Never';
    
    const date = lastAutoRefresh || (feedMetadata?.last_updated ? new Date(feedMetadata.last_updated) : null);
    if (!date) return 'Never';
    
    return date.toLocaleString();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">
            {feedMetadata?.title || 'Cinderella Boy - Punko (Webcomic) Works'}
          </h1>
          <p className="text-gray-600">
            {feedMetadata?.description || 'Latest fanfiction works for Cinderella Boy by Punko'}
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            {feedMetadata?.last_updated && (
              <span>Last updated: {new Date(feedMetadata.last_updated).toLocaleString()}</span>
            )}
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>Auto-refresh: every hour</span>
            </div>
          </div>
        </div>
        
        <Button 
          onClick={refreshFeed} 
          disabled={isRefreshing}
          variant="outline"
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh Feed
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading feed...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error Loading Feed</h2>
          <p className="text-gray-600 mb-4">Failed to load the RSS feed</p>
          <Button onClick={refreshFeed} disabled={isRefreshing}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {feedItems && feedItems.length > 0 ? (
            feedItems.map((item) => (
              <RSSFeedItem key={item.id} item={item} />
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-4">No feed items found</p>
              <Button onClick={refreshFeed} disabled={isRefreshing}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Load Feed
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
