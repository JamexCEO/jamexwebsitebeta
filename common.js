(function() {
    // hover style handling for buttons with links
    document.querySelectorAll('.button').forEach(btn => {
        const a = btn.querySelector('a');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        const isExternal = /^https?:\/\//i.test(href);
        const enter = () => btn.classList.add(isExternal ? 'hover-external' : 'hover-internal');
        const leave = () => { btn.classList.remove('hover-external'); btn.classList.remove('hover-internal'); };
        btn.addEventListener('mouseenter', enter);
        btn.addEventListener('mouseleave', leave);
        a.addEventListener('focus', enter);
        a.addEventListener('blur', leave);
    });

    // highlight current page in navbar
    const getPageFile = (path) => {
        const file = path.split('/').pop() || '';
        return file === '' ? 'index.html' : file;
    };
    const current = getPageFile(window.location.pathname);
    document.querySelectorAll('.navbar a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const hrefFile = getPageFile(href);
        if (hrefFile === current) {
            a.classList.add('active');
        }
    });

    // --- theme toggle logic ---
    // Three states in localStorage:
    //   null = Auto (follows system), shown as 🌓
    //   '1'  = Dark (forced),         shown as 🌙 (click to go light)
    //   '0'  = Light (forced),        shown as ☀️  (click to go dark)
    //
    // Cycle when system is dark:  Auto(🌓) → Light(☀️) → Dark(🌙) → Auto(🌓)
    // Cycle when system is light: Auto(🌓) → Dark(🌙) → Light(☀️) → Auto(🌓)

    const themeToggle = document.getElementById('theme-toggle');
    const ACCOUNT_SETTINGS_KEY = 'jamex-account-settings';
    const LIGHT_BG_KEY = 'jamex-light-bg';
    const DARK_BG_KEY = 'jamex-dark-bg';
    const PAGE_THEME_AUTOMATIONS_KEY = 'jamex-page-theme-automations';
    const SETTINGS_THEME_PAGE = '__settings__';
    const PAGE_THEME_AUTOMATION_PAGES = [
        { value: 'index.html', label: 'Homepage' },
        { value: 'events.html', label: 'Events' },
        { value: 'news.html', label: 'News' },
        { value: 'games.html', label: 'Games' },
        { value: 'hall-of-fame.html', label: 'Hall of Fame' },
        { value: 'products.html', label: 'Products' },
        { value: 'partners.html', label: 'Partners' },
        { value: 'our-team.html', label: 'Our Team' },
        { value: 'feedback.html', label: 'Feedback' },
        { value: SETTINGS_THEME_PAGE, label: 'Settings' },
    ];
    const systemDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const normalizeThemeMode = value => value === '0' || value === '1' ? value : null;
    const normalizeLightBg = value => value === 'white' ? 'white' : 'mint';
    const normalizeDarkBg = value => value === 'black' ? 'black' : 'stone';
    const normalizePageThemeAutomations = value => {
        if (!value || typeof value !== 'object') return {};
        const next = {};
        Object.keys(value).forEach(key => {
            const mode = value[key];
            if (typeof key === 'string' && (mode === 'dark' || mode === 'light')) {
                next[key] = mode;
            }
        });
        return next;
    };
    const normalizeAccountSettings = value => {
        const raw = value && typeof value === 'object' ? value : {};
        return {
            darkMode: normalizeThemeMode(raw.darkMode),
            lightBg: normalizeLightBg(raw.lightBg),
            darkBg: normalizeDarkBg(raw.darkBg),
            pageThemeAutomations: normalizePageThemeAutomations(raw.pageThemeAutomations),
        };
    };
    const readLegacySettings = () => normalizeAccountSettings({
        darkMode: localStorage.getItem('dark-mode'),
        lightBg: localStorage.getItem(LIGHT_BG_KEY),
        darkBg: localStorage.getItem(DARK_BG_KEY),
        pageThemeAutomations: (() => {
            try {
                return JSON.parse(localStorage.getItem(PAGE_THEME_AUTOMATIONS_KEY) || '{}');
            } catch (e) {
                return {};
            }
        })(),
    });
    const isAccountSessionActive = () => !!localStorage.getItem('jamex-password') && !!localStorage.getItem('jamex-username');
    const getCachedAccountSettings = () => {
        try {
            const parsed = JSON.parse(localStorage.getItem(ACCOUNT_SETTINGS_KEY) || 'null');
            return normalizeAccountSettings(parsed || readLegacySettings());
        } catch (e) {
            return readLegacySettings();
        }
    };
    const cacheAccountSettings = settings => {
        const normalized = normalizeAccountSettings(settings);
        localStorage.setItem(ACCOUNT_SETTINGS_KEY, JSON.stringify(normalized));
        if (normalized.darkMode === null) {
            localStorage.removeItem('dark-mode');
        } else {
            localStorage.setItem('dark-mode', normalized.darkMode);
        }
        localStorage.setItem(LIGHT_BG_KEY, normalized.lightBg);
        localStorage.setItem(DARK_BG_KEY, normalized.darkBg);
        localStorage.setItem(PAGE_THEME_AUTOMATIONS_KEY, JSON.stringify(normalized.pageThemeAutomations));
        return normalized;
    };
    const getActiveAccountSettings = () => isAccountSessionActive() ? getCachedAccountSettings() : readLegacySettings();
    let remoteSettingsSyncAvailable = true;

    function queueAccountSettingsSync(settings) {
        if (!isAccountSessionActive() || !remoteSettingsSyncAvailable) return Promise.resolve();
        const username = localStorage.getItem('jamex-username');
        if (!username) return Promise.resolve();
        return sbFetch(
            'accounts?username=eq.' + encodeURIComponent(username),
            {
                method: 'PATCH',
                prefer: 'return=minimal',
                body: JSON.stringify({ settings: normalizeAccountSettings(settings) }),
            }
        ).catch(e => {
            const message = e && e.message ? e.message : '';
            if (/settings/i.test(message) && /column|schema/i.test(message)) {
                remoteSettingsSyncAvailable = false;
            }
            console.warn('Could not sync account settings to Supabase:', e);
        });
    }

    function persistAccountSettings(nextSettings) {
        const normalized = cacheAccountSettings(nextSettings);
        if (isAccountSessionActive()) queueAccountSettingsSync(normalized);
        return normalized;
    }

    const getLightBackgroundPreference = () => {
        return getActiveAccountSettings().lightBg;
    };
    const getDarkBackgroundPreference = () => {
        return getActiveAccountSettings().darkBg;
    };

    const applyBackgroundPreferences = () => {
        document.body.dataset.lightBg = getLightBackgroundPreference();
        document.body.dataset.darkBg = getDarkBackgroundPreference();
    };

    const applyTheme = (dark) => {
        applyBackgroundPreferences();
        document.body.classList.toggle('dark', dark);
    };

    const getPageThemeAutomations = () => {
        return getActiveAccountSettings().pageThemeAutomations;
    };

    const setPageThemeAutomations = automations => {
        const currentSettings = getActiveAccountSettings();
        persistAccountSettings({
            ...currentSettings,
            pageThemeAutomations: normalizePageThemeAutomations(automations),
        });
    };

    const getAutomationThemeMode = pageKey => {
        const automations = getPageThemeAutomations();
        const mode = automations[pageKey];
        return mode === 'dark' || mode === 'light' ? mode : null;
    };

    let activeThemePage = current;
    let pageThemeAutomationMode = getAutomationThemeMode(activeThemePage);
    let pageThemeAutomationSuppressed = false;

    const setThemeAutomationContext = (pageKey, options) => {
        activeThemePage = pageKey || current;
        pageThemeAutomationMode = getAutomationThemeMode(activeThemePage);
        if (!options || options.resetSuppression !== false) {
            pageThemeAutomationSuppressed = false;
        }
        applyCurrentTheme();
        updateToggleLabel();
    };

    const getEffectiveDarkState = () => {
        if (pageThemeAutomationMode && !pageThemeAutomationSuppressed) {
            return pageThemeAutomationMode === 'dark';
        }
        const stored = localStorage.getItem('dark-mode');
        if (stored !== null) return stored === '1';
        return systemDark();
    };

    const applyCurrentTheme = () => {
        applyTheme(getEffectiveDarkState());
    };

    const cycleTheme = () => {
        if (pageThemeAutomationMode && !pageThemeAutomationSuppressed) {
            const currentDark = getEffectiveDarkState();
            pageThemeAutomationSuppressed = true;
            const nextDark = !currentDark;
            persistAccountSettings({
                ...getActiveAccountSettings(),
                darkMode: nextDark ? '1' : '0',
            });
            applyTheme(nextDark);
            updateToggleLabel();
            return;
        }
        const stored = getActiveAccountSettings().darkMode;
        if (stored === null) {
            const newDark = !systemDark();
            persistAccountSettings({
                ...getActiveAccountSettings(),
                darkMode: newDark ? '1' : '0',
            });
            applyTheme(newDark);
        } else if (stored === '1') {
            persistAccountSettings({
                ...getActiveAccountSettings(),
                darkMode: '0',
            });
            applyTheme(false);
        } else {
            persistAccountSettings({
                ...getActiveAccountSettings(),
                darkMode: null,
            });
            applyTheme(systemDark());
        }
        updateToggleLabel();
    };

    const updateToggleLabel = () => {
        let label = '🌓';
        if (pageThemeAutomationMode && !pageThemeAutomationSuppressed) {
            label = getEffectiveDarkState() ? '🌙' : '☀️';
        } else {
            const stored = getActiveAccountSettings().darkMode;
            if (stored === null) {
                label = '🌓';
            } else if (stored === '1') {
                label = '🌙';
            } else {
                label = '☀️';
            }
        }
        if (themeToggle) themeToggle.textContent = label;
        document.querySelectorAll('.jx-settings-theme-toggle').forEach(btn => {
            btn.textContent = label;
        });
    };

    if (themeToggle) {
        themeToggle.addEventListener('click', cycleTheme);
    }

    applyBackgroundPreferences();

    const storedTheme = getActiveAccountSettings().darkMode;
    if (pageThemeAutomationMode) {
        applyCurrentTheme();
    } else if (storedTheme !== null) {
        applyTheme(storedTheme === '1');
    } else {
        applyTheme(systemDark());
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (getActiveAccountSettings().darkMode === null && (!pageThemeAutomationMode || pageThemeAutomationSuppressed)) {
                applyTheme(e.matches);
                updateToggleLabel();
            }
        });
    }
    updateToggleLabel();

    // --- search helper with highlighting ---
    // filterSelectId (optional): ID of a <select> whose value is a tag string
    function initSearch(inputId, itemSelector, filterSelectId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const filterSelect = filterSelectId ? document.getElementById(filterSelectId) : null;
        const items = document.querySelectorAll(itemSelector);

        const noResultsMsg = document.createElement('div');
        noResultsMsg.className = 'no-results';
        noResultsMsg.textContent = 'No results found';
        noResultsMsg.style.display = 'none';
        const searchContainer = input.parentNode;
        const tip = searchContainer.nextElementSibling;
        const anchor = (tip && tip.classList.contains('small-text')) ? tip : searchContainer;
        anchor.insertAdjacentElement('afterend', noResultsMsg);

        function runFilter() {
            const q = input.value.trim();
            const qLower = q.toLowerCase();
            const tag = filterSelect ? filterSelect.value.toLowerCase() : '';
            let visibleCount = 0;

            items.forEach(el => {
                removeHighlights(el);

                const text = el.textContent.toLowerCase();
                const textMatch = text.includes(qLower);
                const tagsDiv = el.querySelector('.tags');
                const tagText = tagsDiv ? tagsDiv.textContent.toLowerCase() : '';
                const tagMatch = !tag || tagText.includes(tag);
                const matches = textMatch && tagMatch;

                el.style.display = matches ? '' : 'none';
                if (matches) visibleCount++;

                if (q && matches) highlightInNode(el, q);
            });

            noResultsMsg.style.display = ((q || tag) && visibleCount === 0) ? '' : 'none';
        }

        input.addEventListener('input', runFilter);
        if (filterSelect) filterSelect.addEventListener('change', runFilter);
    }

    function removeHighlights(node) {
        node.querySelectorAll('mark').forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });
    }

    function highlightInNode(node, query) {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');

        const mediaFilter = {
            acceptNode(n) {
                let p = n.parentNode;
                while (p && p !== node) {
                    if (/^(IFRAME|VIDEO|AUDIO|IMG|SCRIPT|STYLE)$/.test(p.nodeName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (p.classList && (p.classList.contains('tag') || p.classList.contains('visible-tags') || p.classList.contains('tags'))) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    p = p.parentNode;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        };

        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, mediaFilter);
        const nodesToProcess = [];
        let textNode;
        while (textNode = walker.nextNode()) {
            if (textNode.nodeValue.toLowerCase().includes(query.toLowerCase())) {
                nodesToProcess.push(textNode);
            }
        }

        nodesToProcess.reverse().forEach(textNode => {
            const span = document.createElement('span');
            span.innerHTML = textNode.nodeValue.replace(regex, '<mark>$1</mark>');
            textNode.parentNode.replaceChild(span, textNode);
        });
    }

    window.initSearch = initSearch;

    // --- Latest News loader for homepage ---
    function loadLatestNews() {
        const container = document.getElementById('latest-news-container');
        if (!container) return;

        fetch('news.html')
            .then(res => {
                if (!res.ok) throw new Error('Could not load news.html');
                return res.text();
            })
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const firstEntry = doc.querySelector('.news-entry');
                if (!firstEntry) {
                    container.innerHTML = '<p class="centered-text" style="color:#999;">No news articles found.</p>';
                    return;
                }

                const clone = firstEntry.cloneNode(true);

                clone.querySelectorAll('h2').forEach(h2 => {
                    const h3 = document.createElement('h3');
                    h3.innerHTML = h2.innerHTML;
                    h3.className = h2.className;
                    h2.replaceWith(h3);
                });

                clone.querySelectorAll('iframe').forEach(iframe => {
                    const link = document.createElement('p');
                    link.className = 'centered-text';
                    link.innerHTML = '<a href="news.html">&#9654; Watch on the News page</a>';
                    const vc = iframe.closest('.video-container');
                    (vc || iframe).replaceWith(link);
                });

                container.innerHTML = '';
                container.appendChild(clone);
            })
            .catch(() => {
                container.innerHTML = '<p class="centered-text" style="color:#999;">Could not load latest news.</p>';
            });
    }

    if (document.getElementById('latest-news-container')) {
        loadLatestNews();
    }

    // --- Article anchor links ---
    // Auto-assigns IDs to articles and injects a "Copy link" button into each.
    (function initArticleLinks() {
        const ARTICLE_SELECTORS = [
            '.news-entry',
            '.changelog-entry',
            '.event',
            '.hall-of-fame-entry',
        ];

        const articles = document.querySelectorAll(ARTICLE_SELECTORS.join(', '));
        if (!articles.length) return;

        function slugify(text) {
            return text
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }

        articles.forEach(article => {
            const h2 = article.querySelector('h2');
            if (!h2) return;

            const slug = slugify(h2.textContent) || ('article-' + Math.random().toString(36).slice(2, 7));

            let id = slug;
            let suffix = 2;
            while (document.getElementById(id) && document.getElementById(id) !== article) {
                id = slug + '-' + suffix++;
            }
            article.id = id;

            const btn = document.createElement('button');
            btn.className = 'article-link-btn';
            btn.setAttribute('aria-label', 'Copy link to this article');
            btn.textContent = '🔗 Copy link';

            btn.addEventListener('click', () => {
                const url = window.location.origin + window.location.pathname + '#' + id;
                navigator.clipboard.writeText(url).then(() => {
                    btn.textContent = '✅ Copied!';
                    btn.classList.add('article-link-btn--copied');
                    setTimeout(() => {
                        btn.textContent = '🔗 Copy link';
                        btn.classList.remove('article-link-btn--copied');
                    }, 2000);
                }).catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = url;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    btn.textContent = '✅ Copied!';
                    btn.classList.add('article-link-btn--copied');
                    setTimeout(() => {
                        btn.textContent = '🔗 Copy link';
                        btn.classList.remove('article-link-btn--copied');
                    }, 2000);
                });
            });

            h2.insertAdjacentElement('afterend', btn);
        });

        if (window.location.hash) {
            const target = document.getElementById(window.location.hash.slice(1));
            if (target) {
                setTimeout(() => {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
            }
        }
    })();

    // =========================================================================
    // --- Jamex Account system ---
    //
    // Two fields:
    //   Username — shown publicly on comments. Stored as 'jamex-username'.
    //   password — private, never shown. Acts as a secret identifier.
    //                  Stored as 'jamex-password'.
    //
    // On first sign-in, both are registered together in 'jamex-accounts'
    // (a JSON object mapping password → username).
    // On subsequent sign-ins from a different device/browser, the user must
    // enter both and they must match the registered pair — stopping someone
    // who has only seen a username from impersonating that account.
    // =========================================================================

    function isValidAccountEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
    }

    function cacheAccountRecord(username, password, email, settings) {
        localStorage.setItem('jamex-accounts-cache-' + username, password);
        localStorage.setItem('jamex-password', password);
        localStorage.setItem('jamex-username', username);
        if (email) {
            localStorage.setItem('jamex-email', email);
            localStorage.setItem('jamex-account-email-' + email, username);
        }
        cacheAccountSettings(settings || getCachedAccountSettings());
        setThemeAutomationContext(activeThemePage || current);
    }

    const JamexAccount = {
        getpassword: () => localStorage.getItem('jamex-password') || null,
        getusername: () => localStorage.getItem('jamex-username') || null,
        getemail: () => localStorage.getItem('jamex-email') || null,
        isLoggedIn:  () => !!localStorage.getItem('jamex-password'),
        isValidEmail: isValidAccountEmail,

        // signIn is async — checks Supabase as the shared source of truth.
        // Returns null on success, or an error string.
        // Note: sbFetch is defined later in this file; signIn is only ever
        // called from the modal after the page has fully loaded, so this is safe.
        findAccountByIdentifier: async (identifier) => {
            const identRaw = String(identifier || '').trim();
            const ident = identRaw.includes('@') ? identRaw.toLowerCase() : identRaw;
            if (!ident) return null;
            try {
                const rows = await sbFetch(
                    'accounts?or=(username.eq.' + encodeURIComponent(ident) + ',email.eq.' + encodeURIComponent(ident) + ')&select=username,password,email,settings'
                );
                remoteSettingsSyncAvailable = true;
                return rows && rows.length > 0 ? rows[0] : null;
            } catch (e) {
                const message = e && e.message ? e.message : '';
                if (/settings/i.test(message) && /column|schema/i.test(message)) {
                    remoteSettingsSyncAvailable = false;
                    const fallbackRows = await sbFetch(
                        'accounts?or=(username.eq.' + encodeURIComponent(ident) + ',email.eq.' + encodeURIComponent(ident) + ')&select=username,password,email'
                    );
                    return fallbackRows && fallbackRows.length > 0 ? fallbackRows[0] : null;
                }
                throw e;
            }
        },

        findAccountByEmail: async (email) => {
            const cleanEmail = String(email || '').trim().toLowerCase();
            if (!cleanEmail) return null;
            const rows = await sbFetch(
                'accounts?email=eq.' + encodeURIComponent(cleanEmail) + '&select=username,email'
            );
            return rows && rows.length > 0 ? rows[0] : null;
        },

        signIn: async (password, usernameOrEmail, email) => {
            const pswd = password.trim();
            const identRaw = String(usernameOrEmail || '').trim();
            const ident = identRaw.includes('@') ? identRaw.toLowerCase() : identRaw;
            const mail = String(email || '').trim().toLowerCase();

            if (!pswd || !ident) return 'Both fields are required.';
            if (identRaw.length > 60) return 'Username or email must be 60 characters or fewer.';
            if (pswd.length > 30) return 'Password must be 30 characters or fewer.';
            if (mail && !isValidAccountEmail(mail)) return 'Enter a valid email address.';

            try {
                // Look up username in Supabase accounts table
                const existing = await JamexAccount.findAccountByIdentifier(ident);
                if (existing) {
                    // Username exists — check password
                    if (existing.password !== pswd) {
                        return 'Incorrect password for that account.';
                    }
                    cacheAccountRecord(existing.username, pswd, existing.email || null, existing.settings || null);
                    return null;
                } else {
                    // New username — register in Supabase
                    if (!mail) return 'Enter an email to create a new account.';
                    const existingEmail = await JamexAccount.findAccountByEmail(mail);
                    if (existingEmail) return 'That email is already linked to another account.';
                    const initialSettings = readLegacySettings();
                    try {
                        await sbFetch('accounts', {
                            method: 'POST',
                            prefer: 'return=minimal',
                            body: JSON.stringify({ username: identRaw, email: mail, password: pswd, settings: initialSettings }),
                        });
                        remoteSettingsSyncAvailable = true;
                    } catch (e) {
                        const message = e && e.message ? e.message : '';
                        if (/settings/i.test(message) && /column|schema/i.test(message)) {
                            remoteSettingsSyncAvailable = false;
                            await sbFetch('accounts', {
                                method: 'POST',
                                prefer: 'return=minimal',
                                body: JSON.stringify({ username: identRaw, email: mail, password: pswd }),
                            });
                        } else {
                            throw e;
                        }
                    }
                    cacheAccountRecord(identRaw, pswd, mail, initialSettings);
                }
            } catch (e) {
                console.warn('Supabase account check failed, falling back to local:', e);
                // Offline fallback: use localStorage cache
                const cachedUsername = localStorage.getItem('jamex-account-email-' + ident);
                const cacheKey = cachedUsername || ident;
                const cached = localStorage.getItem('jamex-accounts-cache-' + cacheKey);
                if (cached !== null) {
                    if (cached !== pswd) return 'Incorrect password for that account.';
                    cacheAccountRecord(cacheKey, pswd, mail || localStorage.getItem('jamex-email'), getCachedAccountSettings());
                    return null;
                }
                if (!mail) return 'Enter an email to create a new account.';
                cacheAccountRecord(identRaw, pswd, mail, readLegacySettings());
            }

            return null; // success
        },

        // Update password in Supabase and local cache
        updatePassword: async (username, newPassword, email) => {
            await sbFetch(
                'accounts?username=eq.' + encodeURIComponent(username),
                {
                    method: 'PATCH',
                    prefer: 'return=minimal',
                    body: JSON.stringify({ password: newPassword }),
                }
            );
            cacheAccountRecord(username, newPassword, email || localStorage.getItem('jamex-email'), getCachedAccountSettings());
        },

        updatePasswordByEmail: async (email, newPassword) => {
            const cleanEmail = String(email || '').trim().toLowerCase();
            const account = await JamexAccount.findAccountByEmail(cleanEmail);
            if (!account) throw new Error('No account found for that email.');
            await sbFetch(
                'accounts?email=eq.' + encodeURIComponent(cleanEmail),
                {
                    method: 'PATCH',
                    prefer: 'return=minimal',
                    body: JSON.stringify({ password: newPassword }),
                }
            );
            cacheAccountRecord(account.username, newPassword, cleanEmail, getCachedAccountSettings());
        },

        updateEmail: async (username, email) => {
            const cleanEmail = String(email || '').trim().toLowerCase();
            if (!isValidAccountEmail(cleanEmail)) throw new Error('Enter a valid email address.');
            const existing = await JamexAccount.findAccountByEmail(cleanEmail);
            if (existing && existing.username !== username) {
                throw new Error('That email is already linked to another account.');
            }
            await sbFetch(
                'accounts?username=eq.' + encodeURIComponent(username),
                {
                    method: 'PATCH',
                    prefer: 'return=minimal',
                    body: JSON.stringify({ email: cleanEmail }),
                }
            );
            cacheAccountRecord(username, JamexAccount.getpassword() || '', cleanEmail, getCachedAccountSettings());
        },

        logout: () => {
            localStorage.removeItem('jamex-password');
            localStorage.removeItem('jamex-username');
            localStorage.removeItem('jamex-email');
            setThemeAutomationContext(current);
        },
    };
    window.JamexAccount = JamexAccount;

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // --- Inject account button into header, left of theme-toggle ---
    (function injectAccountButton() {
        const header = document.querySelector('header');
        if (!header) return;

        const btn = document.createElement('button');
        btn.id = 'account-btn';
        btn.setAttribute('aria-label', 'Jamex Account');

        function refreshAccountBtn() {
            const username = JamexAccount.getusername();
            btn.textContent = username ? ('👤 ' + username) : '👤 Sign in';
            btn.classList.toggle('account-btn--signed-in', !!username);
        }
        refreshAccountBtn();
        window._refreshAccountBtn = refreshAccountBtn;

        btn.addEventListener('click', () => openAccountModal(refreshAccountBtn));

        const toggle = header.querySelector('#theme-toggle');
        if (toggle) {
            header.insertBefore(btn, toggle);
        } else {
            header.appendChild(btn);
        }
    })();

    (function injectSettingsButton() {
        const header = document.querySelector('header');
        if (!header) return;

        const btn = document.createElement('button');
        btn.id = 'settings-btn';
        btn.type = 'button';
        btn.textContent = String.fromCodePoint(0x2699, 0xFE0F);
        btn.setAttribute('aria-label', 'Settings');
        btn.addEventListener('click', openSettingsModal);

        const toggle = header.querySelector('#theme-toggle');
        if (toggle) {
            header.insertBefore(btn, toggle);
        } else {
            header.appendChild(btn);
        }
    })();

    // --- Account modal ---
    function openAccountModal(onUpdate) {
        const existingModal = document.getElementById('jamex-account-modal');
        if (existingModal) {
            if (existingModal.dataset.closing !== 'true') {
                const firstInput = existingModal.querySelector('.jx-modal-input');
                if (firstInput) firstInput.focus();
            }
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'jamex-account-modal';
        overlay.className = 'jx-modal-overlay';
        overlay.dataset.closing = 'false';

        const box = document.createElement('div');
        box.className = 'jx-modal-box';

        if (JamexAccount.isLoggedIn()) {
            // Sub-view system: 'profile', 'reset', 'activity'
            function renderView(view) {
                while (box.firstChild) box.removeChild(box.firstChild);

                const title = document.createElement('h2');
                title.className = 'jx-modal-title';
                title.textContent = String.fromCodePoint(0x1F464) + ' ' + escapeHtml(JamexAccount.getusername());
                box.appendChild(title);

                if (view === 'profile') {
                    const emailValue = JamexAccount.getemail();

                    const statBtn = document.createElement('button');
                    statBtn.className = 'jx-btn jx-btn--secondary jx-profile-row-btn';
                    statBtn.textContent = String.fromCodePoint(0x1F4CA) + ' My activity';
                    statBtn.addEventListener('click', () => renderView('activity'));

                    const settingsBtn = document.createElement('button');
                    settingsBtn.className = 'jx-btn jx-btn--secondary jx-profile-row-btn';
                    settingsBtn.textContent = String.fromCodePoint(0x2699, 0xFE0F) + ' Account settings';
                    settingsBtn.addEventListener('click', () => {
                        closeModal(overlay);
                        openSettingsModal('account');
                    });

                    const emailNote = document.createElement('p');
                    emailNote.className = 'jx-modal-hint jx-modal-hint--center';
                    emailNote.textContent = emailValue
                        ? ('Recovery email: ' + emailValue)
                        : 'No recovery email linked yet.';

                    const actions = document.createElement('div');
                    actions.className = 'jx-modal-actions jx-modal-actions--col';

                    const logoutBtn = document.createElement('button');
                    logoutBtn.className = 'jx-btn jx-btn--danger';
                    logoutBtn.textContent = 'Sign out';
                    logoutBtn.addEventListener('click', () => {
                        JamexAccount.logout();
                        if (onUpdate) onUpdate();
                        closeModal(overlay);
                        refreshAllInteractionUIs();
                    });

                    const closeBtn = document.createElement('button');
                    closeBtn.className = 'jx-btn jx-btn--secondary';
                    closeBtn.textContent = 'Close';
                    closeBtn.addEventListener('click', () => closeModal(overlay));

                    box.appendChild(statBtn);
                    box.appendChild(settingsBtn);
                    box.appendChild(emailNote);
                    actions.appendChild(logoutBtn);
                    actions.appendChild(closeBtn);
                    box.appendChild(actions);

                } else if (view === 'reset') {
                    const uname = JamexAccount.getusername();

                    const oldLabel = document.createElement('label');
                    oldLabel.className = 'jx-modal-label';
                    oldLabel.textContent = 'Current password';
                    oldLabel.setAttribute('for', 'jx-old-password');

                    const oldInput = document.createElement('input');
                    oldInput.id = 'jx-old-password';
                    oldInput.className = 'jx-modal-input';
                    oldInput.type = 'password';
                    oldInput.placeholder = 'Enter current password...';
                    oldInput.maxLength = 30;
                    oldInput.autocomplete = 'current-password';

                    const newLabel = document.createElement('label');
                    newLabel.className = 'jx-modal-label';
                    newLabel.textContent = 'New password';
                    newLabel.setAttribute('for', 'jx-new-password');

                    const newInput = document.createElement('input');
                    newInput.id = 'jx-new-password';
                    newInput.className = 'jx-modal-input';
                    newInput.type = 'password';
                    newInput.placeholder = 'Enter new password...';
                    newInput.maxLength = 30;
                    newInput.autocomplete = 'new-password';

                    const errorEl = document.createElement('p');
                    errorEl.className = 'jx-modal-error';
                    errorEl.style.display = 'none';

                    const successEl = document.createElement('p');
                    successEl.className = 'jx-modal-success';
                    successEl.style.display = 'none';
                    successEl.textContent = 'Password updated!';

                    const resetActions = document.createElement('div');
                    resetActions.className = 'jx-modal-actions';

                    const saveBtn = document.createElement('button');
                    saveBtn.className = 'jx-btn jx-btn--primary';
                    saveBtn.textContent = 'Save';

                    const backBtn = document.createElement('button');
                    backBtn.className = 'jx-btn jx-btn--secondary';
                    backBtn.textContent = 'Back';
                    backBtn.addEventListener('click', () => renderView('profile'));

                    let isSavingPassword = false;
                    saveBtn.addEventListener('click', async () => {
                        if (isSavingPassword) return;
                        errorEl.style.display = 'none';
                        successEl.style.display = 'none';
                        const oldVal = oldInput.value.trim();
                        const newVal = newInput.value.trim();
                        if (!oldVal || !newVal) {
                            errorEl.textContent = 'Both fields are required.';
                            errorEl.style.display = '';
                            return;
                        }
                        if (newVal.length > 30) {
                            errorEl.textContent = 'New password must be 30 characters or fewer.';
                            errorEl.style.display = '';
                            return;
                        }
                        // Verify current password against Supabase
                        isSavingPassword = true;
                        saveBtn.disabled = true;
                        saveBtn.textContent = 'Saving...';
                        try {
                            const rows = await sbFetch('accounts?username=eq.' + encodeURIComponent(uname) + '&select=password');
                            const storedPwd = rows && rows.length > 0 ? rows[0].password : localStorage.getItem('jamex-accounts-cache-' + uname);
                            if (storedPwd !== oldVal) {
                                errorEl.textContent = 'Current password is incorrect.';
                                errorEl.style.display = '';
                                saveBtn.disabled = false;
                                saveBtn.textContent = 'Save';
                                isSavingPassword = false;
                                return;
                            }
                            await JamexAccount.updatePassword(uname, newVal, JamexAccount.getemail());
                            successEl.style.display = '';
                            oldInput.value = '';
                            newInput.value = '';
                            setTimeout(() => renderView('profile'), 1500);
                        } catch (e) {
                            errorEl.textContent = 'Could not update password. Please try again.';
                            errorEl.style.display = '';
                        }
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save';
                        isSavingPassword = false;
                    });

                    oldInput.addEventListener('keydown', e => { if (e.key === 'Enter') newInput.focus(); });
                    newInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });

                    resetActions.appendChild(saveBtn);
                    resetActions.appendChild(backBtn);
                    box.appendChild(oldLabel);
                    box.appendChild(oldInput);
                    box.appendChild(newLabel);
                    box.appendChild(newInput);
                    box.appendChild(errorEl);
                    box.appendChild(successEl);
                    box.appendChild(resetActions);
                    requestAnimationFrame(() => oldInput.focus());

                } else if (view === 'email') {
                    const uname = JamexAccount.getusername();
                    const currentEmail = JamexAccount.getemail() || '';

                    const emailLabel = document.createElement('label');
                    emailLabel.className = 'jx-modal-label';
                    emailLabel.textContent = currentEmail ? 'Update email' : 'Add email';
                    emailLabel.setAttribute('for', 'jx-account-email');

                    const emailInput = document.createElement('input');
                    emailInput.id = 'jx-account-email';
                    emailInput.className = 'jx-modal-input';
                    emailInput.type = 'email';
                    emailInput.placeholder = 'Enter your recovery email...';
                    emailInput.maxLength = 120;
                    emailInput.autocomplete = 'email';
                    emailInput.value = currentEmail;

                    const infoEl = document.createElement('p');
                    infoEl.className = 'jx-modal-hint';
                    infoEl.textContent = 'Once an email is linked, you can sign in with it and use password recovery.';

                    const errorEl = document.createElement('p');
                    errorEl.className = 'jx-modal-error';
                    errorEl.style.display = 'none';

                    const successEl = document.createElement('p');
                    successEl.className = 'jx-modal-success';
                    successEl.style.display = 'none';

                    const emailActions = document.createElement('div');
                    emailActions.className = 'jx-modal-actions';

                    const saveBtn = document.createElement('button');
                    saveBtn.className = 'jx-btn jx-btn--primary';
                    saveBtn.textContent = currentEmail ? 'Update email' : 'Save email';

                    const backBtn = document.createElement('button');
                    backBtn.className = 'jx-btn jx-btn--secondary';
                    backBtn.textContent = 'Back';
                    backBtn.addEventListener('click', () => renderView('profile'));

                    let isSavingEmail = false;
                    saveBtn.addEventListener('click', async () => {
                        const nextEmail = emailInput.value.trim().toLowerCase();
                        if (isSavingEmail) return;
                        errorEl.style.display = 'none';
                        successEl.style.display = 'none';
                        if (!JamexAccount.isValidEmail(nextEmail)) {
                            errorEl.textContent = 'Enter a valid email address.';
                            errorEl.style.display = '';
                            return;
                        }
                        isSavingEmail = true;
                        saveBtn.disabled = true;
                        saveBtn.textContent = 'Saving...';
                        try {
                            await JamexAccount.updateEmail(uname, nextEmail);
                            successEl.textContent = 'Email saved.';
                            successEl.style.display = '';
                            setTimeout(() => renderView('profile'), 1000);
                        } catch (e) {
                            errorEl.textContent = e && e.message ? e.message : 'Could not save your email.';
                            errorEl.style.display = '';
                        }
                        saveBtn.disabled = false;
                        saveBtn.textContent = currentEmail ? 'Update email' : 'Save email';
                        isSavingEmail = false;
                    });

                    emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });

                    emailActions.appendChild(saveBtn);
                    emailActions.appendChild(backBtn);
                    box.appendChild(emailLabel);
                    box.appendChild(emailInput);
                    box.appendChild(infoEl);
                    box.appendChild(errorEl);
                    box.appendChild(successEl);
                    box.appendChild(emailActions);
                    requestAnimationFrame(() => emailInput.focus());

                } else if (view === 'activity') {
                    // Show loading state while fetching from Supabase
                    const loadingEl = document.createElement('p');
                    loadingEl.className = 'jx-no-comments';
                    loadingEl.textContent = 'Loading your activity...';
                    box.appendChild(loadingEl);

                    const pswd = JamexAccount.getpassword();
                    (window._getUserActivity ? window._getUserActivity(pswd) : Promise.resolve({ likedArticles: [], userComments: [] }))
                        .then(({ likedArticles, userComments }) => {
                            loadingEl.remove();

                            // Stats row
                            const statsRow = document.createElement('div');
                            statsRow.className = 'jx-activity-stats';

                            const likesStat = document.createElement('div');
                            likesStat.className = 'jx-activity-stat';
                            const likesNum = document.createElement('span');
                            likesNum.className = 'jx-stat-num';
                            likesNum.textContent = String(likedArticles.length);
                            const likesLbl = document.createElement('span');
                            likesLbl.className = 'jx-stat-label';
                            likesLbl.textContent = 'liked';
                            likesStat.appendChild(likesNum);
                            likesStat.appendChild(likesLbl);

                            const cmtsStat = document.createElement('div');
                            cmtsStat.className = 'jx-activity-stat';
                            const cmtsNum = document.createElement('span');
                            cmtsNum.className = 'jx-stat-num';
                            cmtsNum.textContent = String(userComments.length);
                            const cmtsLbl = document.createElement('span');
                            cmtsLbl.className = 'jx-stat-label';
                            cmtsLbl.textContent = 'comments';
                            cmtsStat.appendChild(cmtsNum);
                            cmtsStat.appendChild(cmtsLbl);

                            statsRow.appendChild(likesStat);
                            statsRow.appendChild(cmtsStat);
                            box.appendChild(statsRow);

                            if (userComments.length > 0) {
                                const secHeader = document.createElement('p');
                                secHeader.className = 'jx-activity-section-header';
                                secHeader.textContent = 'Your comments';
                                box.appendChild(secHeader);

                                const commentList = document.createElement('div');
                                commentList.className = 'jx-activity-comment-list';

                                userComments.forEach(c => {
                                    const item = document.createElement('div');
                                    item.className = 'jx-activity-comment-item';

                                    const meta = document.createElement('div');
                                    meta.className = 'jx-comment-meta';

                                    const articleLink = document.createElement('a');
                                    articleLink.className = 'jx-activity-article-link';
                                    articleLink.href = '#' + c.article_id;
                                    articleLink.textContent = c.article_id.replace(/-/g, ' ');
                                    articleLink.addEventListener('click', () => closeModal(overlay));

                                    const timeEl = document.createElement('span');
                                    timeEl.className = 'jx-comment-time';
                                    timeEl.textContent = formatTimestamp(c.ts);

                                    meta.appendChild(articleLink);
                                    meta.appendChild(timeEl);

                                    const textEl = document.createElement('p');
                                    textEl.className = 'jx-comment-text';
                                    textEl.textContent = c.text;

                                    item.appendChild(meta);
                                    item.appendChild(textEl);
                                    commentList.appendChild(item);
                                });
                                box.appendChild(commentList);
                            } else {
                                const none = document.createElement('p');
                                none.className = 'jx-no-comments';
                                none.textContent = "You haven't commented yet.";
                                box.appendChild(none);
                            }

                            const actBackBtn = document.createElement('button');
                            actBackBtn.className = 'jx-btn jx-btn--secondary';
                            actBackBtn.style.marginTop = '14px';
                            actBackBtn.textContent = 'Back';
                            actBackBtn.addEventListener('click', () => renderView('profile'));
                            box.appendChild(actBackBtn);
                        })
                        .catch(() => {
                            loadingEl.textContent = 'Could not load activity.';
                        });

                }
            } // end renderView

            renderView('profile');

        } else {
            // ── Sign-in / register view ──
            const title = document.createElement('h2');
            title.className = 'jx-modal-title';
            title.textContent = 'Jamex Account';

            const sub = document.createElement('p');
            sub.className = 'jx-modal-sub';
            sub.textContent = 'Sign in to like and comment on articles.';

            // username or email field
            const displayLabel = document.createElement('label');
            displayLabel.className = 'jx-modal-label';
            displayLabel.textContent = 'username or email';
            displayLabel.setAttribute('for', 'jx-username-input');

            const displayInput = document.createElement('input');
            displayInput.id = 'jx-username-input';
            displayInput.className = 'jx-modal-input';
            displayInput.type = 'text';
            displayInput.placeholder = 'Shown on your comments…';
            displayInput.maxLength = 60;
            displayInput.autocomplete = 'off';

            const displayHint = document.createElement('p');
            displayHint.className = 'jx-modal-hint';
            displayHint.textContent = 'Sign in with your username or email. New accounts use this as the public username.';

            const emailLabel = document.createElement('label');
            emailLabel.className = 'jx-modal-label';
            emailLabel.textContent = 'email (for new accounts)';
            emailLabel.setAttribute('for', 'jx-email-input');

            const emailInput = document.createElement('input');
            emailInput.id = 'jx-email-input';
            emailInput.className = 'jx-modal-input';
            emailInput.type = 'email';
            emailInput.placeholder = 'Needed for new accounts and recovery...';
            emailInput.maxLength = 120;
            emailInput.autocomplete = 'email';

            const emailHint = document.createElement('p');
            emailHint.className = 'jx-modal-hint';
            emailHint.textContent = 'Existing accounts can leave this blank when signing in.';

            // password field
            const passwordLabel = document.createElement('label');
            passwordLabel.className = 'jx-modal-label';
            passwordLabel.textContent = 'password (private)';
            passwordLabel.setAttribute('for', 'jx-password-input');

            const passwordInput = document.createElement('input');
            passwordInput.id = 'jx-password-input';
            passwordInput.className = 'jx-modal-input';
            passwordInput.type = 'password';
            passwordInput.placeholder = 'Only you know this…';
            passwordInput.maxLength = 30;
            passwordInput.autocomplete = 'off';

            const passwordField = document.createElement('div');
            passwordField.className = 'jx-password-field';

            const togglePasswordBtn = document.createElement('button');
            togglePasswordBtn.className = 'jx-password-toggle';
            togglePasswordBtn.type = 'button';
            togglePasswordBtn.textContent = 'Show';
            togglePasswordBtn.setAttribute('aria-label', 'Show password');
            togglePasswordBtn.setAttribute('aria-pressed', 'false');
            togglePasswordBtn.addEventListener('click', () => {
                const showing = passwordInput.type === 'text';
                passwordInput.type = showing ? 'password' : 'text';
                togglePasswordBtn.textContent = showing ? 'Show' : 'Hide';
                togglePasswordBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
                togglePasswordBtn.setAttribute('aria-pressed', showing ? 'false' : 'true');
                passwordInput.focus();
                const cursor = passwordInput.value.length;
                passwordInput.setSelectionRange(cursor, cursor);
            });

            const passwordHint = document.createElement('p');
            passwordHint.className = 'jx-modal-hint';
            passwordHint.textContent =
                'Never shown publicly. Keeps your account yours. ' +
                'Letters, numbers, underscores only. Max 30 characters.';

            const errorEl = document.createElement('p');
            errorEl.className = 'jx-modal-error';
            errorEl.style.display = 'none';

            const forgotToggle = document.createElement('button');
            forgotToggle.className = 'jx-modal-link-btn';
            forgotToggle.type = 'button';
            forgotToggle.textContent = 'Forgot your password?';

            const forgotPanel = document.createElement('div');
            forgotPanel.className = 'jx-forgot-panel';
            forgotPanel.style.display = 'none';

            const forgotInfo = document.createElement('p');
            forgotInfo.className = 'jx-modal-hint';
            forgotInfo.textContent = 'Enter your email. If it matches an account, you can set a new password.';

            const forgotEmailInput = document.createElement('input');
            forgotEmailInput.className = 'jx-modal-input';
            forgotEmailInput.type = 'email';
            forgotEmailInput.placeholder = 'Enter your account email...';
            forgotEmailInput.maxLength = 120;
            forgotEmailInput.autocomplete = 'email';

            const forgotErrorEl = document.createElement('p');
            forgotErrorEl.className = 'jx-modal-error';
            forgotErrorEl.style.display = 'none';

            const forgotSuccessEl = document.createElement('p');
            forgotSuccessEl.className = 'jx-modal-success';
            forgotSuccessEl.style.display = 'none';

            const forgotNewPasswordField = document.createElement('div');
            forgotNewPasswordField.className = 'jx-password-field';
            forgotNewPasswordField.style.display = 'none';

            const forgotNewPasswordInput = document.createElement('input');
            forgotNewPasswordInput.className = 'jx-modal-input';
            forgotNewPasswordInput.type = 'password';
            forgotNewPasswordInput.placeholder = 'Enter a new password...';
            forgotNewPasswordInput.maxLength = 30;
            forgotNewPasswordInput.autocomplete = 'new-password';

            const forgotTogglePasswordBtn = document.createElement('button');
            forgotTogglePasswordBtn.className = 'jx-password-toggle';
            forgotTogglePasswordBtn.type = 'button';
            forgotTogglePasswordBtn.textContent = 'Show';

            const forgotActions = document.createElement('div');
            forgotActions.className = 'jx-modal-actions';

            const forgotVerifyBtn = document.createElement('button');
            forgotVerifyBtn.className = 'jx-btn jx-btn--secondary';
            forgotVerifyBtn.type = 'button';
            forgotVerifyBtn.textContent = 'Check email';

            const forgotResetBtn = document.createElement('button');
            forgotResetBtn.className = 'jx-btn jx-btn--primary';
            forgotResetBtn.type = 'button';
            forgotResetBtn.textContent = 'Reset password';
            forgotResetBtn.style.display = 'none';

            const actions = document.createElement('div');
            actions.className = 'jx-modal-actions';

            const signinBtn = document.createElement('button');
            signinBtn.className = 'jx-btn jx-btn--primary';
            signinBtn.textContent = 'Sign in';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'jx-btn jx-btn--secondary';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => closeModal(overlay));

            forgotTogglePasswordBtn.addEventListener('click', () => {
                const showing = forgotNewPasswordInput.type === 'text';
                forgotNewPasswordInput.type = showing ? 'password' : 'text';
                forgotTogglePasswordBtn.textContent = showing ? 'Show' : 'Hide';
                forgotNewPasswordInput.focus();
                const cursor = forgotNewPasswordInput.value.length;
                forgotNewPasswordInput.setSelectionRange(cursor, cursor);
            });

            let recoveryVerified = false;
            forgotToggle.addEventListener('click', () => {
                const opening = forgotPanel.style.display === 'none';
                forgotPanel.style.display = opening ? '' : 'none';
                forgotToggle.textContent = opening ? 'Hide password recovery' : 'Forgot your password?';
                forgotErrorEl.style.display = 'none';
                forgotSuccessEl.style.display = 'none';
                if (opening) requestAnimationFrame(() => forgotEmailInput.focus());
            });

            forgotVerifyBtn.addEventListener('click', async () => {
                const recoveryEmail = forgotEmailInput.value.trim().toLowerCase();
                forgotErrorEl.style.display = 'none';
                forgotSuccessEl.style.display = 'none';
                recoveryVerified = false;
                forgotNewPasswordField.style.display = 'none';
                forgotResetBtn.style.display = 'none';
                if (!JamexAccount.isValidEmail(recoveryEmail)) {
                    forgotErrorEl.textContent = 'Enter a valid email address.';
                    forgotErrorEl.style.display = '';
                    return;
                }
                forgotVerifyBtn.disabled = true;
                forgotVerifyBtn.textContent = 'Checking...';
                try {
                    const account = await JamexAccount.findAccountByEmail(recoveryEmail);
                    if (!account) {
                        forgotErrorEl.textContent = 'No account was found for that email.';
                        forgotErrorEl.style.display = '';
                    } else {
                        recoveryVerified = true;
                        forgotSuccessEl.textContent = 'Email matched. You can now choose a new password.';
                        forgotSuccessEl.style.display = '';
                        forgotNewPasswordField.style.display = '';
                        forgotResetBtn.style.display = '';
                        requestAnimationFrame(() => forgotNewPasswordInput.focus());
                    }
                } catch (e) {
                    forgotErrorEl.textContent = 'Could not verify that email right now.';
                    forgotErrorEl.style.display = '';
                }
                forgotVerifyBtn.disabled = false;
                forgotVerifyBtn.textContent = 'Check email';
            });

            forgotResetBtn.addEventListener('click', async () => {
                const recoveryEmail = forgotEmailInput.value.trim().toLowerCase();
                const newPassword = forgotNewPasswordInput.value.trim();
                forgotErrorEl.style.display = 'none';
                forgotSuccessEl.style.display = 'none';
                if (!recoveryVerified) {
                    forgotErrorEl.textContent = 'Check your email first.';
                    forgotErrorEl.style.display = '';
                    return;
                }
                if (!newPassword) {
                    forgotErrorEl.textContent = 'Enter a new password.';
                    forgotErrorEl.style.display = '';
                    return;
                }
                if (newPassword.length > 30) {
                    forgotErrorEl.textContent = 'New password must be 30 characters or fewer.';
                    forgotErrorEl.style.display = '';
                    return;
                }
                forgotResetBtn.disabled = true;
                forgotResetBtn.textContent = 'Resetting...';
                try {
                    await JamexAccount.updatePasswordByEmail(recoveryEmail, newPassword);
                    forgotSuccessEl.textContent = 'Password reset. You can now sign in.';
                    forgotSuccessEl.style.display = '';
                    passwordInput.value = newPassword;
                    displayInput.value = recoveryEmail;
                    emailInput.value = recoveryEmail;
                    forgotNewPasswordInput.value = '';
                } catch (e) {
                    forgotErrorEl.textContent = 'Could not reset your password. Please try again.';
                    forgotErrorEl.style.display = '';
                }
                forgotResetBtn.disabled = false;
                forgotResetBtn.textContent = 'Reset password';
            });

            let isSigningIn = false;
            const doSignIn = async () => {
                if (isSigningIn || overlay.dataset.closing === 'true') return;
                errorEl.style.display = 'none';
                isSigningIn = true;
                signinBtn.disabled = true;
                signinBtn.textContent = 'Signing in...';
                const err = await JamexAccount.signIn(passwordInput.value, displayInput.value, emailInput.value);
                signinBtn.disabled = false;
                signinBtn.textContent = 'Sign in';
                if (err) {
                    errorEl.textContent = err;
                    errorEl.style.display = '';
                    isSigningIn = false;
                    return;
                }
                if (onUpdate) onUpdate();
                closeModal(overlay);
                refreshAllInteractionUIs();
                isSigningIn = false;
            };

            signinBtn.addEventListener('click', doSignIn);
            passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSignIn(); });
            emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') passwordInput.focus(); });
            forgotEmailInput.addEventListener('keydown', e => { if (e.key === 'Enter') forgotVerifyBtn.click(); });
            forgotNewPasswordInput.addEventListener('keydown', e => { if (e.key === 'Enter') forgotResetBtn.click(); });
            displayInput.addEventListener('keydown', e => { if (e.key === 'Enter') passwordInput.focus(); });
            requestAnimationFrame(() => displayInput.focus());

            actions.appendChild(signinBtn);
            actions.appendChild(cancelBtn);
            passwordField.appendChild(passwordInput);
            passwordField.appendChild(togglePasswordBtn);
            forgotNewPasswordField.appendChild(forgotNewPasswordInput);
            forgotNewPasswordField.appendChild(forgotTogglePasswordBtn);
            forgotActions.appendChild(forgotVerifyBtn);
            forgotActions.appendChild(forgotResetBtn);
            forgotPanel.appendChild(forgotInfo);
            forgotPanel.appendChild(forgotEmailInput);
            forgotPanel.appendChild(forgotErrorEl);
            forgotPanel.appendChild(forgotSuccessEl);
            forgotPanel.appendChild(forgotNewPasswordField);
            forgotPanel.appendChild(forgotActions);
            box.appendChild(title);
            box.appendChild(sub);
            box.appendChild(displayLabel);
            box.appendChild(displayInput);
            box.appendChild(displayHint);
            box.appendChild(emailLabel);
            box.appendChild(emailInput);
            box.appendChild(emailHint);
            box.appendChild(passwordLabel);
            box.appendChild(passwordField);
            box.appendChild(passwordHint);
            box.appendChild(errorEl);
            box.appendChild(forgotToggle);
            box.appendChild(forgotPanel);
            box.appendChild(actions);
        }

        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });

        function escHandler(e) {
            if (e.key === 'Escape') {
                closeModal(overlay);
                document.removeEventListener('keydown', escHandler);
            }
        }
        document.addEventListener('keydown', escHandler);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function closeModal(overlay) {
        if (!overlay || overlay.dataset.closing === 'true') return;
        if (overlay.id === 'jamex-settings-modal' && overlay.dataset.dirty === 'true' && overlay.dataset.allowClose !== 'true') {
            openConfirmModal(
                'Discard changes?',
                'Exit without saving your settings changes?',
                () => {
                    if (typeof overlay._discardDraft === 'function') overlay._discardDraft();
                }
            );
            return;
        }
        overlay.dataset.closing = 'true';
        overlay.classList.add('jx-modal-closing');
        if (overlay.id === 'jamex-settings-modal') {
            setThemeAutomationContext(current);
        }
        setTimeout(() => overlay.remove(), 200);
    }

    function openConfirmModal(titleText, bodyText, onConfirm) {
        const existing = document.getElementById('jamex-confirm-modal');
        if (existing) return;

        const overlay = document.createElement('div');
        overlay.id = 'jamex-confirm-modal';
        overlay.className = 'jx-modal-overlay';
        overlay.dataset.closing = 'false';

        const box = document.createElement('div');
        box.className = 'jx-modal-box';

        const title = document.createElement('h2');
        title.className = 'jx-modal-title';
        title.textContent = titleText;

        const body = document.createElement('p');
        body.className = 'jx-modal-sub';
        body.textContent = bodyText;

        const actions = document.createElement('div');
        actions.className = 'jx-modal-actions';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'jx-btn jx-btn--primary';
        confirmBtn.type = 'button';
        confirmBtn.textContent = 'Exit without saving';
        confirmBtn.addEventListener('click', () => {
            closeModal(overlay);
            if (onConfirm) onConfirm();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'jx-btn jx-btn--secondary';
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => closeModal(overlay));

        actions.appendChild(confirmBtn);
        actions.appendChild(cancelBtn);
        box.appendChild(title);
        box.appendChild(body);
        box.appendChild(actions);

        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });

        function escHandler(e) {
            if (e.key === 'Escape') {
                closeModal(overlay);
                document.removeEventListener('keydown', escHandler);
            }
        }
        document.addEventListener('keydown', escHandler);

        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    async function refreshSignedInAccountSettings() {
        if (document.getElementById('jamex-settings-modal')) return;
        if (!JamexAccount.isLoggedIn()) return;
        const username = JamexAccount.getusername();
        const password = JamexAccount.getpassword();
        if (!username || !password) return;
        try {
            const account = await JamexAccount.findAccountByIdentifier(username);
            if (!account || account.password !== password) return;
            cacheAccountRecord(account.username, password, account.email || null, account.settings || null);
        } catch (e) {
            console.warn('Could not refresh signed-in account settings:', e);
        }
    }

    function buildLabeledInput(id, labelText, type, placeholder, autocomplete) {
        const label = document.createElement('label');
        label.className = 'jx-modal-label';
        label.setAttribute('for', id);
        label.textContent = labelText;

        const input = document.createElement('input');
        input.id = id;
        input.className = 'jx-modal-input';
        input.type = type;
        input.placeholder = placeholder;
        if (autocomplete) input.autocomplete = autocomplete;
        if (type === 'password') input.maxLength = 30;
        if (type === 'email') input.maxLength = 120;

        return { label, input };
    }

    function buildReadout() {
        const el = document.createElement('p');
        el.className = 'jx-modal-readout';
        el.style.display = 'none';
        return el;
    }

    async function getCurrentAccountRecord() {
        const username = JamexAccount.getusername();
        if (!username) return null;
        try {
            return await JamexAccount.findAccountByIdentifier(username);
        } catch (e) {
            return {
                username: username,
                password: JamexAccount.getpassword(),
                email: JamexAccount.getemail(),
            };
        }
    }

    function openSettingsModal(initialTab) {
        const existing = document.getElementById('jamex-settings-modal');
        if (existing) {
            if (existing.dataset.closing !== 'true') {
                const requestedTab = initialTab || existing.dataset.activeTab || 'appearance';
                const requestedButton = existing.querySelector('.jx-settings-tab[data-tab-id="' + requestedTab + '"]');
                if (requestedButton) requestedButton.click();
                const firstInput = existing.querySelector('.jx-settings-back, .jx-settings-tab, .jx-modal-input, input[type="radio"]');
                if (firstInput) firstInput.focus();
            }
            return;
        }

        const accountModal = document.getElementById('jamex-account-modal');
        if (accountModal) closeModal(accountModal);

        const overlay = document.createElement('div');
        overlay.id = 'jamex-settings-modal';
        overlay.className = 'jx-modal-overlay jx-settings-overlay';
        overlay.dataset.closing = 'false';

        const originalSettings = normalizeAccountSettings(getActiveAccountSettings());
        let draftSettings = normalizeAccountSettings(originalSettings);
        let draftThemeAutomationSuppressed = false;

        function areSettingsEqual(a, b) {
            return JSON.stringify(normalizeAccountSettings(a)) === JSON.stringify(normalizeAccountSettings(b));
        }

        function getDraftEffectiveDarkState() {
            const settingsAutomationMode = draftSettings.pageThemeAutomations[SETTINGS_THEME_PAGE];
            if ((settingsAutomationMode === 'dark' || settingsAutomationMode === 'light') && !draftThemeAutomationSuppressed) {
                return settingsAutomationMode === 'dark';
            }
            if (draftSettings.darkMode !== null) return draftSettings.darkMode === '1';
            return systemDark();
        }

        function applyDraftSettings() {
            cacheAccountSettings(draftSettings);
            setThemeAutomationContext(SETTINGS_THEME_PAGE, { resetSuppression: false });
            pageThemeAutomationSuppressed = draftThemeAutomationSuppressed;
            applyTheme(getDraftEffectiveDarkState());
            updateToggleLabel();
        }

        function revertDraftSettings() {
            draftSettings = normalizeAccountSettings(originalSettings);
            draftThemeAutomationSuppressed = false;
            cacheAccountSettings(originalSettings);
            setThemeAutomationContext(current);
        }

        overlay._discardDraft = () => {
            revertDraftSettings();
            overlay.dataset.allowClose = 'true';
            closeModal(overlay);
        };

        function saveDraftSettings() {
            persistAccountSettings(draftSettings);
            draftThemeAutomationSuppressed = false;
            overlay.dataset.allowClose = 'true';
            closeModal(overlay);
        }

        setThemeAutomationContext(SETTINGS_THEME_PAGE);
        applyDraftSettings();

        const page = document.createElement('div');
        page.className = 'jx-settings-page';

        const topbar = document.createElement('div');
        topbar.className = 'jx-settings-topbar';

        const topbarMain = document.createElement('div');
        topbarMain.className = 'jx-settings-topbar-main';

        const backBtn = document.createElement('button');
        backBtn.className = 'jx-btn jx-btn--secondary jx-settings-back';
        backBtn.type = 'button';
        backBtn.textContent = String.fromCodePoint(0x21A9, 0xFE0F) + ' Back';
        backBtn.addEventListener('click', () => closeModal(overlay));

        const dirtyActions = document.createElement('div');
        dirtyActions.className = 'jx-settings-dirty-actions';
        dirtyActions.style.display = 'none';

        const saveExitBtn = document.createElement('button');
        saveExitBtn.className = 'jx-btn jx-btn--secondary';
        saveExitBtn.type = 'button';
        saveExitBtn.textContent = String.fromCodePoint(0x1F4BE) + ' Save and exit';
        saveExitBtn.addEventListener('click', saveDraftSettings);

        const exitWithoutSavingBtn = document.createElement('button');
        exitWithoutSavingBtn.className = 'jx-btn jx-btn--danger';
        exitWithoutSavingBtn.type = 'button';
        exitWithoutSavingBtn.textContent = String.fromCodePoint(0x21A9, 0xFE0F) + ' Exit without saving';
        exitWithoutSavingBtn.addEventListener('click', () => {
            openConfirmModal(
                'Discard changes?',
                'Exit without saving your settings changes?',
                () => overlay._discardDraft()
            );
        });

        dirtyActions.appendChild(saveExitBtn);
        dirtyActions.appendChild(exitWithoutSavingBtn);

        const settingsThemeBtn = document.createElement('button');
        settingsThemeBtn.className = 'jx-settings-theme-toggle';
        settingsThemeBtn.type = 'button';
        settingsThemeBtn.setAttribute('aria-label', 'Toggle theme');
        settingsThemeBtn.addEventListener('click', () => {
            const settingsAutomationMode = draftSettings.pageThemeAutomations[SETTINGS_THEME_PAGE];
            const currentDark = getDraftEffectiveDarkState();
            draftThemeAutomationSuppressed = !!(settingsAutomationMode && !draftThemeAutomationSuppressed) || draftThemeAutomationSuppressed;
            draftSettings.darkMode = currentDark ? '0' : '1';
            applyDraftSettings();
            updateDirtyState();
        });

        const hero = document.createElement('div');
        hero.className = 'jx-settings-hero';

        const title = document.createElement('h2');
        title.className = 'jx-modal-title';
        title.textContent = String.fromCodePoint(0x2699, 0xFE0F) + ' Settings';

        const sub = document.createElement('p');
        sub.className = 'jx-modal-sub';
        sub.textContent = 'Customise your account and the look and feel of the website';

        topbarMain.appendChild(backBtn);
        topbarMain.appendChild(dirtyActions);
        hero.appendChild(title);
        hero.appendChild(sub);
        topbarMain.appendChild(hero);
        topbar.appendChild(topbarMain);
        topbar.appendChild(settingsThemeBtn);

        const layout = document.createElement('div');
        layout.className = 'jx-settings-layout';

        const sidebar = document.createElement('aside');
        sidebar.className = 'jx-settings-sidebar';

        const content = document.createElement('div');
        content.className = 'jx-settings-content';

        const panels = {};
        const tabs = {};

        function updateDirtyState() {
            const dirty = !areSettingsEqual(draftSettings, originalSettings);
            overlay.dataset.dirty = dirty ? 'true' : 'false';
            if (!dirty) overlay.dataset.allowClose = 'false';
            backBtn.style.display = dirty ? 'none' : '';
            dirtyActions.style.display = dirty ? '' : 'none';
        }

        function activateTab(tabId) {
            overlay.dataset.activeTab = tabId;
            Object.keys(panels).forEach(key => {
                const active = key === tabId;
                panels[key].hidden = !active;
                tabs[key].classList.toggle('jx-settings-tab--active', active);
                tabs[key].setAttribute('aria-selected', active ? 'true' : 'false');
            });
        }

        function createTab(tabId, label) {
            const btn = document.createElement('button');
            btn.className = 'jx-settings-tab';
            btn.type = 'button';
            btn.textContent = label;
            btn.dataset.tabId = tabId;
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', 'false');
            btn.addEventListener('click', () => activateTab(tabId));
            tabs[tabId] = btn;
            sidebar.appendChild(btn);
        }

        function createPanel(tabId, headingText, hintText) {
            const panel = document.createElement('section');
            panel.className = 'jx-settings-panel';
            panel.setAttribute('role', 'tabpanel');
            panel.hidden = true;

            const heading = document.createElement('h3');
            heading.className = 'jx-settings-heading';
            heading.textContent = headingText;

            const hint = document.createElement('p');
            hint.className = 'jx-modal-hint';
            hint.textContent = hintText;

            panel.appendChild(heading);
            panel.appendChild(hint);
            panels[tabId] = panel;
            content.appendChild(panel);
            return panel;
        }

        createTab('account', String.fromCodePoint(0x1F464) + ' Account');
        createTab('appearance', String.fromCodePoint(0x1F3A8) + ' Appearance');
        createTab('automations', String.fromCodePoint(0x1F916) + ' Automations');

        const accountSection = createPanel('account', 'Account settings', 'Update and reveal your saved account details from one place.');

        if (JamexAccount.isLoggedIn()) {
            const accountHint = document.createElement('p');
            accountHint.className = 'jx-modal-hint';
            accountHint.textContent = 'Signed in as ' + JamexAccount.getusername() + '.';
            accountSection.appendChild(accountHint);

            const resetCard = document.createElement('div');
            resetCard.className = 'jx-settings-card';
            const resetTitle = document.createElement('h4');
            resetTitle.className = 'jx-settings-card-title';
            resetTitle.textContent = 'Reset your password';
            const resetHint = document.createElement('p');
            resetHint.className = 'jx-modal-hint';
            resetHint.textContent = 'Enter your current password, then your new password twice.';
            const resetError = document.createElement('p');
            resetError.className = 'jx-modal-error';
            resetError.style.display = 'none';
            const resetSuccess = document.createElement('p');
            resetSuccess.className = 'jx-modal-success';
            resetSuccess.style.display = 'none';
            const currentPasswordField = buildLabeledInput('jx-settings-current-password', 'Current password', 'password', 'Enter current password...', 'current-password');
            const newPasswordField = buildLabeledInput('jx-settings-new-password', 'Enter new password', 'password', 'Choose a new password...', 'new-password');
            const confirmPasswordField = buildLabeledInput('jx-settings-confirm-password', 'Confirm new password', 'password', 'Confirm your new password...', 'new-password');
            const resetActions = document.createElement('div');
            resetActions.className = 'jx-modal-actions';
            const resetBtn = document.createElement('button');
            resetBtn.className = 'jx-btn jx-btn--primary';
            resetBtn.type = 'button';
            resetBtn.textContent = 'Update password';
            let isResettingPassword = false;
            resetBtn.addEventListener('click', async () => {
                if (isResettingPassword) return;
                resetError.style.display = 'none';
                resetSuccess.style.display = 'none';
                const currentPassword = currentPasswordField.input.value.trim();
                const newPassword = newPasswordField.input.value.trim();
                const confirmPassword = confirmPasswordField.input.value.trim();
                if (!currentPassword || !newPassword || !confirmPassword) {
                    resetError.textContent = 'All three password fields are required.';
                    resetError.style.display = '';
                    return;
                }
                if (newPassword.length > 30) {
                    resetError.textContent = 'New password must be 30 characters or fewer.';
                    resetError.style.display = '';
                    return;
                }
                if (newPassword !== confirmPassword) {
                    resetError.textContent = 'The new passwords do not match.';
                    resetError.style.display = '';
                    return;
                }
                isResettingPassword = true;
                resetBtn.disabled = true;
                resetBtn.textContent = 'Updating...';
                try {
                    const account = await getCurrentAccountRecord();
                    if (!account || account.password !== currentPassword) {
                        resetError.textContent = 'Current password is incorrect.';
                        resetError.style.display = '';
                    } else {
                        await JamexAccount.updatePassword(account.username, newPassword, account.email || JamexAccount.getemail());
                        resetSuccess.textContent = 'Password updated successfully.';
                        resetSuccess.style.display = '';
                        currentPasswordField.input.value = '';
                        newPasswordField.input.value = '';
                        confirmPasswordField.input.value = '';
                    }
                } catch (e) {
                    resetError.textContent = 'Could not update your password right now.';
                    resetError.style.display = '';
                }
                resetBtn.disabled = false;
                resetBtn.textContent = 'Update password';
                isResettingPassword = false;
            });
            resetActions.appendChild(resetBtn);
            [
                resetTitle,
                resetHint,
                currentPasswordField.label,
                currentPasswordField.input,
                newPasswordField.label,
                newPasswordField.input,
                confirmPasswordField.label,
                confirmPasswordField.input,
                resetError,
                resetSuccess,
                resetActions,
            ].forEach(node => resetCard.appendChild(node));

            const viewPasswordCard = document.createElement('div');
            viewPasswordCard.className = 'jx-settings-card';
            const viewPasswordTitle = document.createElement('h4');
            viewPasswordTitle.className = 'jx-settings-card-title';
            viewPasswordTitle.textContent = 'View your password';
            const viewPasswordHint = document.createElement('p');
            viewPasswordHint.className = 'jx-modal-hint';
            viewPasswordHint.textContent = 'Enter the recovery email linked to this account to reveal the current password.';
            const viewPasswordError = document.createElement('p');
            viewPasswordError.className = 'jx-modal-error';
            viewPasswordError.style.display = 'none';
            const viewPasswordReadout = buildReadout();
            const passwordEmailField = buildLabeledInput('jx-settings-password-email', 'Recovery email', 'email', 'Enter your linked email...', 'email');
            const viewPasswordActions = document.createElement('div');
            viewPasswordActions.className = 'jx-modal-actions';
            const viewPasswordBtn = document.createElement('button');
            viewPasswordBtn.className = 'jx-btn jx-btn--secondary';
            viewPasswordBtn.type = 'button';
            viewPasswordBtn.textContent = 'Show password';
            viewPasswordBtn.addEventListener('click', async () => {
                viewPasswordError.style.display = 'none';
                viewPasswordReadout.style.display = 'none';
                const enteredEmail = passwordEmailField.input.value.trim().toLowerCase();
                if (!JamexAccount.isValidEmail(enteredEmail)) {
                    viewPasswordError.textContent = 'Enter a valid email address.';
                    viewPasswordError.style.display = '';
                    return;
                }
                try {
                    const account = await getCurrentAccountRecord();
                    if (!account || !account.email || account.email.toLowerCase() !== enteredEmail) {
                        viewPasswordError.textContent = 'That email does not match this account.';
                        viewPasswordError.style.display = '';
                        return;
                    }
                    viewPasswordReadout.textContent = 'Current password: ' + (account.password || JamexAccount.getpassword() || 'Not available');
                    viewPasswordReadout.style.display = '';
                } catch (e) {
                    viewPasswordError.textContent = 'Could not verify that email right now.';
                    viewPasswordError.style.display = '';
                }
            });
            viewPasswordActions.appendChild(viewPasswordBtn);
            [
                viewPasswordTitle,
                viewPasswordHint,
                passwordEmailField.label,
                passwordEmailField.input,
                viewPasswordError,
                viewPasswordReadout,
                viewPasswordActions,
            ].forEach(node => viewPasswordCard.appendChild(node));

            const viewEmailCard = document.createElement('div');
            viewEmailCard.className = 'jx-settings-card';
            const viewEmailTitle = document.createElement('h4');
            viewEmailTitle.className = 'jx-settings-card-title';
            viewEmailTitle.textContent = 'View your email';
            const viewEmailHint = document.createElement('p');
            viewEmailHint.className = 'jx-modal-hint';
            viewEmailHint.textContent = 'Enter your current password to reveal the recovery email on file.';
            const viewEmailError = document.createElement('p');
            viewEmailError.className = 'jx-modal-error';
            viewEmailError.style.display = 'none';
            const viewEmailReadout = buildReadout();
            const emailPasswordField = buildLabeledInput('jx-settings-email-password', 'Current password', 'password', 'Enter your password...', 'current-password');
            const viewEmailActions = document.createElement('div');
            viewEmailActions.className = 'jx-modal-actions';
            const viewEmailBtn = document.createElement('button');
            viewEmailBtn.className = 'jx-btn jx-btn--secondary';
            viewEmailBtn.type = 'button';
            viewEmailBtn.textContent = 'Show email';
            viewEmailBtn.addEventListener('click', async () => {
                viewEmailError.style.display = 'none';
                viewEmailReadout.style.display = 'none';
                const enteredPassword = emailPasswordField.input.value.trim();
                if (!enteredPassword) {
                    viewEmailError.textContent = 'Enter your current password.';
                    viewEmailError.style.display = '';
                    return;
                }
                try {
                    const account = await getCurrentAccountRecord();
                    if (!account || account.password !== enteredPassword) {
                        viewEmailError.textContent = 'That password is incorrect.';
                        viewEmailError.style.display = '';
                        return;
                    }
                    viewEmailReadout.textContent = account.email
                        ? ('Recovery email: ' + account.email)
                        : 'No recovery email is linked to this account yet.';
                    viewEmailReadout.style.display = '';
                } catch (e) {
                    viewEmailError.textContent = 'Could not verify that password right now.';
                    viewEmailError.style.display = '';
                }
            });
            viewEmailActions.appendChild(viewEmailBtn);
            [
                viewEmailTitle,
                viewEmailHint,
                emailPasswordField.label,
                emailPasswordField.input,
                viewEmailError,
                viewEmailReadout,
                viewEmailActions,
            ].forEach(node => viewEmailCard.appendChild(node));

            accountSection.appendChild(resetCard);
            accountSection.appendChild(viewPasswordCard);
            accountSection.appendChild(viewEmailCard);
        } else {
            const signedOutCard = document.createElement('div');
            signedOutCard.className = 'jx-settings-card';
            const signedOutText = document.createElement('p');
            signedOutText.className = 'jx-modal-hint';
            signedOutText.textContent = 'Sign in with your Jamex Account to use password and email settings.';
            const signedOutActions = document.createElement('div');
            signedOutActions.className = 'jx-modal-actions';
            const signInBtn = document.createElement('button');
            signInBtn.className = 'jx-btn jx-btn--primary';
            signInBtn.type = 'button';
            signInBtn.textContent = 'Open sign in';
            signInBtn.addEventListener('click', () => {
                closeModal(overlay);
                openAccountModal(window._refreshAccountBtn);
            });
            signedOutActions.appendChild(signInBtn);
            signedOutCard.appendChild(signedOutText);
            signedOutCard.appendChild(signedOutActions);
            accountSection.appendChild(signedOutCard);
        }

        const appearanceSection = createPanel('appearance', 'Website background customisation', 'Pick a look for light mode and dark mode separately.');

        function createBackgroundCard(groupName, titleText, storageKey, options) {
            const card = document.createElement('div');
            card.className = 'jx-settings-card';
            const heading = document.createElement('h4');
            heading.className = 'jx-settings-card-title';
            heading.textContent = titleText;
            const group = document.createElement('div');
            group.className = 'jx-settings-choice-grid';
            const currentValue = storageKey === LIGHT_BG_KEY ? draftSettings.lightBg : draftSettings.darkBg;

            options.items.forEach(option => {
                const label = document.createElement('label');
                label.className = 'jx-settings-swatch-option';
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = groupName;
                input.value = option.value;
                input.checked = currentValue === option.value;
                input.addEventListener('change', () => {
                    draftSettings = normalizeAccountSettings({
                        ...draftSettings,
                        [storageKey === LIGHT_BG_KEY ? 'lightBg' : 'darkBg']: option.value,
                    });
                    applyDraftSettings();
                    updateDirtyState();
                });
                const swatch = document.createElement('span');
                swatch.className = 'jx-settings-swatch';
                swatch.style.backgroundColor = option.swatch;
                if (option.borderColor) swatch.style.borderColor = option.borderColor;
                const textWrap = document.createElement('div');
                const strong = document.createElement('strong');
                strong.textContent = option.label;
                const span = document.createElement('span');
                span.textContent = option.description;
                textWrap.appendChild(strong);
                textWrap.appendChild(span);
                label.appendChild(input);
                label.appendChild(swatch);
                label.appendChild(textWrap);
                group.appendChild(label);
            });

            card.appendChild(heading);
            card.appendChild(group);
            return card;
        }

        appearanceSection.appendChild(createBackgroundCard('jx-light-background', 'Light mode background', LIGHT_BG_KEY, {
            defaultValue: 'mint',
            items: [
                { value: 'mint', label: 'Minty Green', description: 'Default', swatch: '#ebfff4', borderColor: '#9ed6b6' },
                { value: 'white', label: 'Pure White', description: '', swatch: '#ffffff', borderColor: '#cfcfcf' },
            ],
        }));
        appearanceSection.appendChild(createBackgroundCard('jx-dark-background', 'Dark mode background', DARK_BG_KEY, {
            defaultValue: 'stone',
            items: [
                { value: 'stone', label: 'Stone Grey', description: 'Default', swatch: '#363636', borderColor: '#707070' },
                { value: 'black', label: 'Super Black', description: '', swatch: '#000000', borderColor: '#555555' },
            ],
        }));

        const automationsSection = createPanel('automations', 'Theme automations', 'Automatically open specific pages in a chosen theme. You can still switch manually after the page loads.');

        const automationCard = document.createElement('div');
        automationCard.className = 'jx-settings-card';
        const automationTitle = document.createElement('h4');
        automationTitle.className = 'jx-settings-card-title';
        automationTitle.textContent = 'Page theme rules';
        const automationHint = document.createElement('p');
        automationHint.className = 'jx-modal-hint';
        automationHint.textContent = 'Create one or more rules like "Open Games in dark mode".';
        const automationList = document.createElement('div');
        automationList.className = 'jx-settings-automation-list';
        const automationEmpty = document.createElement('p');
        automationEmpty.className = 'jx-modal-hint';
        automationEmpty.textContent = 'No page theme automations yet.';
        const automationActions = document.createElement('div');
        automationActions.className = 'jx-modal-actions';
        const addAutomationBtn = document.createElement('button');
        addAutomationBtn.className = 'jx-btn jx-btn--secondary';
        addAutomationBtn.type = 'button';
        addAutomationBtn.textContent = 'Add automation';

        const createAutomationSelect = (items, value) => {
            const select = document.createElement('select');
            select.className = 'jx-settings-automation-select';
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.label;
                if (item.value === value) option.selected = true;
                select.appendChild(option);
            });
            return select;
        };

        const syncPageAutomationState = () => {
            const nextAutomations = {};
            automationList.querySelectorAll('.jx-settings-automation-row').forEach(row => {
                const pageValue = row.querySelector('[data-role="page"]').value;
                const themeValue = row.querySelector('[data-role="theme"]').value;
                if (pageValue && (themeValue === 'dark' || themeValue === 'light')) {
                    nextAutomations[pageValue] = themeValue;
                }
            });
            draftSettings = normalizeAccountSettings({
                ...draftSettings,
                pageThemeAutomations: nextAutomations,
            });
            if (!draftSettings.pageThemeAutomations[SETTINGS_THEME_PAGE]) {
                draftThemeAutomationSuppressed = false;
            }
            applyDraftSettings();
            automationEmpty.style.display = automationList.children.length ? 'none' : '';
            updateDirtyState();
        };

        const addAutomationRow = (pageValue, themeValue) => {
            const row = document.createElement('div');
            row.className = 'jx-settings-automation-row';

            const openLabel = document.createElement('span');
            openLabel.className = 'jx-settings-automation-copy';
            openLabel.textContent = 'Open';

            const pageSelect = createAutomationSelect(PAGE_THEME_AUTOMATION_PAGES, pageValue || 'games.html');
            pageSelect.dataset.role = 'page';

            const inLabel = document.createElement('span');
            inLabel.className = 'jx-settings-automation-copy';
            inLabel.textContent = 'in';

            const themeSelect = createAutomationSelect([
                { value: 'light', label: 'light mode' },
                { value: 'dark', label: 'dark mode' },
            ], themeValue || 'dark');
            themeSelect.dataset.role = 'theme';

            const removeBtn = document.createElement('button');
            removeBtn.className = 'jx-btn jx-btn--secondary jx-settings-automation-remove';
            removeBtn.type = 'button';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => {
                row.remove();
                syncPageAutomationState();
            });

            pageSelect.addEventListener('change', syncPageAutomationState);
            themeSelect.addEventListener('change', syncPageAutomationState);

            row.appendChild(openLabel);
            row.appendChild(pageSelect);
            row.appendChild(inLabel);
            row.appendChild(themeSelect);
            row.appendChild(removeBtn);
            automationList.appendChild(row);
            syncPageAutomationState();
        };

        addAutomationBtn.addEventListener('click', () => addAutomationRow());

        const savedAutomations = draftSettings.pageThemeAutomations;
        const savedAutomationEntries = Object.entries(savedAutomations)
            .filter(entry => entry[1] === 'dark' || entry[1] === 'light');

        if (savedAutomationEntries.length) {
            savedAutomationEntries.forEach(([pageValue, themeValue]) => addAutomationRow(pageValue, themeValue));
        } else {
            syncPageAutomationState();
        }

        automationActions.appendChild(addAutomationBtn);
        automationCard.appendChild(automationTitle);
        automationCard.appendChild(automationHint);
        automationCard.appendChild(automationList);
        automationCard.appendChild(automationEmpty);
        automationCard.appendChild(automationActions);
        automationsSection.appendChild(automationCard);

        updateToggleLabel();
        settingsThemeBtn.textContent = themeToggle ? themeToggle.textContent : '🌓';
        updateDirtyState();

        activateTab(initialTab || 'appearance');

        layout.appendChild(sidebar);
        layout.appendChild(content);
        page.appendChild(topbar);
        page.appendChild(layout);

        function escHandler(e) {
            if (e.key === 'Escape') {
                closeModal(overlay);
                document.removeEventListener('keydown', escHandler);
            }
        }
        document.addEventListener('keydown', escHandler);

        overlay.appendChild(page);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
            const firstFocusable = page.querySelector('.jx-settings-back, .jx-settings-tab, .jx-modal-input, input[type="radio"], .jx-btn');
            if (firstFocusable) firstFocusable.focus();
        });
    }

    // =========================================================================
    // =========================================================================
    // --- Supabase config ---
    // Fill in your project URL and anon key from supabase.com -> Project Settings -> API
    // =========================================================================
    const SUPABASE_URL = 'https://yborszrpgpkguawsbazs.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3JzenJwZ3BrZ3Vhd3NiYXpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTU5MjUsImV4cCI6MjA5MDk5MTkyNX0.S2M_zKUIYj3Id8aQCYNxPLVxfDeUIHDz9J-7V05DiL8';

    // Minimal Supabase REST helper — no SDK needed
    async function sbFetch(path, options) {
        const headers = {
            'apikey':        SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type':  'application/json',
        };
        if (options && options.prefer) headers['Prefer'] = options.prefer;
        const fetchOptions = { headers };
        if (options && options.method) fetchOptions.method = options.method;
        if (options && options.body)   fetchOptions.body   = options.body;
        const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, fetchOptions);
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error('Supabase error ' + res.status + ': ' + body);
        }
        // 204 No Content has no body
        if (res.status === 204) return null;
        // Handle empty body (from prefer=return=minimal or other reasons)
        const contentLength = res.headers.get('content-length');
        if (contentLength === '0' || contentLength === null) {
            const text = await res.text();
            if (!text) return null;
            return JSON.parse(text);
        }
        return res.json();
    }

    refreshSignedInAccountSettings();
    window.addEventListener('focus', refreshSignedInAccountSettings);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshSignedInAccountSettings();
    });

    // =========================================================================
    // --- Likes & Comments (Supabase-backed, shared across all devices) ---
    //
    // Tables:
    //   likes    (article_id text, password text, PRIMARY KEY (article_id, password))
    //   comments (id bigint PK, article_id text, password text, username text, text text, ts bigint)
    //
    // 'password' is the private key used for ownership checks — never displayed.
    // 'username' is shown publicly on comments.
    // =========================================================================

    const INTERACTION_SELECTORS = ['.news-entry', '.changelog-entry'];

    function formatTimestamp(ts) {
        const d = new Date(ts);
        return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) +
               ' at ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    }

    // Fetch likes for one article -> array of password strings
    async function getLikes(articleId) {
        try {
            const rows = await sbFetch('likes?article_id=eq.' + encodeURIComponent(articleId) + '&select=password');
            return (rows || []).map(r => r.password);
        } catch (e) { console.warn('getLikes:', e); return []; }
    }

    // Fetch comments for one article -> array of {id, password, username, text, ts}
    async function getComments(articleId) {
        try {
            const rows = await sbFetch('comments?article_id=eq.' + encodeURIComponent(articleId) + '&order=ts.asc&select=id,password,username,text,ts');
            return rows || [];
        } catch (e) { console.warn('getComments:', e); return []; }
    }

    // Toggle like: insert if not liked, delete if already liked
    async function toggleLike(articleId, password, shouldLike) {
        if (shouldLike) {
            // Like
            try {
                await sbFetch('likes', {
                    method: 'POST',
                    prefer: 'return=minimal',
                    body: JSON.stringify({ article_id: articleId, password: password }),
                });
            } catch (e) {
                // 409 Conflict means the like already exists — that's fine, we wanted it to exist
                if (e.message.includes('409')) {
                    return;
                }
                throw e;
            }
        } else {
            // Unlike
            await sbFetch(
                'likes?article_id=eq.' + encodeURIComponent(articleId) + '&password=eq.' + encodeURIComponent(password),
                { method: 'DELETE' }
            );
        }
    }

    // Insert a comment
    async function postComment(articleId, password, username, text) {
        await sbFetch('comments', {
            method: 'POST',
            prefer: 'return=minimal',
            body: JSON.stringify({
                article_id: articleId,
                password:   password,
                username:   username,
                text:       text,
                ts:         Date.now(),
            }),
        });
    }

    // Delete a comment by id (only called after ownership is verified client-side)
    async function deleteComment(commentId) {
        await sbFetch('comments?id=eq.' + commentId, { method: 'DELETE' });
    }

    // Fetch all likes/comments for the current user (used by activity view)
    async function getUserActivity(password) {
        try {
            const [likeRows, commentRows] = await Promise.all([
                sbFetch('likes?password=eq.'    + encodeURIComponent(password) + '&select=article_id'),
                sbFetch('comments?password=eq.' + encodeURIComponent(password) + '&order=ts.desc&select=id,article_id,text,ts'),
            ]);
            return {
                likedArticles: (likeRows    || []).map(r => r.article_id),
                userComments:  (commentRows || []),
            };
        } catch (e) { console.warn('getUserActivity:', e); return { likedArticles: [], userComments: [] }; }
    }

    // ── buildInteractionBar ──
    // Async: fetches likes + comments from Supabase then builds the UI.
    // Shows a loading state while fetching.
    async function buildInteractionBar(article) {
        const id = article.id;
        if (!id) return;

        // Prevent concurrent builds for the same article racing each other
        if (article._jxBuilding) return;
        article._jxBuilding = true;

        // Remove old UI
        const oldBar     = article.querySelector('.jx-interaction-bar');
        const oldSection = article.querySelector('.jx-comments-section');
        if (oldBar)     oldBar.remove();
        if (oldSection) oldSection.remove();

        const password = JamexAccount.getpassword();
        const username = JamexAccount.getusername();

        // Show a minimal loading bar while we fetch
        const loadingBar = document.createElement('div');
        loadingBar.className = 'jx-interaction-bar jx-interaction-bar--loading';
        loadingBar.textContent = 'Loading...';
        article.appendChild(loadingBar);

        // Fetch in parallel
        let likes, comments;
        try {
            [likes, comments] = await Promise.all([getLikes(id), getComments(id)]);
        } catch (e) {
            loadingBar.textContent = 'Could not load interactions.';
            article._jxBuilding = false;
            return;
        }
        loadingBar.remove();

        const userLiked = password ? likes.includes(password) : false;

        // -- Interaction bar --
        const bar = document.createElement('div');
        bar.className = 'jx-interaction-bar';

        // Like button
        const likeBtn = document.createElement('button');
        likeBtn.className = 'jx-like-btn' + (userLiked ? ' jx-like-btn--active' : '');
        likeBtn.setAttribute('aria-label', userLiked ? 'Unlike' : 'Like this article');
        likeBtn.setAttribute('title',      userLiked ? 'Unlike' : 'Like');

        const likeIcon = document.createElement('span');
        likeIcon.className = 'jx-like-icon';
        likeIcon.textContent = String.fromCodePoint(0x2764, 0xFE0F);

        const likeCount = document.createElement('span');
        likeCount.className = 'jx-like-count';
        likeCount.textContent = String(likes.length);

        likeBtn.appendChild(likeIcon);
        likeBtn.appendChild(document.createTextNode(' '));
        likeBtn.appendChild(likeCount);

        likeBtn.addEventListener('click', async () => {
            const pswd = JamexAccount.getpassword();
            if (!pswd) {
                openAccountModal(() => {
                    if (window._refreshAccountBtn) window._refreshAccountBtn();
                    buildInteractionBar(article);
                });
                return;
            }
            // Optimistic UI update
            const wasLiked = likeBtn.classList.contains('jx-like-btn--active');
            const shouldLike = !wasLiked; // Opposite of current state
            likeBtn.classList.toggle('jx-like-btn--active');
            likeCount.textContent = String(parseInt(likeCount.textContent) + (wasLiked ? -1 : 1));
            likeBtn.disabled = true;
            try {
                await toggleLike(id, pswd, shouldLike);
                // Re-fetch likes to ensure UI stays in sync with DB
                const freshLikes = await getLikes(id);
                const freshUserLiked = freshLikes.includes(pswd);
                likeBtn.classList.toggle('jx-like-btn--active', freshUserLiked);
                likeCount.textContent = String(freshLikes.length);
            } catch (e) {
                console.error('Like toggle failed:', e);
                // Revert on failure
                likeBtn.classList.toggle('jx-like-btn--active');
                likeCount.textContent = String(parseInt(likeCount.textContent) + (wasLiked ? 1 : -1));
            }
            likeBtn.disabled = false;
        });

        // Comment toggle button
        const commentToggle = document.createElement('button');
        commentToggle.className = 'jx-comment-toggle-btn';
        const commentCount = comments.length;
        commentToggle.textContent = String.fromCodePoint(0x1F4AC) + ' ' + commentCount + ' comment' + (commentCount !== 1 ? 's' : '');

        bar.appendChild(likeBtn);
        bar.appendChild(commentToggle);
        article.appendChild(bar);

        // -- Comments section (initially hidden) --
        const commentSection = document.createElement('div');
        commentSection.className = 'jx-comments-section';
        commentSection.style.display = 'none';

        const commentList = document.createElement('div');
        commentList.className = 'jx-comment-list';

        function renderCommentList() {
            commentList.innerHTML = '';
            if (comments.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'jx-no-comments';
                empty.textContent = 'No comments yet. Be the first!';
                commentList.appendChild(empty);
            } else {
                comments.forEach(c => {
                    const item = document.createElement('div');
                    item.className = 'jx-comment-item';

                    const meta = document.createElement('div');
                    meta.className = 'jx-comment-meta';

                    const nameEl = document.createElement('span');
                    nameEl.className = 'jx-comment-username';
                    nameEl.textContent = c.username || c.password;

                    const timeEl = document.createElement('span');
                    timeEl.className = 'jx-comment-time';
                    timeEl.textContent = formatTimestamp(c.ts);

                    meta.appendChild(nameEl);
                    meta.appendChild(timeEl);

                    const textEl = document.createElement('p');
                    textEl.className = 'jx-comment-text';
                    textEl.textContent = c.text;

                    item.appendChild(meta);
                    item.appendChild(textEl);

                    // Delete button — only for the comment's author
                    if (password && password === c.password) {
                        const delBtn = document.createElement('button');
                        delBtn.className = 'jx-comment-delete';
                        delBtn.textContent = 'Delete';
                        delBtn.setAttribute('aria-label', 'Delete this comment');
                        delBtn.addEventListener('click', async () => {
                            delBtn.disabled = true;
                            try {
                                await deleteComment(c.id);
                                comments = comments.filter(x => x.id !== c.id);
                                renderCommentList();
                                // Update toggle button count
                                commentToggle.textContent = String.fromCodePoint(0x1F4AC) + ' ' + comments.length + ' comment' + (comments.length !== 1 ? 's' : '');
                            } catch (e) {
                                delBtn.disabled = false;
                            }
                        });
                        item.appendChild(delBtn);
                    }

                    commentList.appendChild(item);
                });
            }
        }
        renderCommentList();

        // Comment form
        const formWrap = document.createElement('div');
        formWrap.className = 'jx-comment-form';

        if (!password) {
            const prompt = document.createElement('p');
            prompt.className = 'jx-comment-signin-prompt';
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = 'Sign in';
            link.addEventListener('click', e => {
                e.preventDefault();
                openAccountModal(() => {
                    if (window._refreshAccountBtn) window._refreshAccountBtn();
                    buildInteractionBar(article);
                    article.querySelector('.jx-comments-section').style.display = '';
                });
            });
            prompt.appendChild(link);
            prompt.appendChild(document.createTextNode(' to join the conversation.'));
            formWrap.appendChild(prompt);
        } else {
            const commentInput = document.createElement('textarea');
            commentInput.className = 'jx-comment-input';
            commentInput.placeholder = 'Add a comment as ' + username + '...';
            commentInput.rows = 2;
            commentInput.maxLength = 500;

            const submitBtn = document.createElement('button');
            submitBtn.className = 'jx-btn jx-btn--primary jx-comment-submit';
            submitBtn.textContent = 'Post';

            const doPost = async () => {
                const text = commentInput.value.trim();
                if (!text) return;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Posting...';
                try {
                    await postComment(id, password, username, text);
                    commentInput.value = '';
                    // Add the new comment to the local list immediately so the UI
                    // updates without needing a re-fetch (avoids a race condition
                    // where the re-fetch response is misread as an error).
                    comments.push({
                        id: null,
                        article_id: id,
                        password: password,
                        username: username,
                        text: text,
                        ts: Date.now(),
                    });
                    renderCommentList();
                    commentToggle.textContent = String.fromCodePoint(0x1F4AC) + ' ' + comments.length + ' comment' + (comments.length !== 1 ? 's' : '');
                    // Re-fetch in the background to get the real DB id (needed for delete)
                    getComments(id).then(fresh => {
                        comments = fresh;
                        renderCommentList();
                    }).catch(() => {});
                } catch (e) {
                    console.warn('postComment failed:', e);
                    alert('Could not post comment. Please try again.');
                }
                submitBtn.disabled = false;
                submitBtn.textContent = 'Post';
            };

            submitBtn.addEventListener('click', doPost);
            commentInput.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doPost(); }
            });

            formWrap.appendChild(commentInput);
            formWrap.appendChild(submitBtn);
        }

        commentSection.appendChild(commentList);
        commentSection.appendChild(formWrap);
        article.appendChild(commentSection);

        commentToggle.addEventListener('click', () => {
            const isOpen = commentSection.style.display !== 'none';
            commentSection.style.display = isOpen ? 'none' : '';
        });

        article._jxBuilding = false;
    }

    function initInteractionBars() {
        const articles = document.querySelectorAll(INTERACTION_SELECTORS.join(', '));
        setTimeout(() => {
            articles.forEach(article => {
                if (article.id) buildInteractionBar(article);
            });
        }, 0);
    }

    function refreshAllInteractionUIs() {
        const articles = document.querySelectorAll(INTERACTION_SELECTORS.join(', '));
        articles.forEach(article => {
            if (article.id) buildInteractionBar(article);
        });
        if (window._refreshAccountBtn) window._refreshAccountBtn();
    }

    function upgradeFooterStripes() {
        const footer = document.querySelector('footer');
        if (!footer || footer.querySelector('.footer-stripe')) return;

        const existingContent = footer.innerHTML.trim();
        footer.innerHTML = '';

        const stripeClasses = [
            'footer-stripe footer-stripe-green',
            'footer-stripe footer-stripe-yellow',
            'footer-stripe footer-stripe-orange',
            'footer-stripe footer-stripe-red'
        ];

        stripeClasses.forEach((className, index) => {
            const stripe = document.createElement('div');
            stripe.className = className;

            if (index === stripeClasses.length - 1) {
                stripe.innerHTML = existingContent;
            }

            footer.appendChild(stripe);
        });
    }

    // Expose getUserActivity for the account modal's activity view
    window._getUserActivity = getUserActivity;

    upgradeFooterStripes();
    initInteractionBars();

})();
