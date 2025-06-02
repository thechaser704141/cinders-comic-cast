
<?php
/**
 * Plugin Name: Cinderella Boy RSS Feed
 * Plugin URI: https://your-site.com
 * Description: Display the latest Cinderella Boy fanfiction works from AO3
 * Version: 1.0.0
 * Author: Your Name
 * License: GPL v2 or later
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class CinderellaBoyRSSFeed {
    
    private $supabase_url;
    private $supabase_anon_key;
    
    public function __construct() {
        $this->supabase_url = 'https://aysatgeriycsosoupwqk.supabase.co';
        $this->supabase_anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5c2F0Z2VyaXljc29zb3Vwd3FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3MjMxNzIsImV4cCI6MjA2NDI5OTE3Mn0.NIsxy-74cEEfzDtua9-S8kLZ2GSvRIv52a7xl81iemk';
        
        add_action('init', array($this, 'init'));
        add_shortcode('cinderella_boy_feed', array($this, 'render_shortcode'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_action('wp_ajax_refresh_feed', array($this, 'ajax_refresh_feed'));
        add_action('wp_ajax_nopriv_refresh_feed', array($this, 'ajax_refresh_feed'));
    }
    
    public function init() {
        // Plugin initialization
    }
    
    public function enqueue_scripts() {
        wp_enqueue_script('jquery');
        wp_enqueue_script(
            'cinderella-boy-feed',
            plugin_dir_url(__FILE__) . 'assets/feed.js',
            array('jquery'),
            '1.0.0',
            true
        );
        wp_enqueue_style(
            'cinderella-boy-feed',
            plugin_dir_url(__FILE__) . 'assets/feed.css',
            array(),
            '1.0.0'
        );
        
        wp_localize_script('cinderella-boy-feed', 'cb_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('cb_feed_nonce')
        ));
    }
    
    public function render_shortcode($atts) {
        $atts = shortcode_atts(array(
            'limit' => 10,
            'show_description' => 'true',
            'show_tags' => 'true',
            'show_stats' => 'true'
        ), $atts);
        
        $feed_items = $this->fetch_feed_items($atts['limit']);
        
        ob_start();
        ?>
        <div id="cinderella-boy-feed" class="cb-feed-container">
            <div class="cb-feed-header">
                <h3>Latest Cinderella Boy Fanfiction</h3>
                <button id="cb-refresh-btn" class="cb-refresh-btn">
                    <span class="cb-refresh-icon">↻</span> Refresh
                </button>
            </div>
            <div id="cb-feed-content" class="cb-feed-content">
                <?php if ($feed_items && !empty($feed_items)): ?>
                    <?php foreach ($feed_items as $item): ?>
                        <div class="cb-feed-item">
                            <div class="cb-item-header">
                                <h4 class="cb-item-title">
                                    <a href="<?php echo esc_url($item['link']); ?>" target="_blank" rel="noopener">
                                        <?php echo esc_html($item['title']); ?>
                                    </a>
                                </h4>
                                <div class="cb-item-meta">
                                    <?php if ($item['author']): ?>
                                        <span class="cb-author">by <?php echo esc_html($item['author']); ?></span>
                                    <?php endif; ?>
                                    <?php if ($item['published_date']): ?>
                                        <span class="cb-date"><?php echo date('M j, Y', strtotime($item['published_date'])); ?></span>
                                    <?php endif; ?>
                                    <?php if ($item['rating']): ?>
                                        <span class="cb-rating"><?php echo esc_html($item['rating']); ?></span>
                                    <?php endif; ?>
                                </div>
                            </div>
                            
                            <?php if ($atts['show_description'] === 'true' && $item['description']): ?>
                                <div class="cb-item-description">
                                    <?php echo esc_html(wp_trim_words($item['description'], 50)); ?>
                                </div>
                            <?php endif; ?>
                            
                            <?php if ($atts['show_stats'] === 'true'): ?>
                                <div class="cb-item-stats">
                                    <?php if ($item['word_count']): ?>
                                        <span class="cb-words"><?php echo number_format($item['word_count']); ?> words</span>
                                    <?php endif; ?>
                                    <?php if ($item['chapters']): ?>
                                        <span class="cb-chapters"><?php echo esc_html($item['chapters']); ?> chapters</span>
                                    <?php endif; ?>
                                </div>
                            <?php endif; ?>
                            
                            <?php if ($atts['show_tags'] === 'true' && $item['tags']): ?>
                                <div class="cb-item-tags">
                                    <?php 
                                    $tags = is_string($item['tags']) ? json_decode($item['tags'], true) : $item['tags'];
                                    if (is_array($tags)):
                                        $displayed_tags = array_slice($tags, 0, 5);
                                        foreach ($displayed_tags as $tag): ?>
                                            <span class="cb-tag"><?php echo esc_html($tag); ?></span>
                                        <?php endforeach;
                                        if (count($tags) > 5): ?>
                                            <span class="cb-tag-more">+<?php echo count($tags) - 5; ?> more</span>
                                        <?php endif;
                                    endif; ?>
                                </div>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                <?php else: ?>
                    <div class="cb-no-items">
                        <p>No fanfiction works found. <a href="#" id="cb-load-feed">Load feed</a></p>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
    
    private function fetch_feed_items($limit = 10) {
        $transient_key = 'cb_feed_items_' . $limit;
        $cached_items = get_transient($transient_key);
        
        if ($cached_items !== false) {
            return $cached_items;
        }
        
        $url = $this->supabase_url . '/rest/v1/rss_items?select=*&order=published_date.desc&limit=' . intval($limit);
        
        $response = wp_remote_get($url, array(
            'headers' => array(
                'apikey' => $this->supabase_anon_key,
                'Authorization' => 'Bearer ' . $this->supabase_anon_key,
                'Content-Type' => 'application/json'
            ),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            return array();
        }
        
        $body = wp_remote_retrieve_body($response);
        $items = json_decode($body, true);
        
        if (!is_array($items)) {
            return array();
        }
        
        // Cache for 30 minutes
        set_transient($transient_key, $items, 30 * MINUTE_IN_SECONDS);
        
        return $items;
    }
    
    public function ajax_refresh_feed() {
        check_ajax_referer('cb_feed_nonce', 'nonce');
        
        // Clear cache
        delete_transient('cb_feed_items_10');
        delete_transient('cb_feed_items_20');
        delete_transient('cb_feed_items_50');
        
        // Trigger refresh on Supabase
        $refresh_url = $this->supabase_url . '/functions/v1/fetch-ao3-feed';
        $refresh_response = wp_remote_post($refresh_url, array(
            'headers' => array(
                'Authorization' => 'Bearer ' . $this->supabase_anon_key,
                'Content-Type' => 'application/json'
            ),
            'timeout' => 60
        ));
        
        if (is_wp_error($refresh_response)) {
            wp_send_json_error('Failed to refresh feed');
            return;
        }
        
        // Fetch fresh items
        $fresh_items = $this->fetch_feed_items(10);
        
        wp_send_json_success(array(
            'message' => 'Feed refreshed successfully',
            'items' => $fresh_items
        ));
    }
}

// Initialize the plugin
new CinderellaBoyRSSFeed();
?>
