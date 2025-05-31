
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
    const response = await fetch(ao3Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSS Feed Bot/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch AO3 page: ${response.status}`);
    }

    const html = await response.text();
    console.log('HTML fetched, parsing works...');

    // Parse the HTML to extract work information
    const works = parseAO3Works(html);
    console.log(`Parsed ${works.length} works`);

    // Store or update feed metadata
    const { error: metadataError } = await supabaseClient
      .from('feed_metadata')
      .upsert({
        feed_url: ao3Url,
        title: 'Cinderella Boy - Punko (Webcomic) Works',
        description: 'Latest fanfiction works for Cinderella Boy by Punko',
        last_updated: new Date().toISOString(),
        total_items: works.length
      });

    if (metadataError) {
      console.error('Error updating metadata:', metadataError);
    }

    // Store new works in database
    for (const work of works) {
      const { error } = await supabaseClient
        .from('rss_items')
        .upsert(work, { onConflict: 'link' });
      
      if (error) {
        console.error('Error inserting work:', error);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully processed ${works.length} works`,
        works: works 
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
  
  // Updated regex to match AO3's current HTML structure
  const workRegex = /<li[^>]*class="work blurb group"[^>]*>([\s\S]*?)<\/li>/g;
  let match;

  while ((match = workRegex.exec(html)) !== null) {
    try {
      const workHtml = match[1];
      const work = parseWorkItem(workHtml);
      if (work) {
        works.push(work);
      }
    } catch (error) {
      console.error('Error parsing work item:', error);
    }
  }

  return works;
}

function parseWorkItem(workHtml: string) {
  // Extract title and link - updated pattern
  const titleMatch = workHtml.match(/<h4[^>]*class="heading"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/);
  if (!titleMatch) return null;

  const link = `https://archiveofourown.org${titleMatch[1]}`;
  const title = titleMatch[2].trim();

  // Extract author - updated pattern
  const authorMatch = workHtml.match(/<a[^>]*rel="author"[^>]*>([^<]*)<\/a>/);
  const author = authorMatch ? authorMatch[1].trim() : 'Unknown';

  // Extract summary/description - updated pattern
  const summaryMatch = workHtml.match(/<blockquote[^>]*class="userstuff summary"[^>]*>([\s\S]*?)<\/blockquote>/);
  let description = '';
  if (summaryMatch) {
    description = summaryMatch[1]
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // Extract tags - updated pattern
  const tagMatches = workHtml.match(/<a[^>]*class="tag"[^>]*>([^<]*)<\/a>/g);
  const tags = tagMatches ? tagMatches.map(tag => {
    const tagMatch = tag.match(/>([^<]*)</);
    return tagMatch ? tagMatch[1].trim() : '';
  }).filter(tag => tag.length > 0) : [];

  // Extract word count - updated pattern
  const wordCountMatch = workHtml.match(/(\d+(?:,\d+)*)\s*words/i);
  const word_count = wordCountMatch ? parseInt(wordCountMatch[1].replace(/,/g, '')) : null;

  // Extract chapters - updated pattern
  const chaptersMatch = workHtml.match(/(\d+(?:\/\d+)?)\s*chapters/i);
  const chapters = chaptersMatch ? chaptersMatch[1] : null;

  // Extract rating - updated pattern
  const ratingMatch = workHtml.match(/<span[^>]*class="rating[^"]*"[^>]*title="([^"]*)">/);
  const rating = ratingMatch ? ratingMatch[1] : null;

  // Extract date - updated pattern
  const dateMatch = workHtml.match(/<p[^>]*class="datetime"[^>]*>([^<]*)<\/p>/);
  let published_date = null;
  if (dateMatch) {
    const dateText = dateMatch[1].trim();
    published_date = parseRelativeDate(dateText);
  }

  // Generate a unique ID based on the work URL
  const workId = titleMatch[1].replace(/\D/g, ''); // Extract work ID from URL

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

function parseRelativeDate(dateText: string): string | null {
  const now = new Date();
  
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
  
  return now.toISOString();
}
