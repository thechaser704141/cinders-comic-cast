
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const ao3Url = 'https://archiveofourown.org/tags/Cinderella%20Boy%20-%20Punko%20(Webcomic)/works';
    
    console.log('Fetching AO3 page...');
    
    // More realistic browser headers to avoid detection
    let response;
    let retries = 3;
    
    while (retries > 0) {
      try {
        response = await fetch(ao3Url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Connection': 'keep-alive'
          },
          signal: AbortSignal.timeout(45000) // 45 second timeout
        });
        
        if (response.ok) break;
        
        console.log(`Attempt failed with status ${response.status}, retries left: ${retries - 1}`);
        retries--;
        
        if (retries > 0) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, (4 - retries) * 5000));
        }
      } catch (error) {
        console.log(`Fetch error: ${error.message}, retries left: ${retries - 1}`);
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, (4 - retries) * 5000));
        } else {
          throw error;
        }
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Failed to fetch AO3 page after retries: ${response?.status || 'unknown'}`);
    }

    const html = await response.text();
    console.log(`HTML fetched successfully, length: ${html.length}`);

    // Parse the HTML to extract work information
    const works = parseAO3Works(html);
    console.log(`Parsed ${works.length} works`);

    if (works.length === 0) {
      console.log('No works found, HTML structure might have changed');
      console.log('Sample HTML snippet:', html.substring(0, 2000));
    }

    // Store or update feed metadata - use INSERT with ON CONFLICT
    const { error: metadataError } = await supabaseClient
      .from('feed_metadata')
      .insert({
        feed_url: ao3Url,
        title: 'Cinderella Boy - Punko (Webcomic) Works',
        description: 'Latest fanfiction works for Cinderella Boy by Punko',
        last_updated: new Date().toISOString(),
        total_items: works.length
      })
      .onConflict('feed_url')
      .update({
        title: 'Cinderella Boy - Punko (Webcomic) Works',
        description: 'Latest fanfiction works for Cinderella Boy by Punko',
        last_updated: new Date().toISOString(),
        total_items: works.length
      });

    if (metadataError) {
      console.error('Error updating metadata:', metadataError);
    }

    // Store new works in database - check for existing works first
    let successCount = 0;
    let errorCount = 0;
    
    for (const work of works) {
      try {
        // First check if work exists
        const { data: existingWork } = await supabaseClient
          .from('rss_items')
          .select('id')
          .eq('link', work.link)
          .single();

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
            .eq('link', work.link);
          
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
      } catch (err) {
        console.error('Exception processing work:', err);
        errorCount++;
      }
    }

    console.log(`Successfully processed ${successCount} works, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully processed ${works.length} works (${successCount} stored/updated, ${errorCount} errors)`,
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

function parseAO3Works(html: string) {
  const works = [];
  
  // Look for the work blurbs in different ways
  const workPatterns = [
    /<li[^>]*class="work blurb group"[^>]*>([\s\S]*?)<\/li>/g,
    /<li[^>]*class="[^"]*work[^"]*blurb[^"]*"[^>]*>([\s\S]*?)<\/li>/g,
    /<article[^>]*class="[^"]*work[^"]*"[^>]*>([\s\S]*?)<\/article>/g,
    /<div[^>]*class="work blurb group"[^>]*>([\s\S]*?)<\/div>/g
  ];

  for (const pattern of workPatterns) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(html)) !== null) {
      try {
        const workHtml = match[1];
        const work = parseWorkItem(workHtml);
        if (work && !works.find(w => w.link === work.link)) {
          works.push(work);
        }
      } catch (error) {
        console.error('Error parsing work item:', error);
      }
    }
    
    if (works.length > 0) break; // If we found works with this pattern, use them
  }

  // If no works found, try a more aggressive approach
  if (works.length === 0) {
    console.log('Trying alternative parsing method...');
    const headingMatches = html.match(/<h4[^>]*class="heading"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g);
    if (headingMatches) {
      console.log(`Found ${headingMatches.length} heading matches`);
      for (const match of headingMatches) {
        const linkMatch = match.match(/href="([^"]*)"/);
        const titleMatch = match.match(/>([^<]*)<\/a>/);
        if (linkMatch && titleMatch) {
          const link = linkMatch[1].startsWith('http') ? linkMatch[1] : `https://archiveofourown.org${linkMatch[1]}`;
          const workId = link.match(/\/works\/(\d+)/)?.[1] || Date.now().toString();
          works.push({
            id: workId,
            title: titleMatch[1].trim(),
            description: '',
            link: link,
            author: 'Unknown',
            published_date: new Date().toISOString(),
            tags: [],
            word_count: null,
            chapters: null,
            fandom: 'Cinderella Boy - Punko (Webcomic)',
            rating: null
          });
        }
      }
    }
  }

  return works;
}

function parseWorkItem(workHtml: string) {
  // Multiple patterns for title and link extraction
  const titlePatterns = [
    /<h4[^>]*class="heading"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/,
    /<h3[^>]*class="heading"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/,
    /<a[^>]*href="(\/works\/[^"]*)"[^>]*>([^<]*)<\/a>/
  ];

  let titleMatch = null;
  for (const pattern of titlePatterns) {
    titleMatch = workHtml.match(pattern);
    if (titleMatch) break;
  }

  if (!titleMatch) {
    console.log('No title match found in work HTML snippet:', workHtml.substring(0, 200));
    return null;
  }

  const link = titleMatch[1].startsWith('http') ? titleMatch[1] : `https://archiveofourown.org${titleMatch[1]}`;
  const title = titleMatch[2].trim();

  // Extract author with multiple patterns
  const authorPatterns = [
    /<a[^>]*rel="author"[^>]*>([^<]*)<\/a>/,
    /<a[^>]*href="\/users\/[^"]*"[^>]*>([^<]*)<\/a>/
  ];
  
  let author = 'Unknown';
  for (const pattern of authorPatterns) {
    const authorMatch = workHtml.match(pattern);
    if (authorMatch) {
      author = authorMatch[1].trim();
      break;
    }
  }

  // Extract summary/description with multiple patterns
  const summaryPatterns = [
    /<blockquote[^>]*class="userstuff summary"[^>]*>([\s\S]*?)<\/blockquote>/,
    /<blockquote[^>]*class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/,
    /<div[^>]*class="summary"[^>]*>([\s\S]*?)<\/div>/
  ];
  
  let description = '';
  for (const pattern of summaryPatterns) {
    const summaryMatch = workHtml.match(pattern);
    if (summaryMatch) {
      description = summaryMatch[1]
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      break;
    }
  }

  // Extract tags with better pattern
  const tagMatches = workHtml.match(/<a[^>]*class="tag"[^>]*>([^<]*)<\/a>/g) || [];
  const tags = tagMatches.map(tag => {
    const tagMatch = tag.match(/>([^<]*)</);
    return tagMatch ? tagMatch[1].trim() : '';
  }).filter(tag => tag.length > 0);

  // Extract metadata with improved patterns
  const wordCountMatch = workHtml.match(/(\d+(?:,\d+)*)\s*words/i);
  const word_count = wordCountMatch ? parseInt(wordCountMatch[1].replace(/,/g, '')) : null;

  const chaptersMatch = workHtml.match(/(\d+(?:\/\d+)?)\s*chapters/i);
  const chapters = chaptersMatch ? chaptersMatch[1] : null;

  const ratingMatch = workHtml.match(/<span[^>]*class="rating[^"]*"[^>]*title="([^"]*)">/);
  const rating = ratingMatch ? ratingMatch[1] : null;

  // Extract date with multiple patterns
  const datePatterns = [
    /<p[^>]*class="datetime"[^>]*>([^<]*)<\/p>/,
    /<span[^>]*class="datetime"[^>]*>([^<]*)<\/span>/,
    /(\d{1,2}\s+\w+\s+\d{4})/
  ];
  
  let published_date = null;
  for (const pattern of datePatterns) {
    const dateMatch = workHtml.match(pattern);
    if (dateMatch) {
      const dateText = dateMatch[1].trim();
      published_date = parseDate(dateText);
      if (published_date) break;
    }
  }

  // Generate a unique ID based on the work URL
  const workId = link.match(/\/works\/(\d+)/)?.[1] || Date.now().toString();

  return {
    id: workId,
    title,
    description,
    link,
    author,
    published_date,
    tags,
    word_count,
    chapters,
    fandom: 'Cinderella Boy - Punko (Webcomic)',
    rating
  };
}

function parseDate(dateText: string): string | null {
  const now = new Date();
  
  // Handle relative dates
  if (dateText.includes('day ago')) {
    const days = parseInt(dateText.match(/(\d+)/)?.[1] || '1');
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  } else if (dateText.includes('week ago')) {
    const weeks = parseInt(dateText.match(/(\d+)/)?.[1] || '1');
    return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (dateText.includes('month ago')) {
    const months = parseInt(dateText.match(/(\d+)/)?.[1] || '1');
    return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000).toISOString();
  } else if (dateText.includes('year ago')) {
    const years = parseInt(dateText.match(/(\d+)/)?.[1] || '1');
    return new Date(now.getTime() - years * 365 * 24 * 60 * 60 * 1000).toISOString();
  }
  
  // Try to parse absolute dates
  try {
    const parsed = new Date(dateText);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  } catch (e) {
    console.error('Error parsing date:', dateText, e);
  }
  
  return now.toISOString();
}
