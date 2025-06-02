import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rotating user agents to avoid detection
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0'
];

// Random delay function
function randomDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Get random user agent
function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper function to clean text
function cleanText(text) {
  if (!text) return null;
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper function to clean and format description with proper line breaks
function formatDescription(text) {
  if (!text) return null;
  
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Add line breaks before capital letters that follow periods without spaces
    .replace(/\.([A-Z])/g, '.\n\n$1')
    // Clean up multiple spaces but preserve intentional line breaks
    .replace(/ +/g, ' ')
    .trim();
}

// Extract text content from XML element
function getElementText(xmlString, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xmlString.match(regex);
  return match ? cleanText(match[1]) : null;
}

// Extract attribute from XML element
function getElementAttribute(xmlString, tagName, attributeName) {
  const regex = new RegExp(`<${tagName}[^>]*${attributeName}="([^"]*)"[^>]*>`, 'i');
  const match = xmlString.match(regex);
  return match ? match[1] : null;
}

// Parse RSS/Atom feed entries
function parseRSSEntries(feedContent) {
  console.log('=== PARSING RSS/ATOM FEED ===');
  console.log('Feed content length:', feedContent.length);
  
  const works = [];
  
  try {
    // Look for entries (Atom format) or items (RSS format)
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    let match;
    let entryCount = 0;
    
    while ((match = entryRegex.exec(feedContent)) !== null && entryCount < 50) {
      entryCount++;
      console.log(`\n=== PARSING ENTRY ${entryCount} ===`);
      const entryXml = match[1];
      
      const work = parseRSSEntry(entryXml, entryCount);
      if (work && work.title && work.link) {
        console.log(`Successfully parsed entry: "${work.title}"`);
        works.push(work);
      } else {
        console.log('Failed to parse entry properly');
      }
    }
    
    console.log(`\nTotal entries parsed: ${works.length}`);
    
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
  }
  
  return works;
}

function parseRSSEntry(entryXml, entryIndex) {
  console.log(`Parsing entry ${entryIndex}...`);
  
  // Extract title
  const title = getElementText(entryXml, 'title');
  console.log(`Title: ${title}`);
  
  // Extract link
  let link = getElementAttribute(entryXml, 'link', 'href');
  if (!link) {
    link = getElementText(entryXml, 'link');
  }
  console.log(`Link: ${link}`);
  
  if (!title || !link) {
    console.log(`Missing title or link for entry ${entryIndex}`);
    return null;
  }
  
  // Extract author - fix to get just the name text without XML tags
  let author = null;
  // Try to get author from name tag inside author
  const authorMatch = entryXml.match(/<author[^>]*>[\s\S]*?<name[^>]*>([^<]+)<\/name>[\s\S]*?<\/author>/i);
  if (authorMatch) {
    author = cleanText(authorMatch[1]);
  } else {
    // Fallback to simple author tag
    author = getElementText(entryXml, 'author');
  }
  console.log(`Author: ${author}`);
  
  // Extract published/updated date
  let published_date = getElementText(entryXml, 'published');
  if (!published_date) {
    published_date = getElementText(entryXml, 'updated');
  }
  if (!published_date) {
    published_date = getElementText(entryXml, 'pubDate');
  }
  
  if (published_date) {
    try {
      const parsedDate = new Date(published_date);
      if (!isNaN(parsedDate.getTime())) {
        published_date = parsedDate.toISOString();
        console.log(`Date: ${published_date}`);
      } else {
        console.log(`Invalid date format: ${published_date}`);
        published_date = null;
      }
    } catch (e) {
      console.log(`Date parsing error: ${e.message}`);
      published_date = null;
    }
  } else {
    console.log('No date found');
  }
  
  // Extract description/summary/content and parse it properly
  let rawContent = getElementText(entryXml, 'summary');
  if (!rawContent) {
    rawContent = getElementText(entryXml, 'content');
  }
  if (!rawContent) {
    rawContent = getElementText(entryXml, 'description');
  }
  
  let description = null;
  let word_count = null;
  let chapters = null;
  let rating = null;
  let tags = [];
  
  if (rawContent) {
    console.log('Raw content preview:', rawContent.substring(0, 500));
    
    // Extract tags from the HTML structure - look for all <a> tags with class="tag"
    const tagRegex = /<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/gi;
    let tagMatch;
    
    while ((tagMatch = tagRegex.exec(rawContent)) !== null) {
      const tag = cleanText(tagMatch[1]);
      if (tag && !tags.includes(tag)) {
        // Skip basic metadata tags but keep everything else
        if (!tag.match(/^(General Audiences|Teen And Up Audiences|Mature|Explicit|Not Rated|No Archive Warnings Apply|Graphic Depictions Of Violence|Major Character Death|Rape\/Non-Con|Underage|F\/F|F\/M|M\/M|Gen|Multi|Other|Warnings|Categories|Fandoms|Relationships|Additional Tags)$/i)) {
          tags.push(tag);
          console.log(`Found story tag: ${tag}`);
        } else {
          console.log(`Skipped metadata tag: ${tag}`);
        }
      }
    }
    
    // Clean up HTML tags first for description processing
    const cleanContent = rawContent.replace(/<[^>]*>/g, '').trim();
    
    // Remove the "by Author" part at the beginning if it's there
    let contentWithoutAuthor = cleanContent;
    if (author && cleanContent.startsWith(`by ${author}`)) {
      contentWithoutAuthor = cleanContent.substring(`by ${author}`.length).trim();
    }
    
    // Look for metadata pattern (Words:, Chapters:, etc.)
    const metadataMatch = contentWithoutAuthor.match(/(.*?)(Words:\s*\d+.*)/i);
    
    if (metadataMatch) {
      // Extract description (everything before metadata) with proper formatting
      description = formatDescription(metadataMatch[1]);
      const metadata = metadataMatch[2];
      
      // Extract word count
      const wordMatch = metadata.match(/Words:\s*(\d+)/i);
      if (wordMatch) {
        word_count = parseInt(wordMatch[1]);
      }
      
      // Extract chapters
      const chapterMatch = metadata.match(/Chapters:\s*([\d\/\?]+)/i);
      if (chapterMatch) {
        chapters = chapterMatch[1];
      }
      
      // Extract rating - improved to get just the rating value
      const ratingMatch = metadata.match(/Rating:\s*([^W,\n\r]+?)(?:\s*(?:Warnings|Categories|Fandoms)|$)/i);
      if (ratingMatch) {
        rating = cleanText(ratingMatch[1]);
      }
    } else {
      // If no clear metadata pattern, use the whole content as description with formatting
      description = formatDescription(contentWithoutAuthor);
    }
    
    // Limit description length
    if (description && description.length > 300) {
      description = description.substring(0, 300) + '...';
    }
  }
  
  console.log(`Description: ${description ? description.substring(0, 50) + '...' : 'None'}`);
  console.log(`Word count: ${word_count}`);
  console.log(`Chapters: ${chapters}`);
  console.log(`Rating: ${rating}`);
  console.log(`Total story tags found: ${tags.length}`);
  console.log(`Story tags: ${tags.join(', ')}`);
  
  const result = {
    title,
    description,
    link,
    author,
    published_date,
    tags: tags.length > 0 ? tags : null,
    word_count,
    chapters,
    fandom: 'Cinderella Boy - Punko (Webcomic)',
    rating
  };
  
  console.log(`Final entry ${entryIndex}:`, JSON.stringify(result, null, 2));
  return result;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // CLEAR ALL CACHED DATA FIRST
    console.log('Clearing all existing data...');
    
    // Delete all existing RSS items
    const { error: deleteError } = await supabaseClient
      .from('rss_items')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (deleteError) {
      console.error('Error clearing existing data:', deleteError);
    } else {
      console.log('Successfully cleared all existing RSS items');
    }

    // Use the correct RSS feed URL with tag ID instead of tag name
    const feedUrl = 'https://archiveofourown.org/tags/104741227/feed.atom';
    
    console.log('Starting fresh AO3 RSS feed parsing...');
    console.log('Feed URL:', feedUrl);
    
    // Add random delay before starting
    await randomDelay(500, 1500);
    
    let works = [];
    
    try {
      console.log('Fetching RSS feed...');
      
      const response = await fetch(feedUrl, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        signal: AbortSignal.timeout(45000)
      });

      if (!response.ok) {
        console.error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const feedContent = await response.text();
      console.log(`RSS feed fetched successfully, length: ${feedContent.length}`);
      console.log('Feed content preview:', feedContent.substring(0, 500));

      // Parse works from RSS feed
      works = parseRSSEntries(feedContent);
      
      console.log(`Found ${works.length} works in RSS feed`);
      
    } catch (error) {
      console.error(`Error fetching RSS feed:`, error);
      throw error;
    }

    console.log(`Total works found: ${works.length}`);

    // Update feed metadata
    const { error: metadataError } = await supabaseClient
      .from('feed_metadata')
      .upsert({
        feed_url: feedUrl,
        title: 'Cinderella Boy - Punko (Webcomic) Works',
        description: 'Latest fanfiction works for Cinderella Boy by Punko',
        last_updated: new Date().toISOString(),
        total_items: works.length
      }, {
        onConflict: 'feed_url'
      });

    if (metadataError) {
      console.error('Error updating metadata:', metadataError);
    }

    // Store all works as new entries in database
    let successCount = 0;
    let errorCount = 0;
    
    for (const work of works) {
      try {
        const workToInsert = {
          id: generateUUID(),
          title: work.title,
          description: work.description,
          link: work.link,
          author: work.author,
          published_date: work.published_date,
          tags: work.tags,
          word_count: work.word_count,
          chapters: work.chapters,
          fandom: work.fandom,
          rating: work.rating,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const { error } = await supabaseClient
          .from('rss_items')
          .insert(workToInsert);
        
        if (error) {
          console.error('Error inserting work:', error);
          errorCount++;
        } else {
          console.log(`Inserted new work: ${work.title}`);
          successCount++;
        }
        
        // Small delay between database operations
        await randomDelay(100, 300);
        
      } catch (err) {
        console.error('Exception processing work:', err);
        errorCount++;
      }
    }

    console.log(`Successfully processed ${successCount} works, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully refreshed and processed ${works.length} works from AO3 RSS feed (${successCount} stored, ${errorCount} errors)`,
        works: works,
        total_found: works.length,
        stored: successCount,
        errors: errorCount
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
