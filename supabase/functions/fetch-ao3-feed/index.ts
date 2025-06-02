
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
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/91.0.864.59'
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

    // Base URL for Cinderella Boy works
    const baseUrl = 'https://archiveofourown.org/tags/Cinderella%20Boy%20-%20Punko%20(Webcomic)/works';
    
    console.log('Starting AO3 scraping with anti-detection measures...');
    
    // Add random delay before starting
    await randomDelay(500, 1500);
    
    const works = [];
    const maxPages = 3; // Limit to avoid being too aggressive
    
    for (let page = 1; page <= maxPages; page++) {
      console.log(`Fetching page ${page}...`);
      
      const url = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
      
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
            'Referer': page > 1 ? baseUrl : 'https://archiveofourown.org/',
          },
          signal: AbortSignal.timeout(45000) // 45 second timeout
        });

        if (!response.ok) {
          console.error(`Failed to fetch page ${page}: ${response.status} ${response.statusText}`);
          continue;
        }

        const html = await response.text();
        console.log(`Page ${page} fetched successfully, length: ${html.length}`);

        // Parse works from this page
        const pageWorks = parseWorksFromHTML(html);
        works.push(...pageWorks);
        
        console.log(`Found ${pageWorks.length} works on page ${page}`);
        
        // Random delay between pages
        if (page < maxPages) {
          await randomDelay(2000, 5000);
        }
        
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        continue;
      }
    }

    console.log(`Total works found: ${works.length}`);

    // Update feed metadata
    const { error: metadataError } = await supabaseClient
      .from('feed_metadata')
      .upsert({
        feed_url: baseUrl,
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

    // Store/update works in database with proper conflict resolution
    let successCount = 0;
    let errorCount = 0;
    
    for (const work of works) {
      try {
        // First try to find existing work by AO3 work ID or link
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
          // Insert new work with generated UUID
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
        message: `Successfully processed ${works.length} works from AO3 (${successCount} stored/updated, ${errorCount} errors)`,
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

function parseWorksFromHTML(html) {
  const works = [];
  
  try {
    console.log('Starting HTML parsing...');
    
    // More flexible pattern to match work list items
    const workBlurbPattern = /<li[^>]*class="[^"]*work[^"]*blurb[^"]*group[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let workMatch;
    let matchCount = 0;
    
    while ((workMatch = workBlurbPattern.exec(html)) !== null) {
      matchCount++;
      const workHtml = workMatch[1];
      
      console.log(`Processing work match ${matchCount}`);
      
      try {
        const work = parseWorkFromBlurb(workHtml, matchCount);
        if (work) {
          console.log(`Successfully parsed work: "${work.title}"`);
          works.push(work);
        } else {
          console.log(`Failed to parse work from match ${matchCount}`);
        }
      } catch (error) {
        console.error(`Error parsing individual work ${matchCount}:`, error);
      }
    }
    
    console.log(`Successfully parsed ${works.length} works from HTML`);
    
  } catch (error) {
    console.error('Error parsing works from HTML:', error);
  }
  
  return works;
}

function parseWorkFromBlurb(workHtml, matchId) {
  console.log(`Parsing work blurb for match ID: ${matchId}`);
  
  // Extract title and link - more flexible pattern
  const titlePattern = /<h4[^>]*class="[^"]*heading[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i;
  const titleMatch = workHtml.match(titlePattern);
  
  if (!titleMatch) {
    console.log('Could not find title/link in work blurb');
    return null;
  }
  
  const titleLink = titleMatch[1].startsWith('http') ? titleMatch[1] : 'https://archiveofourown.org' + titleMatch[1];
  const title = titleMatch[2].trim();
  
  console.log(`Parsing work: "${title}"`);
  
  // Extract author - look for rel="author" links
  let author = 'Unknown';
  const authorPattern = /<a[^>]*rel="author"[^>]*>([^<]+)<\/a>/i;
  const authorMatch = workHtml.match(authorPattern);
  if (authorMatch) {
    author = authorMatch[1].trim();
    console.log(`Found author: ${author}`);
  }
  
  // Extract description/summary - look for summary class
  let description = '';
  const summaryPattern = /<blockquote[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i;
  const summaryMatch = workHtml.match(summaryPattern);
  
  if (summaryMatch) {
    description = summaryMatch[1]
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`Found description: ${description.substring(0, 100)}...`);
  }
  
  // Extract tags - look for freeform and relationship tags
  const tags = [];
  
  // Get all tag links
  const tagPattern = /<a[^>]*class="tag"[^>]*>([^<]+)<\/a>/gi;
  let tagMatch;
  
  while ((tagMatch = tagPattern.exec(workHtml)) !== null) {
    const tag = tagMatch[1].trim()
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    
    // Skip the main fandom tag and duplicates
    if (tag && !tags.includes(tag) && tag !== 'Cinderella Boy - Punko (Webcomic)' && tag.length > 0) {
      tags.push(tag);
    }
  }
  
  console.log(`Found ${tags.length} tags: ${tags.slice(0, 5).join(', ')}${tags.length > 5 ? '...' : ''}`);
  
  // Extract stats (word count, chapters)
  let word_count = null;
  let chapters = null;
  
  // Look for stats in dd elements
  const wordPattern = /<dt[^>]*>Words?:<\/dt>\s*<dd[^>]*>([\d,]+)<\/dd>/i;
  const wordMatch = workHtml.match(wordPattern);
  if (wordMatch) {
    word_count = parseInt(wordMatch[1].replace(/,/g, ''));
    console.log(`Found word count: ${word_count}`);
  }
  
  const chapterPattern = /<dt[^>]*>Chapters?:<\/dt>\s*<dd[^>]*>(\d+(?:\/\d+)?)<\/dd>/i;
  const chapterMatch = workHtml.match(chapterPattern);
  if (chapterMatch) {
    chapters = chapterMatch[1];
    console.log(`Found chapters: ${chapters}`);
  }
  
  // Extract rating from required tags
  let rating = null;
  const ratingTags = ['General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated'];
  
  // Look for rating in span with rating class or title attribute
  for (const ratingTag of ratingTags) {
    const ratingPattern = new RegExp(`(title="${ratingTag}"|>${ratingTag}<)`, 'i');
    if (ratingPattern.test(workHtml)) {
      rating = ratingTag;
      console.log(`Found rating: ${rating}`);
      break;
    }
  }
  
  // Extract date - look for datetime attributes in the work
  let published_date = null;
  
  // Look for any datetime element - published or updated
  const dateTimePattern = /<time[^>]*datetime="([^"]+)"[^>]*>/gi;
  let dateMatch;
  const dates = [];
  
  while ((dateMatch = dateTimePattern.exec(workHtml)) !== null) {
    const dateStr = dateMatch[1];
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      dates.push(parsedDate);
    }
  }
  
  // Use the most recent date (usually the updated date)
  if (dates.length > 0) {
    const mostRecentDate = new Date(Math.max(...dates.map(d => d.getTime())));
    published_date = mostRecentDate.toISOString();
    console.log(`Found date: ${published_date}`);
  } else {
    // Fallback to current date
    published_date = new Date().toISOString();
    console.log(`No date found, using current date: ${published_date}`);
  }
  
  const result = {
    title,
    description: description || null,
    link: titleLink,
    author,
    published_date,
    tags: tags.length > 0 ? tags : null,
    word_count,
    chapters,
    fandom: 'Cinderella Boy - Punko (Webcomic)',
    rating
  };
  
  console.log(`Successfully created work object for: "${title}"`);
  console.log(`- Author: ${author}`);
  console.log(`- Published: ${published_date}`);
  console.log(`- Tags: ${tags.length} found`);
  console.log(`- Description: ${description ? description.substring(0, 100) + '...' : 'None'}`);
  console.log(`- Rating: ${rating || 'None'}`);
  console.log(`- Word count: ${word_count || 'None'}`);
  console.log(`- Chapters: ${chapters || 'None'}`);
  
  return result;
}
