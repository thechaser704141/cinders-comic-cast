# Cinderella Boy RSS Feed WordPress Plugin

This WordPress plugin displays the latest Cinderella Boy fanfiction works from Archive of Our Own (AO3) using a Supabase backend.

## Features

- Display latest fanfiction works with titles, authors, descriptions, tags, and stats
- Auto-refresh every hour
- Manual refresh button
- Pagination support
- Configurable UI elements (header, refresh button)
- Responsive design
- Shortcode support with extensive customization options
- Caching for better performance

## Installation

1. **Upload the Plugin**
   - Download all plugin files
   - Create a folder named `cinderella-boy-rss-feed` in your `/wp-content/plugins/` directory
   - Upload all plugin files to this folder

2. **File Structure**
   ```
   /wp-content/plugins/cinderella-boy-rss-feed/
   ├── cinderella-boy-rss-feed.php
   ├── assets/
   │   ├── feed.css
   │   └── feed.js
   └── README.md
   ```

3. **Activate the Plugin**
   - Go to your WordPress admin dashboard
   - Navigate to Plugins → Installed Plugins
   - Find "Cinderella Boy RSS Feed" and click "Activate"

## Usage

### Basic Shortcode
```
[cinderella_boy_feed]
```

### Advanced Shortcode with All Options
```
[cinderella_boy_feed 
    limit="50" 
    per_page="10" 
    page="1"
    show_description="true" 
    show_tags="true" 
    show_stats="true"
    show_header="true"
    show_refresh="true"
    pagination="true"
]
```

### Shortcode Parameters

#### Content Control
- `limit` - Total number of items to fetch from database (default: 10)
- `per_page` - Number of items to display per page (default: 10)
- `page` - Starting page number (default: 1)

#### Display Options
- `show_description` - Show work descriptions (default: true)
- `show_tags` - Show work tags (default: true)  
- `show_stats` - Show word count and chapters (default: true)

#### UI Control
- `show_header` - Show the "Latest Cinderella Boy Fanfiction" header (default: true)
- `show_refresh` - Show the manual refresh button (default: true)
- `pagination` - Enable pagination controls (default: true)

### Usage Examples

**Compact widget for sidebar (few posts, no header):**
```
[cinderella_boy_feed limit="5" per_page="5" show_header="false" show_refresh="false" pagination="false"]
```

**Main page with many posts and pagination:**
```
[cinderella_boy_feed limit="100" per_page="20" show_description="true" show_tags="true"]
```

**Simple list without descriptions or tags:**
```
[cinderella_boy_feed limit="15" show_description="false" show_tags="false"]
```

**Embedded widget without UI controls:**
```
[cinderella_boy_feed limit="10" per_page="5" show_header="false" show_refresh="false"]
```

**Full-featured page:**
```
[cinderella_boy_feed limit="200" per_page="25" show_description="true" show_tags="true" show_stats="true"]
```

## Implementation Steps

1. **Create the plugin directory:**
   ```bash
   mkdir /wp-content/plugins/cinderella-boy-rss-feed
   mkdir /wp-content/plugins/cinderella-boy-rss-feed/assets
   ```

2. **Upload the files:**
   - Copy `cinderella-boy-rss-feed.php` to the plugin directory
   - Copy `feed.css` and `feed.js` to the `assets/` subdirectory

3. **Activate in WordPress:**
   - Log into your WordPress admin
   - Go to Plugins → Installed Plugins
   - Activate "Cinderella Boy RSS Feed"

4. **Add to pages/posts:**
   - Edit any page or post
   - Add the shortcode `[cinderella_boy_feed]` where you want the feed to appear
   - Publish/update the page

## Advanced Configuration

### Pagination Control
- Use `per_page` to control how many items show before pagination
- Use `limit` to control the total pool of items available
- Set `pagination="false"` to disable pagination entirely

### UI Customization
- Set `show_header="false"` to hide the title and create a cleaner embed
- Set `show_refresh="false"` to hide the refresh button for automated contexts
- Combine both for minimal widget-style displays

### Performance Optimization
- Higher `limit` values will fetch more data but may impact performance
- Lower `per_page` values create more pages but faster initial load
- Cache is automatically managed (30 minutes)

## Customization

### CSS Customization
You can override the plugin's CSS by adding custom styles to your theme's CSS file:

```css
.cb-feed-container {
    /* Your custom styles */
}

.cb-feed-item {
    /* Customize individual items */
}
```

### PHP Customization
The plugin is designed to be easily customizable. You can modify:
- Feed refresh intervals
- Caching duration
- Display formatting
- API endpoints

## Support

- The plugin connects to a Supabase backend that scrapes AO3
- Data is cached for 30 minutes to reduce API calls
- Auto-refresh occurs every hour
- Manual refresh is available via the refresh button

## Troubleshooting

**Feed not loading:**
- Check your internet connection
- Verify the plugin is activated
- Try clicking the refresh button

**Styling issues:**
- Check for theme CSS conflicts
- Verify the CSS file is loading correctly
- Add custom CSS if needed

**Caching issues:**
- Use the manual refresh button
- Check if other caching plugins are interfering

**Pagination not working:**
- Ensure JavaScript is enabled
- Check for theme conflicts with jQuery
- Verify the shortcode includes `pagination="true"`

**Too many/few posts showing:**
- Use `per_page` to control posts per page
- Use `limit` to control total available posts
- Check your caching if changes don't appear immediately
