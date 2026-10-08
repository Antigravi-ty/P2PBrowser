(function() {
    // Tab Script injected into child webviews
    var tabLabel = "__WEBVIEW_LABEL__";

    // 1. Safe SPA Route & Navigation Synchronization via native document.title re-assertion
    // When Single Page Applications alter the browser history stack without a full page reload,
    // toggling document.title with a zero-width space triggers the native OS on_document_title_changed
    // callback in Rust without performing any fetch/XHR network requests, completely avoiding
    // Content Security Policy (CSP) violations.
    var prevUrl = location.href;

    function notifyRouteChanged() {
        setTimeout(function() {
            try {
                var curUrl = location.href;
                if (curUrl && curUrl !== prevUrl) {
                    prevUrl = curUrl;
                    var rawTitle = document.title || "";
                    if (rawTitle.indexOf("\u200B") === -1) {
                        document.title = rawTitle + "\u200B";
                        setTimeout(function() {
                            try {
                                if (document.title && document.title.indexOf("\u200B") !== -1) {
                                    document.title = rawTitle;
                                }
                            } catch (_) {}
                        }, 20);
                    }
                }
            } catch (_) {}
        }, 50);
    }

    try {
        var origPushState = history.pushState;
        history.pushState = function() {
            var ret = origPushState.apply(this, arguments);
            notifyRouteChanged();
            return ret;
        };

        var origReplaceState = history.replaceState;
        history.replaceState = function() {
            var ret = origReplaceState.apply(this, arguments);
            notifyRouteChanged();
            return ret;
        };

        window.addEventListener("popstate", notifyRouteChanged);
        window.addEventListener("hashchange", notifyRouteChanged);
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
