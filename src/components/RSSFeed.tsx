
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RSSFeedItem } from "./RSSFeedItem";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const RSSFeed = () => {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: feedItems, isLoading, error, refetch } = useQuery({
    queryKey: ['rss-feed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rss_items')
        .select('*')
        .order('published_date', { ascending: false });
      
      if (error) throw error;
      return data;
    },
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
      const { data, error } = await supabase.functions.invoke('fetch-ao3-feed');
      
      if (error) throw error;
      
      console.log('Refresh response:', data);
      
      toast({
        title: "Feed Updated",
        description: data?.message || "Successfully refreshed the RSS feed",
      });
      
      refetch();
    } catch (error) {
      console.error('Error refreshing feed:', error);
      toast({
        title: "Error",
        description: "Failed to refresh the feed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Auto-refresh feed on component mount if no data exists
    if (!feedItems || feedItems.length === 0) {
      refreshFeed();
    }
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
          {feedMetadata?.last_updated && (
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {new Date(feedMetadata.last_updated).toLocaleString()}
            </p>
          )}
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
