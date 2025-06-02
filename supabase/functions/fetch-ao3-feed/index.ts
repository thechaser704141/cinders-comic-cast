
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Fetching RSS feed from AO3...')
    
    const rssUrl = 'https://archiveofourown.org/tags/Cinderella%20Boy%20-%20Punko%20(Webcomic)/works.atom'
    const response = await fetch(rssUrl)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status}`)
    }
    
    const xmlText = await response.text()
    console.log('RSS feed fetched successfully')
    
    // Parse XML
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
    
    const entries = xmlDoc.getElementsByTagName('entry')
    console.log(`Found ${entries.length} entries`)
    
    const items = []
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      
      const title = entry.getElementsByTagName('title')[0]?.textContent?.trim()
      const link = entry.getElementsByTagName('link')[0]?.getAttribute('href')
      const author = entry.getElementsByTagName('author')[0]?.getElementsByTagName('name')[0]?.textContent?.trim()
      const published = entry.getElementsByTagName('published')[0]?.textContent?.trim()
      const summary = entry.getElementsByTagName('summary')[0]?.textContent?.trim()
      
      let tags = []
      let rating = null
      let categories = []
      let characters = []
      let relationships = []
      let additionalTags = []
      let wordCount = null
      let chapters = null
      
      if (summary) {
        // Parse HTML content within summary to extract structured data
        try {
          const summaryDoc = parser.parseFromString(summary, 'text/html')
          
          // Extract rating
          const ratingMatch = summary.match(/Rating:\s*<a[^>]*>([^<]+)<\/a>/)
          if (ratingMatch) {
            rating = ratingMatch[1].trim()
          }
          
          // Extract categories
          const categoriesMatch = summary.match(/Categories:\s*((?:<a[^>]*>[^<]+<\/a>(?:,\s*)?)+)/)
          if (categoriesMatch) {
            const categoryMatches = categoriesMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)
            categories = Array.from(categoryMatches, m => m[1].trim())
          }
          
          // Extract characters
          const charactersMatch = summary.match(/Characters:\s*((?:<a[^>]*>[^<]+<\/a>(?:,\s*)?)+)/)
          if (charactersMatch) {
            const characterMatches = charactersMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)
            characters = Array.from(characterMatches, m => m[1].trim())
          }
          
          // Extract relationships
          const relationshipsMatch = summary.match(/Relationships:\s*((?:<a[^>]*>[^<]+<\/a>(?:,\s*)?)+)/)
          if (relationshipsMatch) {
            const relationshipMatches = relationshipsMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)
            relationships = Array.from(relationshipMatches, m => m[1].trim())
          }
          
          // Extract additional tags
          const additionalTagsMatch = summary.match(/Additional Tags:\s*((?:<a[^>]*>[^<]+<\/a>(?:,\s*)?)+)/)
          if (additionalTagsMatch) {
            const additionalTagMatches = additionalTagsMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)
            additionalTags = Array.from(additionalTagMatches, m => m[1].trim())
          }
          
          // Combine all tags for backwards compatibility
          tags = [...characters, ...relationships, ...additionalTags]
          
          // Extract word count and chapters
          const wordCountMatch = summary.match(/Words:\s*(\d+)/)
          if (wordCountMatch) {
            wordCount = parseInt(wordCountMatch[1])
          }
          
          const chaptersMatch = summary.match(/Chapters:\s*([^<]+)/)
          if (chaptersMatch) {
            chapters = chaptersMatch[1].trim()
          }
        } catch (e) {
          console.error('Error parsing summary HTML:', e)
        }
      }
      
      // Clean up description by removing HTML tags and metadata
      let description = summary
      if (description) {
        // Remove the metadata section (everything in <ul> tags)
        description = description.replace(/<ul[^>]*>[\s\S]*?<\/ul>/gi, '')
        // Remove any remaining HTML tags
        description = description.replace(/<[^>]*>/g, '')
        // Clean up whitespace and decode HTML entities
        description = description.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        description = description.trim()
      }
      
      if (title && link) {
        const item = {
          id: crypto.randomUUID(),
          title,
          description,
          link,
          author,
          published_date: published ? new Date(published).toISOString() : null,
          tags,
          categories,
          characters,
          relationships,
          additional_tags: additionalTags,
          word_count: wordCount,
          chapters,
          fandom: 'Cinderella Boy - Punko (Webcomic)',
          rating,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        
        items.push(item)
      }
    }
    
    console.log(`Processed ${items.length} items`)
    
    if (items.length > 0) {
      // Clear existing items and insert new ones
      const { error: deleteError } = await supabaseClient
        .from('rss_items')
        .delete()
        .neq('id', 'impossible-id')
      
      if (deleteError) {
        console.error('Error clearing existing items:', deleteError)
      }
      
      const { error: insertError } = await supabaseClient
        .from('rss_items')
        .insert(items)
      
      if (insertError) {
        console.error('Error inserting items:', insertError)
        throw insertError
      }
      
      // Update feed metadata
      const { error: metadataError } = await supabaseClient
        .from('feed_metadata')
        .upsert({
          id: 1,
          title: 'Cinderella Boy - Punko (Webcomic) Works',
          description: 'Latest fanfiction works for Cinderella Boy by Punko',
          last_updated: new Date().toISOString()
        })
      
      if (metadataError) {
        console.error('Error updating metadata:', metadataError)
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully processed ${items.length} feed items`,
        items_count: items.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
    
  } catch (error) {
    console.error('Error processing RSS feed:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
