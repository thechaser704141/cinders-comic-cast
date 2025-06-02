
jQuery(document).ready(function($) {
    // Refresh button functionality
    $('#cb-refresh-btn').on('click', function() {
        refreshFeed();
    });
    
    // Load feed link functionality
    $(document).on('click', '#cb-load-feed', function(e) {
        e.preventDefault();
        refreshFeed();
    });
    
    function refreshFeed() {
        const $btn = $('#cb-refresh-btn');
        const $content = $('#cb-feed-content');
        
        // Show loading state
        $btn.prop('disabled', true).addClass('loading');
        $btn.find('span:last').text('Refreshing...');
        
        $.ajax({
            url: cb_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'refresh_feed',
                nonce: cb_ajax.nonce
            },
            timeout: 60000, // 60 seconds
            success: function(response) {
                if (response.success) {
                    // Reload the page to show fresh content
                    location.reload();
                } else {
                    showError('Failed to refresh feed: ' + (response.data || 'Unknown error'));
                }
            },
            error: function(xhr, status, error) {
                let errorMessage = 'Failed to refresh feed';
                if (status === 'timeout') {
                    errorMessage = 'Request timed out. The feed refresh is still processing.';
                } else if (error) {
                    errorMessage += ': ' + error;
                }
                showError(errorMessage);
            },
            complete: function() {
                // Reset button state
                $btn.prop('disabled', false).removeClass('loading');
                $btn.find('span:last').text('Refresh');
            }
        });
    }
    
    function showError(message) {
        const $content = $('#cb-feed-content');
        $content.prepend(`
            <div class="cb-error-message" style="background: #fee2e2; border: 1px solid #fecaca; color: #dc2626; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                ${message}
            </div>
        `);
        
        // Remove error message after 5 seconds
        setTimeout(function() {
            $('.cb-error-message').fadeOut(function() {
                $(this).remove();
            });
        }, 5000);
    }
    
    // Auto-refresh every hour
    setInterval(function() {
        refreshFeed();
    }, 60 * 60 * 1000); // 1 hour
});
