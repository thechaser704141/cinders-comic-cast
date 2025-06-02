
# Cinderella Boy RSS Feed WordPress Plugin

This WordPress plugin displays the latest Cinderella Boy fanfiction works from Archive of Our Own (AO3) using a Supabase backend.

## Features

- Display latest fanfiction works with titles, authors, descriptions, tags, and stats
- Auto-refresh every hour
- Manual refresh button
- Responsive design
- Shortcode support with customizable options
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

### Shortcode with Options
```
[cinderella_boy_feed limit="20" show_description="true" show_tags="true" show_stats="true"]
```

### Shortcode Parameters

- `limit` - Number of items to display (default: 10)
- `show_description` - Show work descriptions (default: true)
- `show_tags` - Show work tags (default: true)  
- `show_stats` - Show word count and chapters (default: true)

### Examples

**Show 5 items without descriptions:**
```
[cinderella_boy_feed limit="5" show_description="false"]
```

**Show 15 items with only titles and stats:**
```
[cinderella_boy_feed limit="15" show_description="false" show_tags="false"]
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

## Requirements

- WordPress 5.0 or higher
- PHP 7.4 or higher
- Active internet connection
- jQuery (included with WordPress)

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
