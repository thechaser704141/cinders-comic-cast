
jQuery(document).ready(function($) {
    // Handle refresh button clicks
    $(document).on('click', '.cb-refresh-btn', function(e) {
        e.preventDefault();
        
        var $btn = $(this);
        var $container = $('#' + $btn.data('target'));
        var $icon = $btn.find('.cb-refresh-icon');
        
        // Show loading state
        $btn.prop('disabled', true);
        $icon.addClass('loading');
        
        $.ajax({
            url: cb_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'refresh_feed',
                nonce: cb_ajax.nonce
            },
            success: function(response) {
                if (response.success) {
                    // Reload the page to show updated content
                    location.reload();
                } else {
                    alert('Failed to refresh feed: ' + (response.data || 'Unknown error'));
                }
            },
            error: function() {
                alert('Failed to refresh feed. Please try again.');
            },
            complete: function() {
                $btn.prop('disabled', false);
                $icon.removeClass('loading');
            }
        });
    });
    
    // Handle pagination
    $(document).on('click', '.cb-page-btn', function(e) {
        e.preventDefault();
        
        var $btn = $(this);
        var targetPage = $btn.data('page');
        var $container = $('#' + $btn.data('target'));
        var perPage = $container.data('per-page');
        
        // Show loading state
        $btn.prop('disabled', true);
        $btn.text('Loading...');
        
        // Update URL with new page parameter
        var url = new URL(window.location);
        url.searchParams.set('cb_page', targetPage);
        window.history.pushState({}, '', url);
        
        // Reload page with new parameters
        location.reload();
    });
    
    // Handle load feed link for empty state
    $(document).on('click', '.cb-load-feed', function(e) {
        e.preventDefault();
        
        var $link = $(this);
        var $container = $('#' + $link.data('target'));
        var $refreshBtn = $container.find('.cb-refresh-btn');
        
        if ($refreshBtn.length) {
            $refreshBtn.trigger('click');
        }
    });
    
    // Check URL parameters on page load
    var urlParams = new URLSearchParams(window.location.search);
    var cbPage = urlParams.get('cb_page');
    
    if (cbPage) {
        // Update all feed containers to show the correct page
        $('.cb-feed-container').each(function() {
            var $container = $(this);
            $container.attr('data-current-page', cbPage);
        });
    }
    
    // Auto-refresh every hour
    setInterval(function() {
        $('.cb-refresh-btn').first().trigger('click');
    }, 60 * 60 * 1000); // 1 hour
});
