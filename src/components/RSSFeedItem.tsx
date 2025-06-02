
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, User, Calendar, BookOpen, Star } from "lucide-react";

interface RSSFeedItemProps {
  item: {
    id: string;
    title: string;
    description?: string;
    link: string;
    author?: string;
    published_date?: string;
    tags?: string[];
    word_count?: number;
    chapters?: string;
    rating?: string;
  };
}

export const RSSFeedItem = ({ item }: RSSFeedItemProps) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    // Format date like WordPress plugin: "M j, Y" (e.g., "Jan 15, 2024")
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatWordCount = (count?: number) => {
    if (!count) return '';
    return count.toLocaleString() + ' words';
  };

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardHeader>
        <CardTitle className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold leading-tight flex-1">
            {item.title}
          </h3>
          <a 
            href={item.link} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex-shrink-0 text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        </CardTitle>
        
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
          {item.author && (
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              <span>{item.author}</span>
            </div>
          )}
          
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(item.published_date)}</span>
          </div>
          
          {item.word_count && (
            <div className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              <span>{formatWordCount(item.word_count)}</span>
            </div>
          )}
          
          {item.chapters && (
            <div className="flex items-center gap-1">
              <span>{item.chapters} chapters</span>
            </div>
          )}
          
          {item.rating && (
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4" />
              <span>{item.rating}</span>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {item.description && (
          <p className="text-gray-700 mb-4 line-clamp-3">
            {item.description}
          </p>
        )}
        
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {item.tags.slice(0, 8).map((tag, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {item.tags.length > 8 && (
              <Badge variant="outline" className="text-xs">
                +{item.tags.length - 8} more
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
