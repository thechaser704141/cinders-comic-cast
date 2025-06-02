
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
        add_action('wp_ajax_load_more_posts', array($this, 'ajax_load_more_posts'));
        add_action('wp_ajax_nopriv_load_more_posts', array($this, 'ajax_load_more_posts'));
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
            'show_stats' => 'true',
            'show_header' => 'true',
            'show_refresh' => 'true',
            'pagination' => 'true',
            'per_page' => 10,
            'page' => 1
        ), $atts);
        
        $page = intval($atts['page']);
        $per_page = intval($atts['per_page']);
        $offset = ($page - 1) * $per_page;
        
        $feed_items = $this->fetch_feed_items($atts['limit'], $offset);
        $total_items = $this->get_total_items_count();
        $total_pages = ceil($total_items / $per_page);
        
        // Generate unique ID for this instance
        $instance_id = 'cb-feed-' . wp_rand(1000, 9999);
        
        ob_start();
        ?>
        <div id="<?php echo $instance_id; ?>" class="cb-feed-container" 
             data-show-header="<?php echo esc_attr($atts['show_header']); ?>"
             data-show-refresh="<?php echo esc_attr($atts['show_refresh']); ?>"
             data-pagination="<?php echo esc_attr($atts['pagination']); ?>"
             data-per-page="<?php echo esc_attr($per_page); ?>"
             data-current-page="<?php echo esc_attr($page); ?>"
             data-total-pages="<?php echo esc_attr($total_pages); ?>">
            
            <?php if ($atts['show_header'] === 'true'): ?>
            <div class="cb-feed-header">
                <h3>Latest Cinderella Boy Fanfiction</h3>
                <?php if ($atts['show_refresh'] === 'true'): ?>
                <button class="cb-refresh-btn" data-target="<?php echo $instance_id; ?>">
                    <span class="cb-refresh-icon">↻</span> Refresh
                </button>
                <?php endif; ?>
            </div>
            <?php endif; ?>
            
            <div class="cb-feed-content">
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
                    
                    <?php if ($atts['pagination'] === 'true' && $total_pages > 1): ?>
                        <div class="cb-pagination">
                            <?php if ($page > 1): ?>
                                <button class="cb-page-btn" data-page="<?php echo $page - 1; ?>" data-target="<?php echo $instance_id; ?>">
                                    ← Previous
                                </button>
                            <?php endif; ?>
                            
                            <span class="cb-page-info">
                                Page <?php echo $page; ?> of <?php echo $total_pages; ?>
                            </span>
                            
                            <?php if ($page < $total_pages): ?>
                                <button class="cb-page-btn" data-page="<?php echo $page + 1; ?>" data-target="<?php echo $instance_id; ?>">
                                    Next →
                                </button>
                            <?php endif; ?>
                        </div>
                    <?php endif; ?>
                    
                <?php else: ?>
                    <div class="cb-no-items">
                        <p>No fanfiction works found. <a href="#" class="cb-load-feed" data-target="<?php echo $instance_id; ?>">Load feed</a></p>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
    
    private function fetch_feed_items($limit = 10, $offset = 0) {
        $transient_key = 'cb_feed_items_' . $limit . '_' . $offset;
        $cached_items = get_transient($transient_key);
        
        if ($cached_items !== false) {
            return $cached_items;
        }
        
        $url = $this->supabase_url . '/rest/v1/rss_items?select=*&order=published_date.desc&limit=' . intval($limit) . '&offset=' . intval($offset);
        
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
    
    private function get_total_items_count() {
        $transient_key = 'cb_total_items_count';
        $cached_count = get_transient($transient_key);
        
        if ($cached_count !== false) {
            return intval($cached_count);
        }
        
        $url = $this->supabase_url . '/rest/v1/rss_items?select=count&count=exact';
        
        $response = wp_remote_get($url, array(
            'headers' => array(
                'apikey' => $this->supabase_anon_key,
                'Authorization' => 'Bearer ' . $this->supabase_anon_key,
                'Content-Type' => 'application/json',
                'Prefer' => 'count=exact'
            ),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            return 0;
        }
        
        $headers = wp_remote_retrieve_headers($response);
        $count = isset($headers['content-range']) ? 
            intval(explode('/', $headers['content-range'])[1]) : 0;
        
        // Cache for 30 minutes
        set_transient($transient_key, $count, 30 * MINUTE_IN_SECONDS);
        
        return $count;
    }
    
    public function ajax_refresh_feed() {
        check_ajax_referer('cb_feed_nonce', 'nonce');
        
        // Clear all cache
        $this->clear_all_cache();
        
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
        
        wp_send_json_success(array(
            'message' => 'Feed refreshed successfully'
        ));
    }
    
    public function ajax_load_more_posts() {
        check_ajax_referer('cb_feed_nonce', 'nonce');
        
        $page = intval($_POST['page']);
        $per_page = intval($_POST['per_page']);
        $offset = ($page - 1) * $per_page;
        
        $items = $this->fetch_feed_items($per_page, $offset);
        
        wp_send_json_success(array(
            'items' => $items,
            'page' => $page
        ));
    }
    
    private function clear_all_cache() {
        global $wpdb;
        
        // Clear all transients starting with 'cb_feed_items_'
        $wpdb->query(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_cb_feed_items_%' OR option_name LIKE '_transient_timeout_cb_feed_items_%'"
        );
        
        // Clear total count cache
        delete_transient('cb_total_items_count');
    }
}

// Initialize the plugin
new CinderellaBoyRSSFeed();
?>
