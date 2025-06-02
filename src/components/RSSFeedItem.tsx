
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, User, Calendar, BookOpen, Star, Users, Heart, Tag } from "lucide-react";

interface RSSFeedItemProps {
  item: {
    id: string;
    title: string;
    description?: string;
    link: string;
    author?: string;
    published_date?: string;
    tags?: string[];
    categories?: string[];
    characters?: string[];
    relationships?: string[];
    additional_tags?: string[];
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

  const formatDescription = (description?: string) => {
    if (!description) return null;
    
    // Split by double newlines and create paragraphs
    const paragraphs = description.split('\n\n').filter(p => p.trim());
    
    return paragraphs.map((paragraph, index) => (
      <p key={index} className="mb-2 last:mb-0">
        {paragraph.trim()}
      </p>
    ));
  };

  const renderTagSection = (tags: string[] | undefined, title: string, icon: React.ReactNode, limit: number = 4) => {
    if (!tags || tags.length === 0) return null;
    
    const displayedTags = tags.slice(0, limit);
    const remainingCount = tags.length - limit;
    
    return (
      <div className="mb-3">
        <div className="flex items-center gap-1 mb-2">
          {icon}
          <span className="text-sm font-medium text-gray-600">{title}:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {displayedTags.map((tag, index) => (
            <Badge key={index} variant="secondary" className="text-xs px-2 py-1">
              {tag}
            </Badge>
          ))}
          {remainingCount > 0 && (
            <Badge variant="outline" className="text-xs px-2 py-1 text-gray-500">
              +{remainingCount} more
            </Badge>
          )}
        </div>
      </div>
    );
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
          
          <div className="flex items-center gap-4">
            {item.rating && (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4" />
                <span>{item.rating}</span>
              </div>
            )}
            
            {item.categories && item.categories.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Categories:</span>
                <span>{item.categories.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {item.description && (
          <div className="text-gray-700 mb-4">
            {formatDescription(item.description)}
          </div>
        )}
        
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
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
        </div>

        {/* Categorized Tags */}
        <div className="space-y-3">
          {renderTagSection(
            item.characters, 
            "Characters", 
            <Users className="h-4 w-4" />, 
            4
          )}
          
          {renderTagSection(
            item.relationships, 
            "Relationships", 
            <Heart className="h-4 w-4" />, 
            4
          )}
          
          {renderTagSection(
            item.additional_tags, 
            "Additional Tags", 
            <Tag className="h-4 w-4" />, 
            4
          )}
        </div>
      </CardContent>
    </Card>
  );
};
