
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
    
    // Use the correct AO3 works feed URL
    const feedUrl = 'https://archiveofourown.org/tags/Cinderella%20Boy%20-%20Punko%20(Webcomic)/works.atom'
    console.log('Feed URL:', feedUrl)
    
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/atom+xml, application/xml, text/xml, */*'
      }
    })
    
    if (!response.ok) {
      console.error(`HTTP Error: ${response.status} - ${response.statusText}`)
      throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`)
    }
    
    const xmlText = await response.text()
    console.log('Feed fetched successfully, length:', xmlText.length)
    console.log('Feed content preview:', xmlText.substring(0, 500))
    
    return await processAtomFeed(xmlText, supabaseClient)
    
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

async function processAtomFeed(xmlText: string, supabaseClient: any) {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
  
  const entries = xmlDoc.getElementsByTagName('entry')
  console.log(`Found ${entries.length} entries in Atom feed`)
  
  const items = []
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    
    const title = entry.getElementsByTagName('title')[0]?.textContent?.trim()
    const link = entry.getElementsByTagName('link')[0]?.getAttribute('href')
    const author = entry.getElementsByTagName('author')[0]?.getElementsByTagName('name')[0]?.textContent?.trim()
    const published = entry.getElementsByTagName('published')[0]?.textContent?.trim()
    const summary = entry.getElementsByTagName('summary')[0]?.textContent?.trim()
    
    console.log(`Processing entry ${i + 1}: ${title}`)
    console.log('Summary content:', summary?.substring(0, 200) + '...')
    
    const parsedData = parseSummaryData(summary, title)
    
    // Skip explicit content
    if (parsedData.rating && parsedData.rating.toLowerCase() === 'explicit') {
      console.log(`Skipping explicit content: ${title}`)
      continue
    }
    
    if (title && link) {
      const item = {
        id: crypto.randomUUID(),
        title,
        description: parsedData.description,
        link,
        author,
        published_date: published ? new Date(published).toISOString() : null,
        tags: [...parsedData.characters, ...parsedData.relationships, ...parsedData.additionalTags],
        categories: parsedData.categories,
        characters: parsedData.characters,
        relationships: parsedData.relationships,
        additional_tags: parsedData.additionalTags,
        word_count: parsedData.wordCount,
        chapters: parsedData.chapters,
        fandom: 'Cinderella Boy - Punko (Webcomic)',
        rating: parsedData.rating,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      console.log('Parsed item:', {
        title: item.title,
        rating: item.rating,
        categories: item.categories,
        characters: item.characters,
        relationships: item.relationships,
        additional_tags: item.additional_tags
      })
      items.push(item)
    }
  }
  
  return await saveItemsToDatabase(items, supabaseClient)
}

function parseSummaryData(summary: string, title: string) {
  let categories = []
  let characters = []
  let relationships = []
  let additionalTags = []
  let rating = null
  let wordCount = null
  let chapters = null
  let description = summary

  if (summary) {
    console.log(`Parsing summary for: ${title}`)
    
    try {
      // Extract rating first
      const ratingMatch = summary.match(/Rating:\s*<a[^>]*>([^<]+)<\/a>/i)
      if (ratingMatch) {
        rating = ratingMatch[1].trim()
        console.log('Found rating:', rating)
      }
      
      // Extract categories (F/F, M/M, etc.)
      const categoriesMatch = summary.match(/Categories:\s*((?:<a[^>]*>[^<]+<\/a>(?:,\s*)?)+)/i)
      if (categoriesMatch) {
        const categoryLinks = categoriesMatch[1].match(/<a[^>]*>([^<]+)<\/a>/g)
        if (categoryLinks) {
          categories = categoryLinks.map(link => {
            const match = link.match(/>([^<]+)</)
            return match ? match[1].trim() : ''
          }).filter(cat => cat)
          console.log('Found categories:', categories)
        }
      }
      
      // Extract characters
      const charactersMatch = summary.match(/Characters:\s*((?:<a[^>]*>[^<]+<\/a>(?:,\s*)?)+)/i)
      if (charactersMatch) {
        const characterLinks = charactersMatch[1].match(/<a[^>]*>([^<]+)<\/a>/g)
        if (characterLinks) {
          characters = characterLinks.map(link => {
            const match = link.match(/>([^<]+)</)
            return match ? match[1].trim() : ''
          }).filter(char => char)
          console.log('Found characters:', characters)
        }
      }
      
      // Extract relationships
      const relationshipsMatch = summary.match(/Relationships:\s*((?:<a[^>]*>[^<]+<\/a>(?:,\s*)?)+)/i)
      if (relationshipsMatch) {
        const relationshipLinks = relationshipsMatch[1].match(/<a[^>]*>([^<]+)<\/a>/g)
        if (relationshipLinks) {
          relationships = relationshipLinks.map(link => {
            const match = link.match(/>([^<]+)</)
            return match ? match[1].trim() : ''
          }).filter(rel => rel)
          console.log('Found relationships:', relationships)
        }
      }
      
      // Extract additional tags
      const additionalTagsMatch = summary.match(/Additional Tags:\s*((?:<a[^>]*>[^<]+<\/a>(?:,\s*)?)+)/i)
      if (additionalTagsMatch) {
        const tagLinks = additionalTagsMatch[1].match(/<a[^>]*>([^<]+)<\/a>/g)
        if (tagLinks) {
          additionalTags = tagLinks.map(link => {
            const match = link.match(/>([^<]+)</)
            return match ? match[1].trim() : ''
          }).filter(tag => tag)
          console.log('Found additional tags:', additionalTags)
        }
      }
      
      // Extract word count and chapters
      const wordCountMatch = summary.match(/Words:\s*(\d+)/i)
      if (wordCountMatch) {
        wordCount = parseInt(wordCountMatch[1])
        console.log('Found word count:', wordCount)
      }
      
      const chaptersMatch = summary.match(/Chapters:\s*([^<]+)/i)
      if (chaptersMatch) {
        chapters = chaptersMatch[1].trim()
        console.log('Found chapters:', chapters)
      }
    } catch (e) {
      console.error('Error parsing summary HTML:', e)
    }
  }
  
  // Clean up description by removing HTML tags and metadata
  if (description) {
    // Remove the metadata section (everything in <ul> tags)
    description = description.replace(/<ul[^>]*>[\s\S]*?<\/ul>/gi, '')
    // Remove any remaining HTML tags
    description = description.replace(/<[^>]*>/g, '')
    // Clean up whitespace and decode HTML entities
    description = description.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    description = description.trim()
  }

  return {
    categories,
    characters,
    relationships,
    additionalTags,
    rating,
    wordCount,
    chapters,
    description
  }
}

async function saveItemsToDatabase(items: any[], supabaseClient: any) {
  console.log(`Processed ${items.length} items (after filtering explicit content)`)
  
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
        feed_url: 'https://archiveofourown.org/tags/Cinderella%20Boy%20-%20Punko%20(Webcomic)/works.atom',
        last_updated: new Date().toISOString()
      })
    
    if (metadataError) {
      console.error('Error updating metadata:', metadataError)
    }
  }
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      message: `Successfully processed ${items.length} feed items (explicit content filtered)`,
      items_count: items.length 
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  )
}
