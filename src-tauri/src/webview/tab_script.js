(function() {
    // Tab Script injected into child webviews
    var tabLabel = "__WEBVIEW_LABEL__";

    // 1. Safe SPA Route & Navigation Synchronization via native document.title re-assertion
    // Re-asserting document.title triggers native on_document_title_changed in Rust without
    // any cross-origin IPC fetch requests, completely avoiding CSP (Content Security Policy) errors.
    function notifyRouteChanged() {
        setTimeout(function() {
            try {
                if (document.title !== undefined) {
                    document.title = document.title;
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

        window.addEventListener('popstate', notifyRouteChanged);
        window.addEventListener('hashchange', notifyRouteChanged);
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

    // 3. Observe dynamic title mutations for SPAs and client-side routers
    function observeDocumentTitle() {
        var titleEl = document.querySelector("title");
        if (titleEl) {
            var observer = new MutationObserver(function() {
                try {
                    if (document.title) {
                        document.title = document.title;
                    }
                } catch (_) {}
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
