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

// Helper function to clean HTML text
function cleanHtmlText(text) {
  if (!text) return null;
  return text
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWorksFromHTML(html) {
  const works = [];
  
  try {
    console.log('=== DEBUGGING HTML STRUCTURE ===');
    console.log('HTML length:', html.length);
    
    // Look for the actual AO3 work list structure
    const workListRegex = /<ol[^>]*class="[^"]*work[^"]*index[^"]*"[^>]*>([\s\S]*?)<\/ol>/i;
    const workListMatch = html.match(workListRegex);
    
    if (!workListMatch) {
      console.log('No work list found, trying alternative approach...');
      return works;
    }
    
    console.log('Found work list, extracting individual works...');
    const workListHtml = workListMatch[1];
    
    // Extract individual work items - AO3 uses <li class="work blurb group">
    const workRegex = /<li[^>]*class="[^"]*work[^"]*blurb[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    let workCount = 0;
    
    while ((match = workRegex.exec(workListHtml)) !== null && workCount < 20) {
      workCount++;
      console.log(`\n=== PARSING WORK ${workCount} ===`);
      const workHtml = match[1];
      
      const work = parseIndividualWork(workHtml, workCount);
      if (work && work.title && work.link) {
        console.log(`Successfully parsed work: "${work.title}"`);
        works.push(work);
      } else {
        console.log('Failed to parse work properly');
      }
    }
    
    console.log(`\nFinal result: ${works.length} works parsed`);
    
  } catch (error) {
    console.error('Error in parseWorksFromHTML:', error);
  }
  
  return works;
}

function parseIndividualWork(workHtml, workIndex) {
  console.log(`Parsing work ${workIndex}...`);
  
  // Extract title and link
  let title = null;
  let link = null;
  
  // AO3 structure: <h4 class="heading"><a href="/works/123456">Title</a>
  const titleLinkPattern = /<h4[^>]*class="[^"]*heading[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i;
  const match = workHtml.match(titleLinkPattern);
  if (match) {
    link = match[1].startsWith('http') ? match[1] : 'https://archiveofourown.org' + match[1];
    title = cleanHtmlText(match[2]);
    console.log(`Found - Title: "${title}", Link: ${link}`);
  }
  
  if (!title || !link) {
    console.log(`No title/link found for work ${workIndex}`);
    // Log some HTML to debug
    console.log(`Work HTML sample: ${workHtml.substring(0, 300)}`);
    return null;
  }
  
  // Extract author
  let author = null;
  const authorPattern = /<a[^>]*rel="author"[^>]*>([^<]+)<\/a>/i;
  const authorMatch = workHtml.match(authorPattern);
  if (authorMatch) {
    author = cleanHtmlText(authorMatch[1]);
    console.log(`Author found: ${author}`);
  }
  
  // Extract description
  let description = null;
  const descPattern = /<blockquote[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i;
  const descMatch = workHtml.match(descPattern);
  if (descMatch) {
    description = cleanHtmlText(descMatch[1]);
    if (description && description.length > 200) {
      description = description.substring(0, 200) + '...';
    }
    console.log(`Description found: ${description ? description.substring(0, 50) + '...' : 'None'}`);
  }
  
  // Extract tags
  const tags = [];
  const tagRegex = /<a[^>]*class="[^"]*tag[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let tagMatch;
  
  while ((tagMatch = tagRegex.exec(workHtml)) !== null) {
    const tag = cleanHtmlText(tagMatch[1]);
    if (tag && tag !== 'Cinderella Boy - Punko (Webcomic)' && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  console.log(`Tags found: ${tags.length} - ${tags.slice(0, 3).join(', ')}`);
  
  // Extract published date - AO3 stores dates in <p class="datetime">
  let published_date = null;
  
  console.log(`\n--- DATE EXTRACTION DEBUG FOR WORK ${workIndex} ---`);
  
  // Look for the datetime paragraph which contains the actual date
  const datetimePattern = /<p[^>]*class="[^"]*datetime[^"]*"[^>]*>([\s\S]*?)<\/p>/i;
  const datetimeMatch = workHtml.match(datetimePattern);
  
  if (datetimeMatch) {
    console.log(`Found datetime paragraph: ${datetimeMatch[1]}`);
    
    // Within the datetime paragraph, look for the actual datetime attribute
    const datetimeContent = datetimeMatch[1];
    const datetimeAttrPattern = /datetime="([^"]+)"/i;
    const datetimeAttrMatch = datetimeContent.match(datetimeAttrPattern);
    
    if (datetimeAttrMatch) {
      try {
        const dateStr = datetimeAttrMatch[1];
        console.log(`Found datetime attribute: "${dateStr}"`);
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          published_date = parsedDate.toISOString();
          console.log(`Successfully parsed date: ${published_date}`);
        } else {
          console.log(`Failed to parse datetime: "${dateStr}"`);
        }
      } catch (e) {
        console.log(`Date parsing exception: ${e.message}`);
      }
    } else {
      console.log('No datetime attribute found in datetime paragraph');
      console.log(`Datetime content: ${datetimeContent}`);
    }
  } else {
    console.log('No datetime paragraph found');
    
    // Fallback: look for any datetime attribute in the entire work HTML
    const fallbackDatetimePattern = /datetime="([^"]+)"/i;
    const fallbackMatch = workHtml.match(fallbackDatetimePattern);
    if (fallbackMatch) {
      try {
        const dateStr = fallbackMatch[1];
        console.log(`Found fallback datetime: "${dateStr}"`);
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          published_date = parsedDate.toISOString();
          console.log(`Successfully parsed fallback date: ${published_date}`);
        }
      } catch (e) {
        console.log(`Fallback date parsing exception: ${e.message}`);
      }
    }
  }
  
  if (!published_date) {
    console.log('No valid published date found');
    // Log a larger sample to see what we're missing
    console.log(`Work HTML sample (chars 500-1000): ${workHtml.substring(500, 1000)}`);
  }
  
  console.log(`--- END DATE EXTRACTION DEBUG ---\n`);
  
  // Extract statistics (word count, chapters, etc.)
  let word_count = null;
  let chapters = null;
  
  // Look for the stats dl (definition list)
  const statsPattern = /<dl[^>]*class="[^"]*stats[^"]*"[^>]*>([\s\S]*?)<\/dl>/i;
  const statsMatch = workHtml.match(statsPattern);
  
  if (statsMatch) {
    const statsHtml = statsMatch[1];
    console.log(`Found stats section`);
    
    // Extract word count
    const wordsPattern = /<dt[^>]*class="[^"]*words[^"]*"[^>]*>[\s\S]*?<dd[^>]*class="[^"]*words[^"]*"[^>]*>([^<]+)<\/dd>/i;
    const wordsMatch = statsHtml.match(wordsPattern);
    if (wordsMatch) {
      const wordStr = cleanHtmlText(wordsMatch[1]).replace(/,/g, '');
      word_count = parseInt(wordStr) || null;
      console.log(`Word count found: ${word_count}`);
    }
    
    // Extract chapters
    const chaptersPattern = /<dt[^>]*class="[^"]*chapters[^"]*"[^>]*>[\s\S]*?<dd[^>]*class="[^"]*chapters[^"]*"[^>]*>([^<]+)<\/dd>/i;
    const chaptersMatch = statsHtml.match(chaptersPattern);
    if (chaptersMatch) {
      chapters = cleanHtmlText(chaptersMatch[1]);
      console.log(`Chapters found: ${chapters}`);
    }
  }
  
  // Extract rating
  let rating = null;
  const ratingPatterns = [
    /<span[^>]*class="[^"]*rating-general-audience[^"]*"[^>]*title="([^"]*)"[^>]*>/i,
    /<span[^>]*class="[^"]*rating-teen[^"]*"[^>]*title="([^"]*)"[^>]*>/i,
    /<span[^>]*class="[^"]*rating-mature[^"]*"[^>]*title="([^"]*)"[^>]*>/i,
    /<span[^>]*class="[^"]*rating-explicit[^"]*"[^>]*title="([^"]*)"[^>]*>/i,
    /<span[^>]*class="[^"]*rating-notrated[^"]*"[^>]*title="([^"]*)"[^>]*>/i
  ];
  
  for (const pattern of ratingPatterns) {
    const match = workHtml.match(pattern);
    if (match) {
      rating = cleanHtmlText(match[1]);
      console.log(`Rating found: ${rating}`);
      break;
    }
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
  
  console.log(`Final work ${workIndex}:`, JSON.stringify(result, null, 2));
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
    
    console.log('Starting AO3 scraping with improved HTML parsing...');
    
    // Add random delay before starting
    await randomDelay(500, 1500);
    
    const works = [];
    const maxPages = 1; // Start with just 1 page for debugging
    
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
          },
          signal: AbortSignal.timeout(45000)
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
