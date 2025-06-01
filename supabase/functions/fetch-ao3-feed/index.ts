
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

    // Use AO3's official RSS feed endpoint
    const ao3RssUrl = 'https://archiveofourown.org/tags/Cinderella%20Boy%20-%20Punko%20(Webcomic)/works.rss';
    
    console.log('Fetching AO3 RSS feed...');
    
    const response = await fetch(ao3RssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Reader)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
    }

    const rssText = await response.text();
    console.log(`RSS feed fetched successfully, length: ${rssText.length}`);

    // Parse the RSS XML
    const works = parseRSSFeed(rssText);
    console.log(`Parsed ${works.length} works from RSS feed`);

    if (works.length === 0) {
      console.log('No works found in RSS feed');
      console.log('RSS sample:', rssText.substring(0, 1000));
    }

    // Update feed metadata
    const { error: metadataError } = await supabaseClient
      .from('feed_metadata')
      .upsert({
        feed_url: ao3RssUrl,
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
        const { error } = await supabaseClient
          .from('rss_items')
          .upsert(work, {
            onConflict: 'link'
          });
        
        if (error) {
          console.error('Error upserting work:', error);
          errorCount++;
        } else {
          successCount++;
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
        message: `Successfully processed ${works.length} works from RSS feed (${successCount} stored/updated, ${errorCount} errors)`,
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

function parseRSSFeed(rssText: string) {
  const works = [];
  
  try {
    // Extract channel title and description
    const channelTitleMatch = rssText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    const channelDescMatch = rssText.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
    
    console.log('Channel title:', channelTitleMatch?.[1]);
    console.log('Channel description:', channelDescMatch?.[1]);

    // Extract all <item> elements
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(rssText)) !== null) {
      const itemXml = itemMatch[1];
      
      try {
        const work = parseRSSItem(itemXml);
        if (work) {
          works.push(work);
        }
      } catch (error) {
        console.error('Error parsing RSS item:', error);
        console.log('Item XML snippet:', itemXml.substring(0, 200));
      }
    }
    
    console.log(`Found ${works.length} items in RSS feed`);
    
  } catch (error) {
    console.error('Error parsing RSS XML:', error);
    console.log('RSS XML snippet:', rssText.substring(0, 500));
  }
  
  return works;
}

function parseRSSItem(itemXml: string) {
  // Extract title
  const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
  const title = titleMatch?.[1]?.trim();
  
  if (!title) {
    console.log('No title found in RSS item');
    return null;
  }

  // Extract link
  const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
  const link = linkMatch?.[1]?.trim();
  
  if (!link) {
    console.log('No link found in RSS item');
    return null;
  }

  // Extract description/summary
  const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
  const description = descMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '';

  // Extract publication date
  const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
  const pubDateStr = pubDateMatch?.[1]?.trim();
  let published_date = new Date().toISOString();
  
  if (pubDateStr) {
    try {
      published_date = new Date(pubDateStr).toISOString();
    } catch (e) {
      console.log('Could not parse date:', pubDateStr);
    }
  }

  // Extract author from description or other fields
  let author = 'Unknown';
  const authorMatch = itemXml.match(/<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>/) || 
                     description.match(/by ([^<\n]+)/i);
  if (authorMatch) {
    author = authorMatch[1].trim();
  }

  // Try to extract additional metadata from description
  const tags = [];
  const tagMatches = description.match(/(?:Tags?|Fandom|Rating|Pairing):\s*([^<\n]+)/gi);
  if (tagMatches) {
    tagMatches.forEach(match => {
      const tagContent = match.split(':')[1]?.trim();
      if (tagContent) {
        tags.push(...tagContent.split(',').map(t => t.trim()));
      }
    });
  }

  // Extract word count if available
  const wordCountMatch = description.match(/(\d+(?:,\d+)*)\s*words/i);
  const word_count = wordCountMatch ? parseInt(wordCountMatch[1].replace(/,/g, '')) : null;

  // Extract chapters if available
  const chaptersMatch = description.match(/(\d+(?:\/\d+)?)\s*chapters/i);
  const chapters = chaptersMatch ? chaptersMatch[1] : null;

  // Extract rating if available
  const ratingMatch = description.match(/Rating:\s*([^<\n,]+)/i);
  const rating = ratingMatch ? ratingMatch[1].trim() : null;

  // Generate a unique ID from the link
  const workId = link.match(/\/works\/(\d+)/)?.[1] || Date.now().toString();

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
