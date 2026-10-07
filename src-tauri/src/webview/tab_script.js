(function() {
    // Tab Script injected into child webviews

    // 1. Handle Cmd (Mac) / Ctrl (Windows/Linux) click or middle-click on links to open in new tab
    function openLinkInNewTab(url) {
        if (!url) return;
        var trimmed = String(url).trim();
        if (trimmed.indexOf("javascript:") === 0 || trimmed === "#") {
            return;
        }
        window.open(trimmed, "_blank");
    }

    function handleLinkActivation(e) {
        const isMiddleClick = (e.type === "auxclick" && e.button === 1);
        const isModifierClick = (e.type === "click" && (e.metaKey || e.ctrlKey) && e.button === 0);

        if (isMiddleClick || isModifierClick) {
            const a = e.target.closest("a");
            if (a && a.href) {
                e.preventDefault();
                e.stopPropagation();
                openLinkInNewTab(a.href);
            }
        }
    }

    document.addEventListener("click", handleLinkActivation, true);
    document.addEventListener("auxclick", handleLinkActivation, true);

    // 2. Synchronize dynamic title mutations for SPAs and client-side routers
    function observeDocumentTitle() {
        const titleEl = document.querySelector("title");
        if (titleEl) {
            const observer = new MutationObserver(function() {
                if (document.title) {
                    // Re-asserting document.title guarantees native CoreWebView2/WebKit DocumentTitleChanged fires
                    document.title = document.title;
                }
            });
            observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
        } else if (document.head) {
            const headObserver = new MutationObserver(function() {
                const addedTitle = document.querySelector("title");
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
