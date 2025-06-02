
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

function parseWorksFromHTML(html) {
  const works = [];
  
  try {
    console.log('Starting HTML parsing...');
    
    // Look for work items - they're in li elements with work blurb class
    const workItemRegex = /<li[^>]*class="[^"]*work[^"]*blurb[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let workMatch;
    let matchCount = 0;
    
    while ((workMatch = workItemRegex.exec(html)) !== null) {
      matchCount++;
      const workHtml = workMatch[1];
      
      console.log(`Processing work ${matchCount}, HTML length: ${workHtml.length}`);
      
      try {
        const work = parseIndividualWork(workHtml, matchCount);
        if (work) {
          console.log(`Successfully parsed work: "${work.title}"`);
          works.push(work);
        }
      } catch (error) {
        console.error(`Error parsing work ${matchCount}:`, error);
      }
    }
    
    console.log(`Total works parsed: ${works.length}`);
    
  } catch (error) {
    console.error('Error in parseWorksFromHTML:', error);
  }
  
  return works;
}

function parseIndividualWork(workHtml, workIndex) {
  console.log(`=== Parsing work ${workIndex} ===`);
  
  // Extract title and link - more flexible pattern
  const titleRegex = /<h4[^>]*class="[^"]*heading[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i;
  const titleMatch = workHtml.match(titleRegex);
  
  if (!titleMatch) {
    console.log(`No title found for work ${workIndex}`);
    return null;
  }
  
  const link = titleMatch[1].startsWith('http') ? titleMatch[1] : 'https://archiveofourown.org' + titleMatch[1];
  const title = titleMatch[2].trim();
  
  console.log(`Title: "${title}"`);
  console.log(`Link: ${link}`);
  
  // Extract author - look for rel="author" links
  const authorRegex = /<a[^>]*rel="author"[^>]*>([^<]+)<\/a>/i;
  const authorMatch = workHtml.match(authorRegex);
  const author = authorMatch ? authorMatch[1].trim() : null;
  console.log(`Author: ${author || 'Unknown'}`);
  
  // Extract description - more flexible approach
  let description = null;
  console.log('Searching for description...');
  
  // Try multiple patterns for description
  const descPatterns = [
    /<blockquote[^>]*class="[^"]*userstuff[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i,
    /<div[^>]*class="[^"]*summary[^"]*"[^>]*>[\s\S]*?<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i,
    /<p[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  ];
  
  for (const pattern of descPatterns) {
    const match = workHtml.match(pattern);
    if (match) {
      console.log('Found description!');
      description = match[1]
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      
      if (description.length > 180) {
        description = description.substring(0, 180) + '...';
      }
      console.log(`Description: "${description}"`);
      break;
    }
  }
  
  if (!description) {
    console.log('No description found');
  }
  
  // Extract tags from <ul class="tags commas">
  const tags = [];
  console.log('Searching for tags...');
  
  const tagSectionRegex = /<ul[^>]*class="[^"]*tags[^"]*commas[^"]*"[^>]*>([\s\S]*?)<\/ul>/i;
  const tagSectionMatch = workHtml.match(tagSectionRegex);
  
  if (tagSectionMatch) {
    console.log('Found tags section!');
    const tagSection = tagSectionMatch[1];
    
    // Look for all <a> tags within <li> elements
    const tagRegex = /<li[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/li>/gi;
    let tagMatch;
    
    while ((tagMatch = tagRegex.exec(tagSection)) !== null) {
      const tag = tagMatch[1].trim();
      if (tag && tag !== 'Cinderella Boy - Punko (Webcomic)' && !tags.includes(tag)) {
        tags.push(tag);
      }
    }
    console.log(`Found ${tags.length} tags: ${tags.slice(0, 5).join(', ')}${tags.length > 5 ? '...' : ''}`);
  } else {
    console.log('No tags section found');
  }
  
  // Extract date - more flexible patterns
  let published_date = null;
  console.log('Searching for date...');
  
  const datePatterns = [
    /<p[^>]*class="[^"]*datetime[^"]*"[^>]*>([^<]+)<\/p>/i,
    /<time[^>]*datetime="([^"]+)"[^>]*>/i,
    /<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/i
  ];
  
  for (const pattern of datePatterns) {
    const match = workHtml.match(pattern);
    if (match) {
      console.log('Found date!');
      const dateStr = match[1].trim();
      console.log(`Raw date string: "${dateStr}"`);
      try {
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          published_date = parsedDate.toISOString();
          console.log(`Parsed date: ${published_date}`);
          break;
        }
      } catch (e) {
        console.log(`Date parsing error: ${e.message}`);
      }
    }
  }
  
  if (!published_date) {
    console.log('No date found');
  }
  
  // Extract stats (word count, chapters) - more flexible patterns
  let word_count = null;
  let chapters = null;
  
  // Look for words in dd elements or spans
  const wordPatterns = [
    /<dd[^>]*class="[^"]*words[^"]*"[^>]*>([^<]+)<\/dd>/i,
    /<span[^>]*class="[^"]*words[^"]*"[^>]*>([^<]+)<\/span>/i,
    /(\d+(?:,\d+)*)\s*words/i
  ];
  
  for (const pattern of wordPatterns) {
    const match = workHtml.match(pattern);
    if (match) {
      const wordStr = match[1].replace(/,/g, '').trim();
      word_count = parseInt(wordStr) || null;
      if (word_count) {
        console.log(`Word count: ${word_count}`);
        break;
      }
    }
  }
  
  // Look for chapters
  const chapterPatterns = [
    /<dd[^>]*class="[^"]*chapters[^"]*"[^>]*>([^<]+)<\/dd>/i,
    /<span[^>]*class="[^"]*chapters[^"]*"[^>]*>([^<]+)<\/span>/i,
    /(\d+(?:\/\d+)?)\s*chapters?/i
  ];
  
  for (const pattern of chapterPatterns) {
    const match = workHtml.match(pattern);
    if (match) {
      chapters = match[1].trim();
      console.log(`Chapters: ${chapters}`);
      break;
    }
  }
  
  // Extract rating from title attributes or class names
  let rating = null;
  const ratingPatterns = [
    { pattern: /title="General Audiences"/i, name: 'General Audiences' },
    { pattern: /title="Teen And Up Audiences"/i, name: 'Teen And Up Audiences' },
    { pattern: /title="Mature"/i, name: 'Mature' },
    { pattern: /title="Explicit"/i, name: 'Explicit' },
    { pattern: /title="Not Rated"/i, name: 'Not Rated' },
    { pattern: /class="[^"]*rating-general[^"]*"/i, name: 'General Audiences' },
    { pattern: /class="[^"]*rating-teen[^"]*"/i, name: 'Teen And Up Audiences' },
    { pattern: /class="[^"]*rating-mature[^"]*"/i, name: 'Mature' },
    { pattern: /class="[^"]*rating-explicit[^"]*"/i, name: 'Explicit' }
  ];
  
  for (const ratingInfo of ratingPatterns) {
    if (ratingInfo.pattern.test(workHtml)) {
      rating = ratingInfo.name;
      console.log(`Rating: ${rating}`);
      break;
    }
  }
  
  // Log a sample of the HTML for debugging
  if (workIndex === 1) {
    console.log('=== SAMPLE HTML (first 2000 chars) ===');
    console.log(workHtml.substring(0, 2000));
    console.log('=== END SAMPLE HTML ===');
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
  
  console.log(`=== Work ${workIndex} parsed successfully ===`);
  console.log(`Final result:`, JSON.stringify(result, null, 2));
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
