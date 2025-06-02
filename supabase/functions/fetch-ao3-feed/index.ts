
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
  
  // EXTENSIVE DESCRIPTION DEBUGGING
  let description = null;
  console.log('=== DESCRIPTION DEBUGGING ===');
  
  // Log a sample of HTML around blockquote areas
  const blockquoteMatches = workHtml.match(/<blockquote[\s\S]{0,500}/gi);
  if (blockquoteMatches) {
    console.log(`Found ${blockquoteMatches.length} blockquote patterns:`);
    blockquoteMatches.forEach((match, i) => {
      console.log(`Blockquote ${i + 1}: ${match.substring(0, 200)}...`);
    });
  } else {
    console.log('No blockquote elements found at all');
  }
  
  // Try multiple description patterns
  const descriptionPatterns = [
    /<blockquote\s+class="userstuff\s+summary"[^>]*>([\s\S]*?)<\/blockquote>/i,
    /<blockquote[^>]*class="[^"]*userstuff[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i,
    /<blockquote[^>]*class="[^"]*summary[^"]*userstuff[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i,
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i
  ];
  
  for (let i = 0; i < descriptionPatterns.length; i++) {
    const match = workHtml.match(descriptionPatterns[i]);
    if (match) {
      console.log(`Description found with pattern ${i + 1}!`);
      let descContent = match[1];
      
      description = descContent
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, ' ')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      
      if (description.length > 200) {
        description = description.substring(0, 200) + '...';
      }
      console.log(`Cleaned description: "${description}"`);
      break;
    }
  }
  
  if (!description) {
    console.log('No description found with any pattern');
  }
  
  // EXTENSIVE TAGS DEBUGGING
  const tags = [];
  console.log('=== TAGS DEBUGGING ===');
  
  // Log sample HTML around tags areas
  const tagsMatches = workHtml.match(/<ul[\s\S]{0,500}/gi);
  if (tagsMatches) {
    console.log(`Found ${tagsMatches.length} ul patterns:`);
    tagsMatches.forEach((match, i) => {
      if (match.includes('tag')) {
        console.log(`Tags UL ${i + 1}: ${match.substring(0, 300)}...`);
      }
    });
  }
  
  // Try multiple tag patterns
  const tagPatterns = [
    /<ul\s+class="tags\s+commas"[^>]*>([\s\S]*?)<\/ul>/i,
    /<ul[^>]*class="[^"]*tags[^"]*commas[^"]*"[^>]*>([\s\S]*?)<\/ul>/i,
    /<ul[^>]*class="[^"]*commas[^"]*tags[^"]*"[^>]*>([\s\S]*?)<\/ul>/i,
    /<ul[^>]*>([\s\S]*?)<\/ul>/i
  ];
  
  for (let i = 0; i < tagPatterns.length; i++) {
    const match = workHtml.match(tagPatterns[i]);
    if (match && match[1].includes('tag')) {
      console.log(`Tags found with pattern ${i + 1}!`);
      const tagsContent = match[1];
      console.log(`Tags content sample: ${tagsContent.substring(0, 300)}...`);
      
      const tagRegex = /<a\s+class="tag"[^>]*>([^<]+)<\/a>/gi;
      let tagMatch;
      
      while ((tagMatch = tagRegex.exec(tagsContent)) !== null) {
        let tag = tagMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\*/g, '/')
          .trim();
        
        if (tag && 
            tag !== 'Cinderella Boy - Punko (Webcomic)' && 
            tag !== 'No Archive Warnings Apply' &&
            !tags.includes(tag)) {
          tags.push(tag);
          console.log(`Found tag: "${tag}"`);
        }
      }
      break;
    }
  }
  
  console.log(`Total tags found: ${tags.length}`);
  
  // EXTENSIVE DATE DEBUGGING
  let published_date = null;
  console.log('=== DATE DEBUGGING ===');
  
  // Log sample HTML around datetime areas
  const datetimeMatches = workHtml.match(/<p[\s\S]{0,200}/gi);
  if (datetimeMatches) {
    const dateMatches = datetimeMatches.filter(match => 
      match.includes('datetime') || /\d{2}\s+\w{3}\s+\d{4}/.test(match)
    );
    console.log(`Found ${dateMatches.length} potential date patterns:`);
    dateMatches.forEach((match, i) => {
      console.log(`Date pattern ${i + 1}: ${match}`);
    });
  }
  
  // Try multiple date patterns
  const datePatterns = [
    /<p\s+class="datetime"[^>]*>([^<]+)<\/p>/i,
    /<p[^>]*class="[^"]*datetime[^"]*"[^>]*>([^<]+)<\/p>/i,
    /<p[^>]*>(\d{2}\s+\w{3}\s+\d{4})<\/p>/i,
    /(\d{2}\s+\w{3}\s+\d{4})/i
  ];
  
  for (let i = 0; i < datePatterns.length; i++) {
    const match = workHtml.match(datePatterns[i]);
    if (match) {
      console.log(`Date found with pattern ${i + 1}: "${match[1]}"`);
      const dateStr = match[1].trim();
      try {
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          published_date = parsedDate.toISOString();
          console.log(`Successfully parsed date: ${published_date}`);
          break;
        } else {
          console.log(`Failed to parse date: ${dateStr}`);
        }
      } catch (e) {
        console.log(`Date parsing error: ${e.message}`);
      }
    }
  }
  
  if (!published_date) {
    console.log('No date found with any pattern');
  }
  
  // Extract stats (word count, chapters) with debugging
  let word_count = null;
  let chapters = null;
  
  console.log('=== STATS DEBUGGING ===');
  
  // Log stats areas
  const statsMatches = workHtml.match(/<dd[\s\S]{0,100}/gi);
  if (statsMatches) {
    console.log(`Found ${statsMatches.length} dd elements:`);
    statsMatches.forEach((match, i) => {
      console.log(`DD ${i + 1}: ${match}`);
    });
  }
  
  // Look for words
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
        console.log(`Word count found: ${word_count}`);
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
      console.log(`Chapters found: ${chapters}`);
      break;
    }
  }
  
  // Extract rating from required-tags section
  let rating = null;
  const ratingPatterns = [
    { pattern: /<span[^>]*class="[^"]*rating-general-audience[^"]*"[^>]*title="General Audiences"/i, name: 'General Audiences' },
    { pattern: /<span[^>]*class="[^"]*rating-teen[^"]*"[^>]*title="Teen And Up Audiences"/i, name: 'Teen And Up Audiences' },
    { pattern: /<span[^>]*class="[^"]*rating-mature[^"]*"[^>]*title="Mature"/i, name: 'Mature' },
    { pattern: /<span[^>]*class="[^"]*rating-explicit[^"]*"[^>]*title="Explicit"/i, name: 'Explicit' },
    { pattern: /<span[^>]*class="[^"]*rating-notrated[^"]*"[^>]*title="Not Rated"/i, name: 'Not Rated' },
    { pattern: /title="General Audiences"/i, name: 'General Audiences' },
    { pattern: /title="Teen And Up Audiences"/i, name: 'Teen And Up Audiences' },
    { pattern: /title="Mature"/i, name: 'Mature' },
    { pattern: /title="Explicit"/i, name: 'Explicit' },
    { pattern: /title="Not Rated"/i, name: 'Not Rated' }
  ];
  
  for (const ratingInfo of ratingPatterns) {
    if (ratingInfo.pattern.test(workHtml)) {
      rating = ratingInfo.name;
      console.log(`Rating: ${rating}`);
      break;
    }
  }
  
  // EXTENSIVE HTML LOGGING for debugging
  if (workIndex <= 3) {
    console.log(`=== FULL HTML SAMPLE FOR WORK ${workIndex} (first 2000 chars) ===`);
    console.log(workHtml.substring(0, 2000));
    console.log('=== END HTML SAMPLE ===');
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
  
  console.log(`=== FINAL RESULT FOR WORK ${workIndex} ===`);
  console.log(JSON.stringify(result, null, 2));
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
