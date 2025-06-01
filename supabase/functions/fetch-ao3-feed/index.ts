
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
        // First try to find existing work
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
              ...work,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingWork.id);
          
          if (error) {
            console.error('Error updating work:', error);
            errorCount++;
          } else {
            successCount++;
          }
        } else {
          // Insert new work
          const { error } = await supabaseClient
            .from('rss_items')
            .insert(work);
          
          if (error) {
            console.error('Error inserting work:', error);
            errorCount++;
          } else {
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
    // Look for work blurbs (the main work listing items)
    const workPattern = /<li[^>]+class="work blurb group"[^>]*>([\s\S]*?)<\/li>/g;
    let workMatch;
    
    while ((workMatch = workPattern.exec(html)) !== null) {
      const workHtml = workMatch[1];
      
      try {
        const work = parseWorkFromBlurb(workHtml);
        if (work) {
          works.push(work);
        }
      } catch (error) {
        console.error('Error parsing individual work:', error);
      }
    }
    
    console.log(`Parsed ${works.length} works from HTML`);
    
  } catch (error) {
    console.error('Error parsing works from HTML:', error);
  }
  
  return works;
}

function parseWorkFromBlurb(workHtml) {
  // Extract title and link
  const titleMatch = workHtml.match(/<h4[^>]+class="heading"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/);
  if (!titleMatch) {
    console.log('No title/link found in work blurb');
    return null;
  }
  
  const link = 'https://archiveofourown.org' + titleMatch[1];
  const title = titleMatch[2].replace(/<[^>]*>/g, '').trim();
  
  // Extract author
  const authorMatch = workHtml.match(/<a[^>]+rel="author"[^>]*>(.*?)<\/a>/);
  const author = authorMatch ? authorMatch[1].replace(/<[^>]*>/g, '').trim() : 'Unknown';
  
  // Extract summary/description
  const summaryMatch = workHtml.match(/<blockquote[^>]+class="userstuff summary"[^>]*>([\s\S]*?)<\/blockquote>/);
  const description = summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').trim() : '';
  
  // Extract tags
  const tags = [];
  const tagPattern = /<a[^>]+class="tag"[^>]*>(.*?)<\/a>/g;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(workHtml)) !== null) {
    const tag = tagMatch[1].replace(/<[^>]*>/g, '').trim();
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  
  // Extract stats (word count, chapters, etc.)
  const statsMatch = workHtml.match(/<dl[^>]+class="stats"[^>]*>([\s\S]*?)<\/dl>/);
  let word_count = null;
  let chapters = null;
  let rating = null;
  
  if (statsMatch) {
    const statsHtml = statsMatch[1];
    
    // Word count
    const wordMatch = statsHtml.match(/<dt[^>]*>Words:<\/dt>\s*<dd[^>]*>([\d,]+)<\/dd>/);
    if (wordMatch) {
      word_count = parseInt(wordMatch[1].replace(/,/g, ''));
    }
    
    // Chapters
    const chapterMatch = statsHtml.match(/<dt[^>]*>Chapters:<\/dt>\s*<dd[^>]*>(\d+(?:\/\d+)?)<\/dd>/);
    if (chapterMatch) {
      chapters = chapterMatch[1];
    }
  }
  
  // Extract rating from tags or other indicators
  const ratingTags = ['General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated'];
  for (const tag of tags) {
    if (ratingTags.includes(tag)) {
      rating = tag;
      break;
    }
  }
  
  // Generate a unique ID from the link
  const workId = link.match(/\/works\/(\d+)/)?.[1] || Date.now().toString();
  
  // Extract published date (this is tricky from the listing page)
  const dateMatch = workHtml.match(/<p[^>]+class="datetime"[^>]*>(.*?)<\/p>/);
  let published_date = new Date().toISOString();
  if (dateMatch) {
    try {
      const dateText = dateMatch[1].replace(/<[^>]*>/g, '').trim();
      published_date = new Date(dateText).toISOString();
    } catch (e) {
      console.log('Could not parse date:', dateMatch[1]);
    }
  }
  
  return {
    id: workId,
    title,
    description,
    link,
    author,
    published_date,
    tags: tags.length > 0 ? tags : null,
    word_count,
    chapters,
    fandom: 'Cinderella Boy - Punko (Webcomic)',
    rating,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
