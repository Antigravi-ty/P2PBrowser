(function() {
    // Tab Script injected into child webviews
    // 1. Anti-bot fingerprint normalization: Hide automated testing flags
    try {
        if ('webdriver' in navigator) {
            Object.defineProperty(navigator, 'webdriver', {
                get: function() { return undefined; },
                configurable: true
            });
            try { delete Object.getPrototypeOf(navigator).webdriver; } catch (_) {}
        }
    } catch (_) {}

    // Note: Do NOT inject fake `window.chrome` on macOS Safari webview!
    // Real Safari does not have `window.chrome`. Injecting it causes risk-control engines
    // (Bilibili Gaia, GeeTest, Cloudflare) to flag the user as an automated bot (UA/object mismatch).

    // 2. Compatibility normalization for Bilibili PC Passport SPA router
    // Bilibili's Rsbuild/VueRouter is configured with `base: "/pc/passport"`.
    // Direct requests to `/login` or `/` do not match the base and render an empty `#app`.
    try {
        if (location.hostname === 'passport.bilibili.com') {
            if (location.pathname === '/login' || location.pathname === '/') {
                console.log('[P2PBrowser] Normalizing Bilibili PC passport route -> /pc/passport/login');
                location.replace('/pc/passport/login' + location.search);
                return;
            }
        }
    } catch (_) {}

    // 3. Diagnostic Logging for Developer Tools
    console.log('[P2PBrowser Diagnostic] Webview initialized on:', location.href);

    window.addEventListener('error', function(e) {
        console.error('[P2PBrowser Diagnostic] Script error:', e.message, 'at', e.filename, 'line', e.lineno);
    });

    window.addEventListener('unhandledrejection', function(e) {
        console.warn('[P2PBrowser Diagnostic] Unhandled rejection:', e.reason);
    });

    if (location.hostname.indexOf('bilibili.com') !== -1) {
        window.addEventListener('load', function() {
            setTimeout(function() {
                var appEl = document.querySelector('#passport-app') || document.querySelector('#app') || document.body;
                console.log(
                    '[P2PBrowser Diagnostic] Bilibili page state:',
                    location.pathname,
                    'app children:',
                    appEl ? appEl.childElementCount : 0,
                    'text length:',
                    appEl ? appEl.textContent.trim().length : 0
                );
            }, 1000);
        });
    }

    // 4. Handle Cmd (Mac) / Ctrl (Windows/Linux) click or middle-click on links to open in new tab
    function openLinkInNewTab(url) {
        if (!url) return;
        var trimmed = String(url).trim();
        if (trimmed.indexOf("javascript:") === 0 || trimmed === "#") {
            return;
        }
        window.open(trimmed, "_blank");
    }

    function handleLinkActivation(e) {
        var isMiddleClick = (e.type === "auxclick" && e.button === 1);
        var isModifierClick = (e.type === "click" && (e.metaKey || e.ctrlKey) && e.button === 0);

        if (isMiddleClick || isModifierClick) {
            var a = e.target.closest("a");
            if (a && a.href) {
                e.preventDefault();
                e.stopPropagation();
                openLinkInNewTab(a.href);
            }
        }
    }

    document.addEventListener("click", handleLinkActivation, true);
    document.addEventListener("auxclick", handleLinkActivation, true);

    // 5. Synchronize dynamic title mutations for SPAs and client-side routers
    function observeDocumentTitle() {
        var titleEl = document.querySelector("title");
        if (titleEl) {
            var observer = new MutationObserver(function() {
                if (document.title) {
                    // Re-asserting document.title guarantees native CoreWebView2/WebKit DocumentTitleChanged fires
                    document.title = document.title;
                }
            });
            observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
        } else if (document.head) {
            var headObserver = new MutationObserver(function() {
                var addedTitle = document.querySelector("title");
                if (addedTitle) {
                    headObserver.disconnect();
                    observeDocumentTitle();
                }
            });
            headObserver.observe(document.head, { childList: true });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observeDocumentTitle);
    } else {
        observeDocumentTitle();
    }
})();
