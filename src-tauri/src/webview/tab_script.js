(function() {
    // Tab Script injected into child webviews
    var tabLabel = "__WEBVIEW_LABEL__";

    // 1. Anti-bot fingerprint normalization & environment stubbing
    // Prevents GeeTest, Bilibili risk engine, and Google BotGuard from flagging the webview as automated/fraud
    try {
        if ('webdriver' in navigator) {
            Object.defineProperty(navigator, 'webdriver', {
                get: function() { return undefined; },
                configurable: true
            });
            try { delete Object.getPrototypeOf(navigator).webdriver; } catch (_) {}
        }
    } catch (_) {}

    try {
        if (!window.chrome) {
            window.chrome = {
                app: {
                    isInstalled: false,
                    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
                    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
                },
                runtime: {
                    OnInstalledReason: {},
                    OnRestartRequiredReason: {},
                    PlatformArch: {},
                    PlatformNaclArch: {},
                    PlatformOs: {},
                    RequestUpdateCheckStatus: {}
                },
                loadTimes: function() {},
                csi: function() {}
            };
        }
    } catch (_) {}

    // 2. Child Webview Console and Error capturing & forwarding
    var origLog = console.log.bind(console);
    var origWarn = console.warn.bind(console);
    var origError = console.error.bind(console);
    var origInfo = console.info.bind(console);

    function stringifyArg(arg) {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
            try { return JSON.stringify(arg); } catch (_) { return String(arg); }
        }
        return String(arg);
    }

    function formatMsg(args) {
        var parts = [];
        for (var i = 0; i < args.length; i++) {
            parts.push(stringifyArg(args[i]));
        }
        return parts.join(' ');
    }

    console.error = function() {
        var msg = formatMsg(arguments);
        origError('[TabWebview:' + tabLabel + '] [ERROR] ' + msg);
        origError.apply(console, arguments);
    };

    console.warn = function() {
        var msg = formatMsg(arguments);
        origWarn('[TabWebview:' + tabLabel + '] [WARN] ' + msg);
        origWarn.apply(console, arguments);
    };

    console.info = function() {
        var msg = formatMsg(arguments);
        origInfo('[TabWebview:' + tabLabel + '] [INFO] ' + msg);
        origInfo.apply(console, arguments);
    };

    window.addEventListener('error', function(e) {
        var msg = (e.message || 'Script error') + (e.filename ? ' at ' + e.filename + ':' + e.lineno + ':' + e.colno : '');
        origError('[TabWebview:' + tabLabel + '] [UncaughtException] ' + msg);
    });

    window.addEventListener('unhandledrejection', function(e) {
        var reason = e.reason ? (e.reason.stack || e.reason.message || String(e.reason)) : 'unknown';
        origError('[TabWebview:' + tabLabel + '] [UnhandledRejection] ' + reason);
    });

    // 3. Handle Cmd (Mac) / Ctrl (Windows/Linux) click or middle-click on links to open in new tab
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

    // 4. Synchronize dynamic title mutations for SPAs and client-side routers
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
