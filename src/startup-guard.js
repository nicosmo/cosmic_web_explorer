// startup-guard.js
// Startup fail-safe: preflight checks + global error handler.
(function () {
    var missing = [];
    if (typeof React === 'undefined') missing.push('React');
    if (typeof ReactDOM === 'undefined') missing.push('ReactDOM');
    if (typeof Babel === 'undefined') missing.push('Babel');

    function showFatalError(title, detail) {
        var root = document.getElementById('root');
        if (!root) return;
        root.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;font-family:sans-serif;padding:2rem;box-sizing:border-box;';
        root.innerHTML = '<div style="max-width:520px;background:#1e293b;border:1px solid #ef4444;border-radius:12px;padding:2rem;color:#f8fafc;text-align:center;">'
            + '<div style="font-size:2rem;margin-bottom:0.75rem;">&#9888;</div>'
            + '<h2 style="color:#ef4444;margin:0 0 0.75rem;font-size:1.2rem;">Cosmic Web Explorer failed to load</h2>'
            + '<p style="color:#94a3b8;margin:0 0 0.75rem;font-size:0.9rem;">' + title + '</p>'
            + (detail ? '<p style="color:#64748b;font-size:0.8rem;word-break:break-word;margin:0;">' + detail + '</p>' : '')
            + '<p style="color:#64748b;font-size:0.8rem;margin-top:1rem;">Try refreshing the page. If the problem persists, check your internet connection or <a href="https://github.com/nicosmo/cosmic_web_explorer/issues" style="color:#60a5fa;">open an issue on GitHub</a>.</p>'
            + '</div>';
    }

    if (missing.length > 0) {
        showFatalError(
            'Required libraries failed to load: ' + missing.join(', ') + '.',
            'This is usually caused by a network error or a CDN outage.'
        );
        window.__startupFailed = true;
    }

    window.addEventListener('error', function (e) {
        if (window.__startupFailed) return;
        var root = document.getElementById('root');
        if (root && root.childElementCount === 0) {
            showFatalError(
                'A startup error prevented the app from loading.',
                e.message ? e.message.slice(0, 200) : 'Unknown error'
            );
            window.__startupFailed = true;
        }
    });

    window.addEventListener('unhandledrejection', function (e) {
        if (window.__startupFailed) return;
        var root = document.getElementById('root');
        if (root && root.childElementCount === 0) {
            var msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
            showFatalError(
                'A startup error prevented the app from loading.',
                msg.slice(0, 200)
            );
            window.__startupFailed = true;
        }
    });
})();
