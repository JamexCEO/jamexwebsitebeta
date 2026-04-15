(function() {
    const SUPABASE_URL = 'https://yborszrpgpkguawsbazs.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlib3JzenJwZ3BrZ3Vhd3NiYXpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTU5MjUsImV4cCI6MjA5MDk5MTkyNX0.S2M_zKUIYj3Id8aQCYNxPLVxfDeUIHDz9J-7V05DiL8';
    const SCORE_LOCAL_KEY = 'jamex-game-scores-v1';
    const SCORE_REFRESH_MS = 15000;
    let activeGame = null;
    let knownUsername = null;
    let lastHydrateAt = 0;

    function getAccountUsername() {
        return window.JamexAccount && window.JamexAccount.getusername ? window.JamexAccount.getusername() : null;
    }

    function isLoggedIn() {
        return !!getAccountUsername();
    }

    function setActiveGame(game) {
        activeGame = game;
        document.querySelectorAll('.game-panel').forEach(panel => {
            panel.classList.toggle('game-panel-active', panel.id === game);
        });
    }

    function bindPanelActivation(panelId, gameKey) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        ['click', 'pointerenter', 'focusin', 'touchstart'].forEach(eventName => {
            panel.addEventListener(eventName, () => setActiveGame(gameKey), { passive: true });
        });
    }

    function promptSignIn() {
        const accountButton = document.getElementById('account-btn');
        if (accountButton) {
            accountButton.click();
            return true;
        }
        return false;
    }

    async function sbFetch(path, options) {
        const headers = {
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        };
        if (options && options.prefer) headers.Prefer = options.prefer;

        const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
            method: options && options.method ? options.method : 'GET',
            headers: headers,
            body: options && options.body ? options.body : undefined,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error('Supabase error ' + response.status + ': ' + text);
        }
        if (response.status === 204) return null;
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    }

    function readLocalScores() {
        try {
            const raw = localStorage.getItem(SCORE_LOCAL_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (error) {
            console.warn('Could not read local game scores:', error);
            return {};
        }
    }

    function writeLocalScores(data) {
        localStorage.setItem(SCORE_LOCAL_KEY, JSON.stringify(data));
    }

    const ScoreStore = {
        cache: readLocalScores(),
        remoteAvailable: true,

        getBest(game) {
            const username = getAccountUsername();
            if (!username) return 0;
            return (((this.cache || {})[username] || {})[game] || 0);
        },

        async fetchRemoteRows(username, game) {
            if (!username || !this.remoteAvailable) return [];
            const filter = game
                ? 'game_scores?username=eq.' + encodeURIComponent(username) + '&game=eq.' + encodeURIComponent(game) + '&select=game,score'
                : 'game_scores?username=eq.' + encodeURIComponent(username) + '&select=game,score';
            const rows = await sbFetch(filter);
            return Array.isArray(rows) ? rows : [];
        },

        async hydrate() {
            const username = getAccountUsername();
            if (!username || !this.remoteAvailable) {
                updateAllScoreHints();
                return;
            }

            try {
                const rows = await this.fetchRemoteRows(username);
                if (!this.cache[username]) this.cache[username] = {};
                rows.forEach(row => {
                    this.cache[username][row.game] = Math.max(this.cache[username][row.game] || 0, Number(row.score) || 0);
                });
                writeLocalScores(this.cache);
            } catch (error) {
                this.remoteAvailable = false;
                console.warn('Remote game score table unavailable, using browser storage only:', error);
            }

            updateAllScoreHints();
        },

        async save(game, score) {
            const username = getAccountUsername();
            if (!username) {
                return { ok: false, reason: 'signin' };
            }

            const numericScore = Math.max(0, Math.floor(Number(score) || 0));
            if (!this.cache[username]) this.cache[username] = {};
            const previousBest = this.cache[username][game] || 0;
            let remoteBest = 0;
            let remoteRows = [];

            if (this.remoteAvailable) {
                try {
                    remoteRows = await this.fetchRemoteRows(username, game);
                    remoteBest = remoteRows.reduce((max, row) => Math.max(max, Number(row.score) || 0), 0);
                } catch (error) {
                    this.remoteAvailable = false;
                    console.warn('Could not read remote game score, keeping local copy:', error);
                }
            }

            const best = Math.max(previousBest, remoteBest, numericScore);
            this.cache[username][game] = best;
            writeLocalScores(this.cache);

            if (this.remoteAvailable) {
                try {
                    if (remoteRows.length > 0) {
                        await sbFetch(
                            'game_scores?username=eq.' + encodeURIComponent(username) + '&game=eq.' + encodeURIComponent(game),
                            {
                                method: 'PATCH',
                                prefer: 'return=minimal',
                                body: JSON.stringify({ score: best }),
                            }
                        );
                    } else {
                        await sbFetch('game_scores', {
                            method: 'POST',
                            prefer: 'return=minimal',
                            body: JSON.stringify({
                                username: username,
                                game: game,
                                score: best,
                            }),
                        });
                    }
                } catch (error) {
                    this.remoteAvailable = false;
                    console.warn('Could not save game score remotely, keeping local copy:', error);
                }
            }

            updateBestScore(game, best);
            updateAllScoreHints();
            return { ok: true, best: best };
        },
    };

    function updateBestScore(game, score) {
        document.querySelectorAll('[data-scoreboard="' + game + '"] [data-best-score]').forEach(node => {
            node.textContent = String(score);
            pulseNode(node, 'score-pop');
        });
    }

    function updateCurrentScore(game, score) {
        document.querySelectorAll('[data-scoreboard="' + game + '"] [data-current-score]').forEach(node => {
            node.textContent = String(Math.max(0, Math.floor(score)));
            pulseNode(node, 'score-pop');
        });
    }

    function pulseNode(node, className) {
        if (!node) return;
        node.classList.remove(className);
        void node.offsetWidth;
        node.classList.add(className);
    }

    function flashStatus(node) {
        pulseNode(node, 'status-flash');
    }

    function flashTetrisCanvas(node, className) {
        pulseNode(node, className);
    }

    function setPausedOverlay(shellId, paused) {
        const shell = document.getElementById(shellId);
        if (!shell) return;
        shell.classList.toggle('paused', paused);
    }

    function initArcadeReveal() {
        const items = document.querySelectorAll('.game-card, .game-panel');
        items.forEach((item, index) => {
            item.style.setProperty('--arcade-delay', String(index * 70) + 'ms');
        });

        if (!('IntersectionObserver' in window)) {
            items.forEach(item => item.classList.add('arcade-in-view'));
            return;
        }

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('arcade-in-view');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        items.forEach(item => observer.observe(item));
    }

    function updateAllScoreHints() {
        const username = getAccountUsername();
        document.querySelectorAll('.score-panel').forEach(panel => {
            const game = panel.getAttribute('data-scoreboard');
            const hint = panel.querySelector('[data-save-hint]');
            const best = panel.querySelector('[data-best-score]');
            if (best) best.textContent = String(ScoreStore.getBest(game));
            if (!hint) return;

            if (username) {
                hint.textContent = ScoreStore.remoteAvailable
                    ? 'Signed in as ' + username + '. Your best score can be saved.'
                    : 'Signed in as ' + username + '. Scores are saving in this browser.';
            } else {
                hint.textContent = 'Sign in to save your best score.';
            }
        });
    }

    async function maybeHydrateScores(force) {
        const username = getAccountUsername();
        if (!username || !ScoreStore.remoteAvailable) return;
        const now = Date.now();
        if (!force && now - lastHydrateAt < SCORE_REFRESH_MS) return;
        lastHydrateAt = now;
        await ScoreStore.hydrate();
    }

    function syncAccountState(forceHydrate) {
        const username = getAccountUsername();
        const changed = username !== knownUsername;
        if (changed) {
            knownUsername = username;
            lastHydrateAt = 0;
            ScoreStore.cache = readLocalScores();
            updateAllScoreHints();
        }
        if (username) {
            maybeHydrateScores(Boolean(forceHydrate || changed)).catch(error => {
                console.warn('Score hydrate failed:', error);
            });
        } else if (changed) {
            updateAllScoreHints();
        }
    }

    function wireManualSave(buttonId, game, getScore, statusId, panelId) {
        const button = document.getElementById(buttonId);
        const status = document.getElementById(statusId);
        if (!button) return;

        button.addEventListener('click', async () => {
            if (panelId) setActiveGame(panelId);
            if (!isLoggedIn()) {
                if (status) status.textContent = 'Sign in first, then save your ' + game + ' score.';
                if (status) flashStatus(status);
                promptSignIn();
                return;
            }

            const result = await ScoreStore.save(game, getScore());
            if (status) {
                status.textContent = result.ok
                    ? 'High score saved at ' + result.best + '.'
                    : 'Could not save score yet.';
                flashStatus(status);
            }
        });
    }

    window.addEventListener('storage', event => {
        if (event.key === 'jamex-username' || event.key === SCORE_LOCAL_KEY) {
            ScoreStore.cache = readLocalScores();
            syncAccountState(true);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) syncAccountState(true);
    });
    window.addEventListener('focus', () => syncAccountState(true));
    setInterval(() => syncAccountState(false), SCORE_REFRESH_MS);

    function initSnake() {
        const canvas = document.getElementById('snake-canvas');
        const context = canvas.getContext('2d');
        const status = document.getElementById('snake-status');
        const startButton = document.getElementById('snake-start-btn');
        const pauseButton = document.getElementById('snake-pause-btn');
        const tileSize = 20;
        const gridSize = canvas.width / tileSize;
        let loopId = null;
        let score = 0;
        let pendingDirection = { x: 1, y: 0 };
        let direction = { x: 1, y: 0 };
        let snake = [];
        let food = null;
        let running = false;
        let paused = false;

        function randomFood() {
            let nextFood = null;
            while (!nextFood || snake.some(part => part.x === nextFood.x && part.y === nextFood.y)) {
                nextFood = {
                    x: Math.floor(Math.random() * gridSize),
                    y: Math.floor(Math.random() * gridSize),
                };
            }
            return nextFood;
        }

        function setScore(nextScore) {
            score = nextScore;
            updateCurrentScore('snake', score);
        }

        function draw() {
            context.fillStyle = '#111827';
            context.fillRect(0, 0, canvas.width, canvas.height);

            context.strokeStyle = 'rgba(255,255,255,0.08)';
            for (let i = 0; i <= gridSize; i++) {
                context.beginPath();
                context.moveTo(i * tileSize, 0);
                context.lineTo(i * tileSize, canvas.height);
                context.stroke();
                context.beginPath();
                context.moveTo(0, i * tileSize);
                context.lineTo(canvas.width, i * tileSize);
                context.stroke();
            }

            context.fillStyle = '#ef4444';
            context.beginPath();
            context.arc(food.x * tileSize + tileSize / 2, food.y * tileSize + tileSize / 2, tileSize / 2.4, 0, Math.PI * 2);
            context.fill();

            snake.forEach((segment, index) => {
                context.fillStyle = index === 0 ? '#22c55e' : '#86efac';
                context.fillRect(segment.x * tileSize + 2, segment.y * tileSize + 2, tileSize - 4, tileSize - 4);
            });
        }

        async function finishSnake(message) {
            running = false;
            paused = false;
            clearInterval(loopId);
            loopId = null;
            setPausedOverlay('snake-shell', false);
            pauseButton.textContent = 'Pause Snake';
            status.textContent = message + ' Final score: ' + score + '.';
            flashStatus(status);
            if (score > ScoreStore.getBest('snake')) {
                await ScoreStore.save('snake', score);
                status.textContent += isLoggedIn() ? ' New high score saved.' : ' Sign in to save that high score.';
                flashStatus(status);
            }
        }

        function resetSnake() {
            snake = [
                { x: 8, y: 9 },
                { x: 7, y: 9 },
                { x: 6, y: 9 },
            ];
            direction = { x: 1, y: 0 };
            pendingDirection = { x: 1, y: 0 };
            food = randomFood();
            setScore(0);
            draw();
        }

        async function tick() {
            if (paused || !running) return;
            direction = pendingDirection;
            const head = {
                x: snake[0].x + direction.x,
                y: snake[0].y + direction.y,
            };

            const hitWall = head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize;
            const hitSelf = snake.some(segment => segment.x === head.x && segment.y === head.y);
            if (hitWall || hitSelf) {
                await finishSnake('Game over.');
                return;
            }

            snake.unshift(head);
            if (head.x === food.x && head.y === food.y) {
                setScore(score + 10);
                food = randomFood();
            } else {
                snake.pop();
            }

            draw();
        }

        function startSnake() {
            setActiveGame('snake-section');
            clearInterval(loopId);
            resetSnake();
            running = true;
            paused = false;
            setPausedOverlay('snake-shell', false);
            pauseButton.textContent = 'Pause Snake';
            status.textContent = 'Snake is live. Use the arrow keys.';
            flashStatus(status);
            loopId = setInterval(() => {
                tick().catch(error => {
                    console.error('Snake tick failed:', error);
                });
            }, 140);
        }

        function turn(next) {
            if (!running || paused || activeGame !== 'snake-section') return;
            if (next.x !== 0 && direction.x === -next.x) return;
            if (next.y !== 0 && direction.y === -next.y) return;
            pendingDirection = next;
        }

        function togglePause() {
            setActiveGame('snake-section');
            if (!running) {
                status.textContent = 'Start Snake before pausing.';
                flashStatus(status);
                return;
            }

            paused = !paused;
            setPausedOverlay('snake-shell', paused);
            pauseButton.textContent = paused ? 'Resume Snake' : 'Pause Snake';
            status.textContent = paused ? 'Snake paused.' : 'Snake resumed.';
            flashStatus(status);
        }

        document.addEventListener('keydown', event => {
            if (activeGame !== 'snake-section') return;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'p', 'P'].includes(event.key)) event.preventDefault();
            if (event.key === 'ArrowUp') turn({ x: 0, y: -1 });
            if (event.key === 'ArrowDown') turn({ x: 0, y: 1 });
            if (event.key === 'ArrowLeft') turn({ x: -1, y: 0 });
            if (event.key === 'ArrowRight') turn({ x: 1, y: 0 });
            if (event.key === 'p' || event.key === 'P') togglePause();
        });

        document.querySelectorAll('[data-touch-controls="snake"] button').forEach(button => {
            button.addEventListener('click', () => {
                setActiveGame('snake-section');
                const dir = button.getAttribute('data-dir');
                if (dir === 'up') turn({ x: 0, y: -1 });
                if (dir === 'down') turn({ x: 0, y: 1 });
                if (dir === 'left') turn({ x: -1, y: 0 });
                if (dir === 'right') turn({ x: 1, y: 0 });
            });
        });

        startButton.addEventListener('click', startSnake);
        pauseButton.addEventListener('click', togglePause);
        wireManualSave('snake-save-btn', 'snake', () => score, 'snake-status', 'snake-section');
        resetSnake();
    }

    function initMinesweeper() {
        const width = 9;
        const height = 9;
        const mineCount = 10;
        const board = document.getElementById('minesweeper-board');
        const status = document.getElementById('minesweeper-status');
        const timerNode = document.getElementById('minesweeper-timer');
        const minesLeftNode = document.getElementById('minesweeper-mines-left');
        const resetButton = document.getElementById('minesweeper-reset-btn');
        const pauseButton = document.getElementById('minesweeper-pause-btn');
        let timerId = null;
        let startedAt = 0;
        let elapsedBeforePause = 0;
        let flagsPlaced = 0;
        let revealedSafe = 0;
        let score = 0;
        let gameOver = false;
        let paused = false;
        let cells = [];

        function updateScore(nextScore) {
            score = Math.max(0, Math.floor(nextScore));
            updateCurrentScore('minesweeper', score);
        }

        function stopTimer() {
            if (timerId && startedAt) {
                elapsedBeforePause += Date.now() - startedAt;
            }
            clearInterval(timerId);
            timerId = null;
            startedAt = 0;
        }

        function startTimer() {
            if (timerId || paused || gameOver) return;
            startedAt = Date.now();
            timerId = setInterval(() => {
                timerNode.textContent = String(Math.floor((elapsedBeforePause + (Date.now() - startedAt)) / 1000));
            }, 250);
        }

        function neighbours(x, y) {
            const list = [];
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        list.push(cells[ny * width + nx]);
                    }
                }
            }
            return list;
        }

        function buildBoard() {
            setActiveGame('minesweeper-section');
            stopTimer();
            board.innerHTML = '';
            board.style.gridTemplateColumns = 'repeat(' + width + ', 1fr)';
            cells = [];
            flagsPlaced = 0;
            revealedSafe = 0;
            gameOver = false;
            paused = false;
            elapsedBeforePause = 0;
            timerNode.textContent = '0';
            minesLeftNode.textContent = String(mineCount);
            updateScore(0);
            setPausedOverlay('minesweeper-shell', false);
            pauseButton.textContent = 'Pause Minesweeper';

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const button = document.createElement('button');
                    button.className = 'mine-cell';
                    button.type = 'button';
                    const cell = {
                        x: x,
                        y: y,
                        element: button,
                        isMine: false,
                        isRevealed: false,
                        isFlagged: false,
                        adjacent: 0,
                    };
                    button.addEventListener('click', () => reveal(cell));
                    button.addEventListener('contextmenu', event => {
                        event.preventDefault();
                        toggleFlag(cell);
                    });
                    cells.push(cell);
                    board.appendChild(button);
                }
            }

            let placed = 0;
            while (placed < mineCount) {
                const randomCell = cells[Math.floor(Math.random() * cells.length)];
                if (!randomCell.isMine) {
                    randomCell.isMine = true;
                    placed++;
                }
            }

            cells.forEach(cell => {
                cell.adjacent = neighbours(cell.x, cell.y).filter(other => other.isMine).length;
            });

            status.textContent = 'Clear all safe squares to win.';
            flashStatus(status);
        }

        function toggleFlag(cell) {
            setActiveGame('minesweeper-section');
            if (gameOver || paused || cell.isRevealed) return;
            cell.isFlagged = !cell.isFlagged;
            flagsPlaced += cell.isFlagged ? 1 : -1;
            cell.element.textContent = cell.isFlagged ? '🚩' : '';
            cell.element.classList.toggle('mine-cell-flagged', cell.isFlagged);
            minesLeftNode.textContent = String(mineCount - flagsPlaced);
        }

        function showMine(cell) {
            cell.element.classList.add('mine-cell-mine');
            cell.element.textContent = '💣';
        }

        function reveal(cell) {
            setActiveGame('minesweeper-section');
            if (gameOver || paused || cell.isFlagged || cell.isRevealed) return;
            startTimer();
            cell.isRevealed = true;
            cell.element.classList.add('mine-cell-revealed');

            if (cell.isMine) {
                showMine(cell);
                gameOver = true;
                stopTimer();
                setPausedOverlay('minesweeper-shell', false);
                cells.filter(item => item.isMine).forEach(showMine);
                status.textContent = 'Boom. New board ready when you are.';
                flashStatus(status);
                return;
            }

            revealedSafe++;
            updateScore(revealedSafe * 12);

            if (cell.adjacent > 0) {
                cell.element.textContent = String(cell.adjacent);
                cell.element.setAttribute('data-count', String(cell.adjacent));
            } else {
                neighbours(cell.x, cell.y).forEach(neighbour => {
                    if (!neighbour.isRevealed) reveal(neighbour);
                });
            }

            const safeCells = width * height - mineCount;
            if (revealedSafe === safeCells) {
                gameOver = true;
                stopTimer();
                setPausedOverlay('minesweeper-shell', false);
                pauseButton.textContent = 'Pause Minesweeper';
                const elapsedMs = elapsedBeforePause;
                const seconds = Math.max(1, Math.floor(elapsedMs / 1000));
                const winScore = Math.max(100, 2000 - seconds * 20);
                updateScore(winScore);
                status.textContent = 'Board cleared in ' + seconds + ' seconds.';
                flashStatus(status);
                ScoreStore.save('minesweeper', score).then(() => {
                    status.textContent += isLoggedIn() ? ' High score saved.' : ' Sign in to save that score.';
                    flashStatus(status);
                });
            }
        }

        function togglePause() {
            setActiveGame('minesweeper-section');
            if (gameOver) {
                status.textContent = 'Start a new board to play again.';
                flashStatus(status);
                return;
            }

            const hasStarted = revealedSafe > 0 || flagsPlaced > 0 || timerId || elapsedBeforePause > 0;
            if (!hasStarted) {
                status.textContent = 'Start revealing tiles before pausing.';
                flashStatus(status);
                return;
            }

            paused = !paused;
            setPausedOverlay('minesweeper-shell', paused);
            pauseButton.textContent = paused ? 'Resume Minesweeper' : 'Pause Minesweeper';
            if (paused) {
                stopTimer();
                status.textContent = 'Minesweeper paused.';
            } else {
                startTimer();
                status.textContent = 'Minesweeper resumed.';
            }
            flashStatus(status);
        }

        resetButton.addEventListener('click', buildBoard);
        pauseButton.addEventListener('click', togglePause);
        document.addEventListener('keydown', event => {
            if (activeGame !== 'minesweeper-section') return;
            if (event.key === 'p' || event.key === 'P') {
                event.preventDefault();
                togglePause();
            }
        });
        wireManualSave('minesweeper-save-btn', 'minesweeper', () => score, 'minesweeper-status', 'minesweeper-section');
        buildBoard();
    }

    function initTetris() {
        const canvas = document.getElementById('tetris-canvas');
        const context = canvas.getContext('2d');
        const status = document.getElementById('tetris-status');
        const startButton = document.getElementById('tetris-start-btn');
        const pauseButton = document.getElementById('tetris-pause-btn');
        const linesNode = document.getElementById('tetris-lines');
        const cols = 10;
        const rows = 20;
        const block = 30;
        const colors = {
            I: '#38bdf8',
            O: '#facc15',
            T: '#c084fc',
            L: '#fb923c',
            J: '#60a5fa',
            S: '#4ade80',
            Z: '#f87171',
        };
        const shapes = {
            I: [[1, 1, 1, 1]],
            O: [[1, 1], [1, 1]],
            T: [[0, 1, 0], [1, 1, 1]],
            L: [[1, 0, 0], [1, 1, 1]],
            J: [[0, 0, 1], [1, 1, 1]],
            S: [[0, 1, 1], [1, 1, 0]],
            Z: [[1, 1, 0], [0, 1, 1]],
        };
        let board = [];
        let active = null;
        let score = 0;
        let lines = 0;
        let dropId = null;
        let running = false;
        let paused = false;
        let lineClearEffects = [];
        let lockEffect = null;

        function resetScore(nextScore) {
            score = nextScore;
            updateCurrentScore('tetris', score);
        }

        function emptyBoard() {
            board = Array.from({ length: rows }, () => Array(cols).fill(''));
        }

        function createPiece() {
            const keys = Object.keys(shapes);
            const type = keys[Math.floor(Math.random() * keys.length)];
            return {
                type: type,
                matrix: shapes[type].map(row => row.slice()),
                x: Math.floor(cols / 2) - 1,
                y: 0,
            };
        }

        function drawCell(x, y, color) {
            context.fillStyle = color;
            context.fillRect(x * block + 1, y * block + 1, block - 2, block - 2);
        }

        function drawEffects() {
            const now = performance.now();

            lineClearEffects = lineClearEffects.filter(effect => now - effect.start < 260);
            lineClearEffects.forEach(effect => {
                const progress = Math.min(1, (now - effect.start) / 260);
                const alpha = 0.65 * (1 - progress);
                const sweepWidth = canvas.width * (0.18 + progress * 0.82);
                const sweepX = (canvas.width - sweepWidth) / 2;
                const y = effect.row * block;
                const gradient = context.createLinearGradient(sweepX, y, sweepX + sweepWidth, y + block);
                gradient.addColorStop(0, 'rgba(255,255,255,0)');
                gradient.addColorStop(0.5, 'rgba(250,204,21,' + alpha + ')');
                gradient.addColorStop(1, 'rgba(255,255,255,0)');
                context.fillStyle = gradient;
                context.fillRect(sweepX, y, sweepWidth, block);
            });

            if (lockEffect && now - lockEffect.start < 180) {
                const progress = (now - lockEffect.start) / 180;
                const alpha = 0.28 * (1 - progress);
                lockEffect.cells.forEach(cell => {
                    context.fillStyle = 'rgba(255,255,255,' + alpha + ')';
                    context.fillRect(cell.x * block + 2, cell.y * block + 2, block - 4, block - 4);
                });
            } else {
                lockEffect = null;
            }

            if (lineClearEffects.length || lockEffect) {
                requestAnimationFrame(drawBoard);
            }
        }

        function drawBoard() {
            context.fillStyle = '#0f172a';
            context.fillRect(0, 0, canvas.width, canvas.height);

            board.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value) drawCell(x, y, colors[value]);
                });
            });

            if (active) {
                active.matrix.forEach((row, y) => {
                    row.forEach((value, x) => {
                        if (value) drawCell(active.x + x, active.y + y, colors[active.type]);
                    });
                });
            }

            drawEffects();
        }

        function collides(piece, offsetX, offsetY, matrix) {
            const testMatrix = matrix || piece.matrix;
            for (let y = 0; y < testMatrix.length; y++) {
                for (let x = 0; x < testMatrix[y].length; x++) {
                    if (!testMatrix[y][x]) continue;
                    const nextX = piece.x + x + offsetX;
                    const nextY = piece.y + y + offsetY;
                    if (nextX < 0 || nextX >= cols || nextY >= rows) return true;
                    if (nextY >= 0 && board[nextY][nextX]) return true;
                }
            }
            return false;
        }

        function rotateMatrix(matrix) {
            return matrix[0].map((_, index) => matrix.map(row => row[index]).reverse());
        }

        function mergePiece(piece) {
            const lockedCells = [];
            piece.matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value && piece.y + y >= 0) {
                        board[piece.y + y][piece.x + x] = piece.type;
                        lockedCells.push({ x: piece.x + x, y: piece.y + y });
                    }
                });
            });
            lockEffect = { start: performance.now(), cells: lockedCells };
            flashTetrisCanvas(canvas, 'tetris-lock-impact');
        }

        function clearLines() {
            const fullRows = [];
            board.forEach((row, index) => {
                if (row.every(Boolean)) fullRows.push(index);
            });
            const cleared = fullRows.length;

            if (cleared > 0) {
                lineClearEffects = fullRows.map(row => ({ row: row, start: performance.now() }));
                flashTetrisCanvas(canvas, 'tetris-line-clear');
            }

            board = board.filter((row, index) => !fullRows.includes(index));

            while (board.length < rows) {
                board.unshift(Array(cols).fill(''));
            }

            if (cleared > 0) {
                lines += cleared;
                linesNode.textContent = String(lines);
                pulseNode(linesNode, 'score-pop');
                resetScore(score + cleared * 100);
                status.textContent = cleared === 1 ? 'Line cleared.' : cleared + ' lines cleared.';
                flashStatus(status);
            }
        }

        async function gameOver() {
            running = false;
            paused = false;
            clearInterval(dropId);
            dropId = null;
            setPausedOverlay('tetris-shell', false);
            pauseButton.textContent = 'Pause Tetris';
            status.textContent = 'Game over. Final score: ' + score + '.';
            flashStatus(status);
            if (score > ScoreStore.getBest('tetris')) {
                await ScoreStore.save('tetris', score);
                status.textContent += isLoggedIn() ? ' High score saved.' : ' Sign in to save that high score.';
                flashStatus(status);
            }
        }

        async function step() {
            if (!active || paused || !running) return;
            if (!collides(active, 0, 1)) {
                active.y++;
                drawBoard();
                return;
            }

            mergePiece(active);
            clearLines();
            active = createPiece();
            if (collides(active, 0, 0)) {
                drawBoard();
                await gameOver();
                return;
            }
            drawBoard();
        }

        function start() {
            setActiveGame('tetris-section');
            emptyBoard();
            active = createPiece();
            lines = 0;
            linesNode.textContent = '0';
            resetScore(0);
            running = true;
            paused = false;
            setPausedOverlay('tetris-shell', false);
            status.textContent = 'Tetris started. Use the arrow keys.';
            flashStatus(status);
            pauseButton.textContent = 'Pause Tetris';
            lineClearEffects = [];
            lockEffect = null;
            clearInterval(dropId);
            dropId = setInterval(() => {
                step().catch(error => console.error('Tetris step failed:', error));
            }, 500);
            drawBoard();
        }

        function move(dx) {
            if (running && !paused && active && activeGame === 'tetris-section' && !collides(active, dx, 0)) {
                active.x += dx;
                drawBoard();
            }
        }

        function drop() {
            if (!running || paused || activeGame !== 'tetris-section') return;
            step().catch(error => console.error('Tetris drop failed:', error));
        }

        function hardDrop() {
            if (!running || paused || !active || activeGame !== 'tetris-section') return;
            while (!collides(active, 0, 1)) {
                active.y++;
            }
            drawBoard();
            step().catch(error => console.error('Tetris hard drop failed:', error));
        }

        function rotate() {
            if (!running || paused || !active || activeGame !== 'tetris-section') return;
            const rotated = rotateMatrix(active.matrix);
            if (!collides(active, 0, 0, rotated)) {
                active.matrix = rotated;
                drawBoard();
            }
        }

        function togglePause() {
            setActiveGame('tetris-section');
            if (!running) {
                status.textContent = 'Start Tetris before pausing.';
                flashStatus(status);
                return;
            }

            paused = !paused;
            setPausedOverlay('tetris-shell', paused);
            pauseButton.textContent = paused ? 'Resume Tetris' : 'Pause Tetris';
            status.textContent = paused ? 'Tetris paused.' : 'Tetris resumed.';
            flashStatus(status);
        }

        document.addEventListener('keydown', event => {
            if (activeGame !== 'tetris-section') return;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'p', 'P'].includes(event.key) || event.code === 'Space') {
                event.preventDefault();
            }
            if (event.key === 'ArrowLeft') move(-1);
            if (event.key === 'ArrowRight') move(1);
            if (event.key === 'ArrowDown') drop();
            if (event.key === 'ArrowUp') rotate();
            if (event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space') hardDrop();
            if (event.key === 'p' || event.key === 'P') togglePause();
        });

        document.querySelectorAll('[data-touch-controls="tetris"] button').forEach(button => {
            button.addEventListener('click', () => {
                setActiveGame('tetris-section');
                const action = button.getAttribute('data-action');
                if (action === 'left') move(-1);
                if (action === 'right') move(1);
                if (action === 'down') drop();
                if (action === 'rotate') rotate();
            });
        });

        startButton.addEventListener('click', start);
        pauseButton.addEventListener('click', togglePause);
        wireManualSave('tetris-save-btn', 'tetris', () => score, 'tetris-status', 'tetris-section');
        emptyBoard();
        drawBoard();
    }

    function init2048() {
        const boardNode = document.getElementById('board-2048');
        const status = document.getElementById('game-2048-status');
        const resetButton = document.getElementById('game-2048-reset-btn');
        const saveButton = document.getElementById('game-2048-save-btn');
        const tileLayer = document.createElement('div');
        let board = [];
        let score = 0;
        let won = false;
        let isAnimating = false;

        function initBoardFrame() {
            boardNode.innerHTML = '';
            const base = document.createElement('div');
            base.className = 'board-2048-base';
            for (let i = 0; i < 16; i++) {
                const cell = document.createElement('div');
                cell.className = 'board-2048-cell';
                base.appendChild(cell);
            }
            tileLayer.className = 'board-2048-tiles';
            boardNode.appendChild(base);
            boardNode.appendChild(tileLayer);
        }

        function updateScoreDisplay(nextScore) {
            score = nextScore;
            updateCurrentScore('2048', score);
        }

        function randomEmptyCell() {
            const empties = [];
            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    if (board[y][x] === 0) empties.push({ x: x, y: y });
                }
            }
            if (!empties.length) return null;
            return empties[Math.floor(Math.random() * empties.length)];
        }

        function addTile() {
            const cell = randomEmptyCell();
            if (!cell) return null;
            const value = Math.random() < 0.9 ? 2 : 4;
            board[cell.y][cell.x] = value;
            return { x: cell.x, y: cell.y, value: value, isNew: true };
        }

        function getBoardMetrics() {
            const styles = getComputedStyle(boardNode);
            const cellSize = parseFloat(styles.getPropertyValue('--cell-size')) || 72;
            const gap = parseFloat(styles.getPropertyValue('--gap')) || 10;
            return { cellSize: cellSize, gap: gap };
        }

        function createTileElement(tile, moving, metrics) {
            const element = document.createElement('div');
            const classes = ['tile-2048', 'tile-2048-' + tile.value];
            if (moving) classes.push('tile-2048-moving');
            if (tile.pop) classes.push('tile-2048-pop');
            if (tile.isNew) classes.push('tile-2048-new');
            if (tile.isMerged) classes.push('tile-2048-merged');
            element.className = classes.join(' ');
            element.textContent = String(tile.value);
            element.style.setProperty('--col', String(tile.x));
            element.style.setProperty('--row', String(tile.y));

            if (moving) {
                const deltaX = (tile.fromX - tile.x) * (metrics.cellSize + metrics.gap);
                const deltaY = (tile.fromY - tile.y) * (metrics.cellSize + metrics.gap);
                element.style.transform = 'translate(' + deltaX + 'px, ' + deltaY + 'px)';
            }

            return element;
        }

        function renderBoard(tileModels) {
            tileLayer.innerHTML = '';
            tileModels.forEach(tile => {
                const element = createTileElement(tile, false, getBoardMetrics());
                tileLayer.appendChild(element);
            });
        }

        function resetGame() {
            setActiveGame('game-2048-section');
            board = Array.from({ length: 4 }, () => Array(4).fill(0));
            won = false;
            isAnimating = false;
            updateScoreDisplay(0);
            const newTiles = [];
            const first = addTile();
            const second = addTile();
            if (first) newTiles.push(first);
            if (second) newTiles.push(second);
            renderBoard(newTiles);
            status.textContent = 'Join the numbers and reach 2048.';
            flashStatus(status);
        }

        function buildFinalTilesFromBoard(popTiles) {
            const popMap = new Map((popTiles || []).map(tile => [tile.x + ',' + tile.y, tile]));
            const tiles = [];
            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    const value = board[y][x];
                    if (!value) continue;
                    const effect = popMap.get(x + ',' + y);
                    tiles.push({
                        x: x,
                        y: y,
                        value: value,
                        pop: !!effect,
                        isNew: !!(effect && effect.isNew),
                        isMerged: !!(effect && effect.isMerged),
                    });
                }
            }
            return tiles;
        }

        function animateMove(movingTiles, finalTiles) {
            isAnimating = true;
            tileLayer.innerHTML = '';
            const metrics = getBoardMetrics();
            const elements = movingTiles.map(tile => createTileElement(tile, true, metrics));
            elements.forEach(element => tileLayer.appendChild(element));

            requestAnimationFrame(() => {
                elements.forEach(element => {
                    element.style.transform = 'translate(0px, 0px)';
                });
            });

            setTimeout(() => {
                renderBoard(finalTiles);
                isAnimating = false;
            }, 150);
        }

        function move(direction) {
            if (activeGame !== 'game-2048-section' || isAnimating) return;
            let changed = false;
            let gainedTotal = 0;
            const nextBoard = Array.from({ length: 4 }, () => Array(4).fill(0));
            const movingTiles = [];
            const popTiles = [];

            for (let i = 0; i < 4; i++) {
                const cells = [];
                for (let j = 0; j < 4; j++) {
                    const x = direction === 'left' || direction === 'right' ? j : i;
                    const y = direction === 'left' || direction === 'right' ? i : j;
                    const value = board[y][x];
                    if (value) cells.push({ value: value, x: x, y: y });
                }

                const ordered = (direction === 'right' || direction === 'down') ? cells.reverse() : cells;
                let targetIndex = 0;

                for (let j = 0; j < ordered.length; j++) {
                    const current = ordered[j];
                    const reversed = direction === 'right' || direction === 'down';
                    const finalIndex = reversed ? 3 - targetIndex : targetIndex;
                    const destX = direction === 'left' || direction === 'right' ? finalIndex : i;
                    const destY = direction === 'left' || direction === 'right' ? i : finalIndex;
                    const next = ordered[j + 1];

                    if (next && next.value === current.value) {
                        movingTiles.push({ value: current.value, fromX: current.x, fromY: current.y, x: destX, y: destY });
                        movingTiles.push({ value: next.value, fromX: next.x, fromY: next.y, x: destX, y: destY });
                        nextBoard[destY][destX] = current.value * 2;
                        popTiles.push({ x: destX, y: destY, isMerged: true });
                        gainedTotal += current.value * 2;
                        changed = true;
                        j++;
                    } else {
                        movingTiles.push({ value: current.value, fromX: current.x, fromY: current.y, x: destX, y: destY });
                        nextBoard[destY][destX] = current.value;
                        if (current.x !== destX || current.y !== destY) changed = true;
                    }

                    targetIndex++;
                }
            }

            if (!changed) return;

            board = nextBoard;
            updateScoreDisplay(score + gainedTotal);
            const newTile = addTile();
            if (newTile) popTiles.push(newTile);
            animateMove(movingTiles, buildFinalTilesFromBoard(popTiles));

            if (!won && board.flat().some(value => value >= 2048)) {
                won = true;
                status.textContent = '2048 reached. Keep going for an even bigger score.';
                flashStatus(status);
                ScoreStore.save('2048', score);
            } else if (!hasMoves()) {
                status.textContent = 'No more moves. Final score: ' + score + '.';
                flashStatus(status);
                ScoreStore.save('2048', score).then(() => {
                    status.textContent += isLoggedIn() ? ' High score saved.' : ' Sign in to save that score.';
                    flashStatus(status);
                });
            } else {
                status.textContent = 'Good move. Keep merging.';
                flashStatus(status);
            }
        }

        function hasMoves() {
            if (board.flat().includes(0)) return true;
            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    const value = board[y][x];
                    if (x < 3 && board[y][x + 1] === value) return true;
                    if (y < 3 && board[y + 1][x] === value) return true;
                }
            }
            return false;
        }

        document.addEventListener('keydown', event => {
            if (activeGame !== 'game-2048-section') return;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                if (document.activeElement && document.activeElement.closest('#game-2048-section button')) {
                    document.activeElement.blur();
                }
            }
            if (event.key === 'ArrowUp') move('up');
            if (event.key === 'ArrowDown') move('down');
            if (event.key === 'ArrowLeft') move('left');
            if (event.key === 'ArrowRight') move('right');
        });

        document.querySelectorAll('[data-touch-controls="2048"] button').forEach(button => {
            button.addEventListener('click', () => {
                setActiveGame('game-2048-section');
                button.blur();
                move(button.getAttribute('data-dir'));
            });
        });

        resetButton.addEventListener('click', () => resetButton.blur());
        saveButton.addEventListener('click', () => saveButton.blur());
        resetButton.addEventListener('click', resetGame);
        wireManualSave('game-2048-save-btn', '2048', () => score, 'game-2048-status', 'game-2048-section');
        initBoardFrame();
        resetGame();
    }

    bindPanelActivation('snake-section', 'snake-section');
    bindPanelActivation('minesweeper-section', 'minesweeper-section');
    bindPanelActivation('tetris-section', 'tetris-section');
    bindPanelActivation('game-2048-section', 'game-2048-section');

    syncAccountState();
    updateAllScoreHints();
    initArcadeReveal();
    initSnake();
    initMinesweeper();
    initTetris();
    init2048();
    if (!activeGame) setActiveGame('snake-section');
})();
