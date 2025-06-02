
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
    
    // Look for the main work index with more specific patterns
    const workIndexPattern = /<ol[^>]*class="[^"]*work[^"]*index[^"]*"[^>]*>([\s\S]*?)<\/ol>/i;
    const workIndexMatch = html.match(workIndexPattern);
    
    if (workIndexMatch) {
      console.log('Found work index section');
      const workIndexHtml = workIndexMatch[1];
      
      // Extract individual work items from the index
      const workItemPattern = /<li[^>]*class="[^"]*work[^"]*blurb[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
      let workMatch;
      let matchCount = 0;
      
      while ((workMatch = workItemPattern.exec(workIndexHtml)) !== null) {
        matchCount++;
        console.log(`Processing work match ${matchCount}`);
        
        try {
          const work = parseWorkFromBlurb(workMatch[1]);
          if (work) {
            console.log(`Successfully parsed work: "${work.title}" published on ${work.published_date}`);
            works.push(work);
          } else {
            console.log(`Failed to parse work from match ${matchCount}`);
          }
        } catch (error) {
          console.error(`Error parsing individual work ${matchCount}:`, error);
        }
      }
      
      console.log(`Found ${matchCount} work matches in index`);
    } else {
      console.log('Could not find work index section, trying fallback patterns...');
      
      // Fallback: look for individual work blurbs directly
      const fallbackPattern = /<li[^>]*class="[^"]*work[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
      let workMatch;
      let matchCount = 0;
      
      while ((workMatch = fallbackPattern.exec(html)) !== null) {
        matchCount++;
        console.log(`Processing fallback work match ${matchCount}`);
        
        try {
          const work = parseWorkFromBlurb(workMatch[1]);
          if (work) {
            console.log(`Successfully parsed work: "${work.title}" published on ${work.published_date}`);
            works.push(work);
          }
        } catch (error) {
          console.error(`Error parsing fallback work ${matchCount}:`, error);
        }
      }
      
      console.log(`Found ${matchCount} works using fallback pattern`);
    }
    
    console.log(`Successfully parsed ${works.length} works from HTML`);
    
    // Debug: if no works found, show some sample HTML
    if (works.length === 0) {
      console.log('No works found. HTML sample:', html.substring(0, 500));
      
      // Check for specific indicators
      if (html.includes('No works found')) {
        console.log('AO3 reports no works found for this tag');
      } else if (html.includes('sign in') || html.includes('log in')) {
        console.log('May be hitting a login requirement');
      }
    }
    
  } catch (error) {
    console.error('Error parsing works from HTML:', error);
  }
  
  return works;
}

function parseWorkFromBlurb(workHtml) {
  console.log('Parsing work blurb...');
  
  // Look for the work header/heading section first
  const headingPattern = /<div[^>]*class="[^"]*header[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
  const headingMatch = workHtml.match(headingPattern);
  
  let titleLink = null;
  let title = null;
  
  if (headingMatch) {
    const headingHtml = headingMatch[1];
    
    // Extract title and link from heading
    const titleLinkPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/i;
    const titleLinkMatch = headingHtml.match(titleLinkPattern);
    
    if (titleLinkMatch) {
      titleLink = titleLinkMatch[1].startsWith('http') ? titleLinkMatch[1] : 'https://archiveofourown.org' + titleLinkMatch[1];
      title = titleLinkMatch[2].replace(/<[^>]*>/g, '').trim();
    }
  }
  
  // Fallback: look for any link that looks like a work link
  if (!titleLink || !title) {
    const fallbackTitlePattern = /<a[^>]+href="(\/works\/[^"]+)"[^>]*>(.*?)<\/a>/i;
    const fallbackMatch = workHtml.match(fallbackTitlePattern);
    
    if (fallbackMatch) {
      titleLink = 'https://archiveofourown.org' + fallbackMatch[1];
      title = fallbackMatch[2].replace(/<[^>]*>/g, '').trim();
    }
  }
  
  if (!titleLink || !title) {
    console.log('Could not find title/link in work blurb');
    return null;
  }
  
  console.log(`Parsing work: "${title}"`);
  
  // Extract author
  let author = 'Unknown';
  const authorPatterns = [
    /<a[^>]+rel="author"[^>]*>(.*?)<\/a>/i,
    /<a[^>]+href="\/users\/[^"]*"[^>]*>(.*?)<\/a>/i,
    /by\s+<a[^>]*>(.*?)<\/a>/i
  ];
  
  for (const pattern of authorPatterns) {
    const authorMatch = workHtml.match(pattern);
    if (authorMatch) {
      author = authorMatch[1].replace(/<[^>]*>/g, '').trim();
      break;
    }
  }
  
  // Extract summary/description with improved patterns
  let description = '';
  const summaryPatterns = [
    /<blockquote[^>]*class="[^"]*summary[^"]*"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/blockquote>/i,
    /<blockquote[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i,
    /<div[^>]*class="[^"]*summary[^"]*"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i,
    /<div[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<p[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  ];
  
  for (const pattern of summaryPatterns) {
    const summaryMatch = workHtml.match(pattern);
    if (summaryMatch) {
      description = summaryMatch[1]
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') // Decode entities
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      if (description) {
        console.log(`Found description: ${description.substring(0, 100)}...`);
        break;
      }
    }
  }
  
  // Extract tags with improved parsing
  const tags = [];
  
  // Look for the tags section specifically - try multiple patterns
  const tagsSectionPatterns = [
    /<ul[^>]*class="[^"]*tags[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi,
    /<div[^>]*class="[^"]*tags[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<section[^>]*class="[^"]*tags[^"]*"[^>]*>([\s\S]*?)<\/section>/gi
  ];
  
  for (const tagsSectionPattern of tagsSectionPatterns) {
    let tagsSectionMatch;
    while ((tagsSectionMatch = tagsSectionPattern.exec(workHtml)) !== null) {
      console.log('Found tags section');
      const tagsHtml = tagsSectionMatch[1];
      
      // Extract individual tag links with more comprehensive patterns
      const tagPatterns = [
        /<a[^>]*class="[^"]*tag[^"]*"[^>]*>([^<]*)<\/a>/gi,
        /<span[^>]*class="[^"]*tag[^"]*"[^>]*>([^<]*)<\/span>/gi,
        /<li[^>]*class="[^"]*tag[^"]*"[^>]*><a[^>]*>([^<]*)<\/a>/gi,
        /<li[^>]*><a[^>]*class="[^"]*tag[^"]*"[^>]*>([^<]*)<\/a>/gi
      ];
      
      for (const tagPattern of tagPatterns) {
        let tagMatch;
        while ((tagMatch = tagPattern.exec(tagsHtml)) !== null) {
          let tag = tagMatch[1].trim();
          // Clean up the tag text
          tag = tag.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
          
          // Skip empty tags, main fandom tag, and duplicates
          if (tag && !tags.includes(tag) && tag !== 'Cinderella Boy - Punko (Webcomic)' && tag.length > 0) {
            tags.push(tag);
          }
        }
      }
    }
  }
  
  // If no tags found, try a broader search
  if (tags.length === 0) {
    const broadTagPattern = /<a[^>]*href="\/tags\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
    let tagMatch;
    while ((tagMatch = broadTagPattern.exec(workHtml)) !== null) {
      let tag = tagMatch[1].trim();
      tag = tag.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      
      if (tag && !tags.includes(tag) && tag !== 'Cinderella Boy - Punko (Webcomic)' && tag.length > 0) {
        tags.push(tag);
      }
    }
  }
  
  console.log(`Found ${tags.length} tags: ${tags.slice(0, 5).join(', ')}${tags.length > 5 ? '...' : ''}`);
  
  // Extract stats
  let word_count = null;
  let chapters = null;
  
  const statsPatterns = [
    /<dl[^>]+class="[^"]*stats[^"]*"[^>]*>([\s\S]*?)<\/dl>/i,
    /<div[^>]+class="[^"]*stats[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]+class="[^"]*stats[^"]*"[^>]*>([\s\S]*?)<\/section>/i
  ];
  
  for (const statsPattern of statsPatterns) {
    const statsMatch = workHtml.match(statsPattern);
    if (statsMatch) {
      const statsHtml = statsMatch[1];
      
      // Word count - try multiple patterns
      const wordPatterns = [
        /<dt[^>]*>Words?:<\/dt>\s*<dd[^>]*>([\d,]+)<\/dd>/i,
        /<span[^>]*class="[^"]*words[^"]*"[^>]*>[\s\S]*?([\d,]+)[\s\S]*?<\/span>/i,
        /Words?:\s*([\d,]+)/i
      ];
      
      for (const wordPattern of wordPatterns) {
        const wordMatch = statsHtml.match(wordPattern);
        if (wordMatch) {
          word_count = parseInt(wordMatch[1].replace(/,/g, ''));
          console.log(`Found word count: ${word_count}`);
          break;
        }
      }
      
      // Chapters - try multiple patterns
      const chapterPatterns = [
        /<dt[^>]*>Chapters?:<\/dt>\s*<dd[^>]*>(\d+(?:\/\d+)?)<\/dd>/i,
        /<span[^>]*class="[^"]*chapters[^"]*"[^>]*>[\s\S]*?(\d+(?:\/\d+)?)[\s\S]*?<\/span>/i,
        /Chapters?:\s*(\d+(?:\/\d+)?)/i
      ];
      
      for (const chapterPattern of chapterPatterns) {
        const chapterMatch = statsHtml.match(chapterPattern);
        if (chapterMatch) {
          chapters = chapterMatch[1];
          console.log(`Found chapters: ${chapters}`);
          break;
        }
      }
      
      break; // Found stats section, no need to try other patterns
    }
  }
  
  // Extract rating from required tags section
  let rating = null;
  const requiredTagsPatterns = [
    /<ul[^>]*class="[^"]*required[^"]*tags[^"]*"[^>]*>([\s\S]*?)<\/ul>/i,
    /<div[^>]*class="[^"]*required[^"]*tags[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*class="[^"]*required[^"]*tags[^"]*"[^>]*>([\s\S]*?)<\/section>/i
  ];
  
  for (const requiredTagsPattern of requiredTagsPatterns) {
    const requiredTagsMatch = workHtml.match(requiredTagsPattern);
    
    if (requiredTagsMatch) {
      const requiredTagsHtml = requiredTagsMatch[1];
      const ratingTags = ['General Audiences', 'Teen And Up Audiences', 'Mature', 'Explicit', 'Not Rated'];
      
      for (const ratingTag of ratingTags) {
        if (requiredTagsHtml.includes(ratingTag)) {
          rating = ratingTag;
          console.log(`Found rating: ${rating}`);
          break;
        }
      }
      break;
    }
  }
  
  // If no rating found in required tags, try broader search
  if (!rating) {
    const broadRatingPattern = /<span[^>]*class="[^"]*rating[^"]*"[^>]*title="([^"]*)"[^>]*>/i;
    const broadRatingMatch = workHtml.match(broadRatingPattern);
    if (broadRatingMatch) {
      rating = broadRatingMatch[1];
      console.log(`Found rating via broad search: ${rating}`);
    }
  }
  
  // Extract published date with improved patterns
  let published_date = null;
  
  // Look for datetime attributes in the work - try multiple patterns
  const dateTimePatterns = [
    /<time[^>]*datetime="([^"]+)"[^>]*>/gi,
    /<span[^>]*datetime="([^"]+)"[^>]*>/gi,
    /<dd[^>]*class="[^"]*published[^"]*"[^>]*datetime="([^"]+)"[^>]*>/gi,
    /<time[^>]*class="[^"]*datetime[^"]*"[^>]*datetime="([^"]+)"[^>]*>/gi
  ];
  
  for (const pattern of dateTimePatterns) {
    let dateMatch;
    while ((dateMatch = pattern.exec(workHtml)) !== null) {
      const dateStr = dateMatch[1];
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        published_date = parsedDate.toISOString();
        console.log(`Found published date: ${dateStr} -> ${published_date}`);
        break;
      }
    }
    if (published_date) break;
  }
  
  // Look for text-based dates in the published section
  if (!published_date) {
    const publishedSectionPatterns = [
      /<dd[^>]*class="[^"]*published[^"]*"[^>]*>(.*?)<\/dd>/i,
      /<span[^>]*class="[^"]*published[^"]*"[^>]*>(.*?)<\/span>/i,
      /<div[^>]*class="[^"]*published[^"]*"[^>]*>(.*?)<\/div>/i
    ];
    
    for (const publishedSectionPattern of publishedSectionPatterns) {
      const publishedSection = workHtml.match(publishedSectionPattern);
      if (publishedSection) {
        const dateText = publishedSection[1].replace(/<[^>]*>/g, '').trim();
        const parsedDate = new Date(dateText);
        if (!isNaN(parsedDate.getTime())) {
          published_date = parsedDate.toISOString();
          console.log(`Found text date: ${dateText} -> ${published_date}`);
          break;
        }
      }
    }
  }
  
  // Look for any date pattern in the entire work blurb
  if (!published_date) {
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{2}\s+\w{3}\s+\d{4})/,
      /(\w{3}\s+\d{1,2},?\s+\d{4})/
    ];
    
    for (const pattern of datePatterns) {
      const match = workHtml.match(pattern);
      if (match) {
        const parsedDate = new Date(match[1]);
        if (!isNaN(parsedDate.getTime())) {
          published_date = parsedDate.toISOString();
          console.log(`Found date pattern: ${match[1]} -> ${published_date}`);
          break;
        }
      }
    }
  }
  
  // Fallback to current date if no published date found
  if (!published_date) {
    published_date = new Date().toISOString();
    console.log(`No published date found, using current date: ${published_date}`);
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
