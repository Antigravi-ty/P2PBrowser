(function() {
    // Tab Script injected into child webviews
    var tabLabel = "__WEBVIEW_LABEL__";

    // 1. Safe SPA Route & Navigation Synchronization
    // Informs Tauri host when Single Page Applications alter the browser history stack
    function notifyHostOfNavigation() {
        try {
            if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
                window.__TAURI_INTERNALS__.invoke('tab_state_update', {
                    label: tabLabel,
                    url: window.location.href,
                    title: document.title || ''
                }).catch(function() {});
            }
        } catch (_) {}
    }

    try {
        var origPushState = history.pushState;
        history.pushState = function() {
            var ret = origPushState.apply(this, arguments);
            setTimeout(notifyHostOfNavigation, 50);
            return ret;
        };

        var origReplaceState = history.replaceState;
        history.replaceState = function() {
            var ret = origReplaceState.apply(this, arguments);
            setTimeout(notifyHostOfNavigation, 50);
            return ret;
        };

        window.addEventListener('popstate', function() {
            setTimeout(notifyHostOfNavigation, 50);
        });
        window.addEventListener('hashchange', function() {
            setTimeout(notifyHostOfNavigation, 50);
        });
    } catch (_) {}

    // 2. Link Activation: Cmd/Ctrl click or middle click opens in a new tab
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
})();
