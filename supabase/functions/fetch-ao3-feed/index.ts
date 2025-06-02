
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
  
  // Extract author
  let author = getElementText(entryXml, 'author');
  if (!author) {
    // Try to get author from name tag inside author
    const authorMatch = entryXml.match(/<author[^>]*>[\s\S]*?<name[^>]*>([^<]+)<\/name>[\s\S]*?<\/author>/i);
    if (authorMatch) {
      author = cleanText(authorMatch[1]);
    }
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
  
  // Extract description/summary/content
  let description = getElementText(entryXml, 'summary');
  if (!description) {
    description = getElementText(entryXml, 'content');
  }
  if (!description) {
    description = getElementText(entryXml, 'description');
  }
  
  // Clean up description (remove HTML tags if present)
  if (description) {
    description = description.replace(/<[^>]*>/g, '').trim();
    if (description.length > 300) {
      description = description.substring(0, 300) + '...';
    }
  }
  console.log(`Description: ${description ? description.substring(0, 50) + '...' : 'None'}`);
  
  // Extract tags/categories
  const tags = [];
  const categoryRegex = /<category[^>]*term="([^"]*)"[^>]*>/gi;
  let categoryMatch;
  
  while ((categoryMatch = categoryRegex.exec(entryXml)) !== null) {
    const tag = cleanText(categoryMatch[1]);
    if (tag && tag !== 'Cinderella Boy - Punko (Webcomic)' && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  
  // Also try looking for category text content
  const categoryTextRegex = /<category[^>]*>([^<]+)<\/category>/gi;
  let categoryTextMatch;
  
  while ((categoryTextMatch = categoryTextRegex.exec(entryXml)) !== null) {
    const tag = cleanText(categoryTextMatch[1]);
    if (tag && tag !== 'Cinderella Boy - Punko (Webcomic)' && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  
  console.log(`Tags found: ${tags.length} - ${tags.slice(0, 3).join(', ')}`);
  
  // Try to extract additional metadata from content if available
  let word_count = null;
  let chapters = null;
  let rating = null;
  
  // Look for these in the content or summary
  const contentForStats = description || '';
  
  // Try to extract word count
  const wordMatch = contentForStats.match(/(\d+)\s*words/i);
  if (wordMatch) {
    word_count = parseInt(wordMatch[1]);
    console.log(`Word count found: ${word_count}`);
  }
  
  // Try to extract chapters
  const chapterMatch = contentForStats.match(/(\d+\/\d+|\d+)\s*chapters?/i);
  if (chapterMatch) {
    chapters = chapterMatch[1];
    console.log(`Chapters found: ${chapters}`);
  }
  
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

    // Use the correct RSS feed URL with tag ID instead of tag name
    const feedUrl = 'https://archiveofourown.org/tags/104741227/feed.atom';
    
    console.log('Starting AO3 RSS feed parsing...');
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
          'Cache-Control': 'max-age=0',
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

    // Store/update works in database
    let successCount = 0;
    let errorCount = 0;
    
    for (const work of works) {
      try {
        // First try to find existing work by link
        const { data: existingWork } = await supabaseClient
          .from('rss_items')
          .select('id')
          .eq('link', work.link)
          .maybeSingle();

        if (existingWork) {
          // Update existing work
          const { error } = await supabaseClient
            .from('rss_items')
            .update({
              title: work.title,
              description: work.description,
              author: work.author,
              published_date: work.published_date,
              tags: work.tags,
              word_count: work.word_count,
              chapters: work.chapters,
              fandom: work.fandom,
              rating: work.rating,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingWork.id);
          
          if (error) {
            console.error('Error updating work:', error);
            errorCount++;
          } else {
            console.log(`Updated work: ${work.title}`);
            successCount++;
          }
        } else {
          // Insert new work
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
        message: `Successfully processed ${works.length} works from AO3 RSS feed (${successCount} stored/updated, ${errorCount} errors)`,
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
