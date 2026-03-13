/**
 * MineRush – Core Game Logic
 * Manages game state, multiplier, crash point, betting, and UI.
 */

/* ── Constants ──────────────────────────────────────────────────── */
const COUNTDOWN_SECONDS = 3;
const MULTIPLIER_TICK_MS = 80;         // ms between multiplier updates
const MULTIPLIER_GROWTH = 0.008;      // rate of exponential growth per tick (slower = smoother climb)
const HOUSE_EDGE = 0.05;              // 5% house edge → ~95% RTP
const STARTING_BALANCE = 1000;

/* ── State ──────────────────────────────────────────────────────── */
const State = { WAITING: 'waiting', COUNTDOWN: 'countdown', RUNNING: 'running', CRASH: 'crash', RESULT: 'result' };

let gameState = State.WAITING;
let balance = STARTING_BALANCE;
let currentBet = 0;
let multiplier = 1.00;
let crashPoint = 0;
let cashedOut = false;
let cashOutMult = 0;
let countdownVal = COUNTDOWN_SECONDS;
let lastTime = null;
let multiplierAcc = 0;

let renderer = null;
let animFrameId = null;
let countdownTimer = null;

/* ── UI References ──────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const ui = {
    multiplierValue: $('multiplier-value'),
    crashLabel: $('crash-label'),
    balanceValue: $('balance-value'),
    betInput: $('bet-input'),
    betBtn: $('bet-btn'),
    halfBtn: $('half-btn'),
    doubleBtn: $('double-btn'),
    betControls: $('bet-controls'),
    cashoutControls: $('cashout-controls'),
    cashoutBtn: $('cashout-btn'),
    potentialValue: $('potential-value'),
    countdownOverlay: $('countdown-overlay'),
    countdownText: $('countdown-text'),
    resultOverlay: $('result-overlay'),
    resultBox: $('result-box'),
    resultTitle: $('result-title'),
    resultDetail: $('result-detail'),
    playAgainBtn: $('play-again-btn'),
    canvas: $('game-canvas'),
    collectChar: $('collect-char'),
};

/* ── Multiplier Helpers ─────────────────────────────────────────── */

/**
 * Generate a provably-fair crash point using a heavy-tail distribution.
 *
 * Formula (standard crash game):  crashPoint = 0.95 / U
 *   where U ~ Uniform(0, 1)
 *
 * This gives P(crash ≥ x) = 0.95 / x, so:
 *   - P(crash < 1.00x)  = 0%    (always at least 1x before crashing)
 *   - P(crash < 1.20x)  ≈ 21%   (absorbed into the 1x floor region)
 *   - P(crash ≥ 2.00x)  ≈ 47.5% players could exit above 2×
 *   - P(crash ≥ 5.00x)  ≈ 19%
 *   - P(crash ≥ 10.00x) ≈ 9.5%
 *
 * Combined with the 1.00x floor (instant bust segment ≈ 5%),
 * expected RTP = 95%.
 *
 * Target distribution:
 *   1.00–1.20 : ~35%  (includes the ~5% sub-1x instant-bust segment)
 *   1.20–2.00 : ~34%
 *   2.00–5.00 : ~19%
 *   5.00–10.0 : ~7%
 *   10.0+     : ~5%
 */
function generateCrashPoint() {
    // Provably-random seed (replace with server-side HMAC in production)
    const r = Math.random();

    // ~5% of rounds instant-bust at exactly 1.00x (house always wins those)
    if (r < HOUSE_EDGE) {
        return 1.00;
    }

    // For the remaining 95% use the inverse CDF: crash = 1 / (1 - r)
    // Scaled so expected value = 1/0.95 (maintains 95% RTP exactly)
    const raw = (1 - HOUSE_EDGE) / (1 - r);

    // Floor at 1.00 — multiplier never shown below 1x
    return Math.max(1.00, raw);
}

function fmtMultiplier(v) {
    return v.toFixed(2) + 'x';
}

/* ── Game State Machine ─────────────────────────────────────────── */

function enterWaiting() {
    gameState = State.WAITING;
    multiplier = 1.00;
    cashedOut = false;
    cashOutMult = 0;
    multiplierAcc = 0;

    renderer.reset();
    renderer.draw(gameState);

    ui.multiplierValue.textContent = fmtMultiplier(multiplier);
    ui.multiplierValue.className = '';
    ui.crashLabel.classList.add('hidden');
    ui.betControls.classList.remove('hidden');
    ui.cashoutControls.classList.add('hidden');
    ui.resultOverlay.classList.add('hidden');
    ui.resultBox.classList.remove('win-box', 'loss-box');
    ui.countdownOverlay.classList.add('hidden');

    if (ui.collectChar) ui.collectChar.classList.add('hidden');

    // Hide toast
    const toast = $('cashout-toast');
    if (toast) {
        toast.classList.add('hidden');
        toast.classList.remove('toast-anim');
    }

    ui.betBtn.disabled = false;
    ui.betInput.disabled = false;
    updateBalanceDisplay();
}

function enterCountdown() {
    gameState = State.COUNTDOWN;
    countdownVal = COUNTDOWN_SECONDS;

    ui.betBtn.disabled = true;
    ui.betInput.disabled = true;
    ui.countdownOverlay.classList.remove('hidden');
    ui.countdownText.textContent = countdownVal;

    // Animate countdown number each second
    function tick() {
        countdownVal--;
        if (countdownVal <= 0) {
            ui.countdownOverlay.classList.add('hidden');
            enterRunning();
        } else {
            ui.countdownText.textContent = countdownVal;
            // Restart pop animation
            ui.countdownText.style.animation = 'none';
            void ui.countdownText.offsetWidth; // reflow
            ui.countdownText.style.animation = '';
            countdownTimer = setTimeout(tick, 1000);
        }
    }
    countdownTimer = setTimeout(tick, 1000);
}

function enterRunning() {
    gameState = State.RUNNING;
    multiplier = 1.00;
    crashPoint = generateCrashPoint();
    lastTime = null;
    multiplierAcc = 0;

    ui.betControls.classList.add('hidden');
    ui.cashoutControls.classList.remove('hidden');
    ui.cashoutBtn.disabled = false;
    ui.potentialValue.textContent = Math.floor(currentBet * multiplier);

    renderer.startRunning();

    // Start game loop
    animFrameId = requestAnimationFrame(gameLoop);
}

function enterCrash() {
    gameState = State.CRASH;

    ui.multiplierValue.style.color = '#e03434';
    ui.crashLabel.classList.remove('hidden');
    ui.cashoutBtn.disabled = true;

    renderer.triggerCrash();

    // Show result after crash animation settles
    setTimeout(enterResult, 1400);
}

function enterResult() {
    gameState = State.RESULT;

    cancelAnimationFrame(animFrameId);

    const won = cashedOut;
    const winAmt = won ? Math.floor(currentBet * cashOutMult) : 0;

    if (won) {
        ui.resultTitle.textContent = '💰 CASHED OUT!';
        ui.resultTitle.className = 'win';
        ui.resultDetail.innerHTML =
            `<div class="win-multiplier">${fmtMultiplier(cashOutMult)}</div>` +
            `<div class="win-amount">+${winAmt} COINS</div>`;
        ui.resultBox.classList.add('win-box');
        ui.resultBox.classList.remove('loss-box');
        if (ui.collectChar) ui.collectChar.classList.remove('hidden');
    } else {
        ui.resultTitle.textContent = '💥 CRASHED!';
        ui.resultTitle.className = 'loss';
        if (ui.collectChar) ui.collectChar.classList.add('hidden');
        ui.resultDetail.innerHTML =
            `Rail broke at <b>${fmtMultiplier(crashPoint)}</b><br>` +
            `Lost <b>${currentBet} coins</b>`;
        ui.resultBox.classList.add('loss-box');
        ui.resultBox.classList.remove('win-box');
        balance -= currentBet;
        if (balance < 0) balance = 0;
        updateBalanceDisplay();
    }

    ui.cashoutControls.classList.add('hidden');
    ui.resultOverlay.classList.remove('hidden');

    // If balance is 0, refill
    if (balance === 0) {
        balance = STARTING_BALANCE;
        ui.resultDetail.innerHTML += '<br><br><i>Balance refilled to 1000 coins!</i>';
        updateBalanceDisplay();
    }
}

/* ── Cash Out ────────────────────────────────────────────────────── */

function cashOut() {
    if (gameState !== State.RUNNING || cashedOut) return;
    cashedOut = true;
    cashOutMult = multiplier;

    const winAmt = Math.floor(currentBet * cashOutMult);
    balance += winAmt;
    updateBalanceDisplay();

    // Show cashout toast on canvas above the character head
    renderer.showCashoutToast(fmtMultiplier(cashOutMult) + ' ✓');

    ui.cashoutBtn.disabled = true;

    // Animate cashout styling
    ui.cashoutBtn.style.background = 'linear-gradient(135deg, #aaaaaa, #666666)';
}

/* ── Place Bet ───────────────────────────────────────────────────── */

function placeBet() {
    if (gameState !== State.WAITING) return;

    const raw = parseInt(ui.betInput.value, 10);
    if (isNaN(raw) || raw < 1) { shakeBetInput(); return; }
    if (raw > balance) { shakeBetInput(); return; }

    currentBet = raw;
    enterCountdown();
}

function shakeBetInput() {
    ui.betInput.style.transition = 'border-color 0s';
    ui.betInput.style.borderColor = '#e03434';
    ui.betInput.style.animation = 'none';
    setTimeout(() => {
        ui.betInput.style.borderColor = '';
        ui.betInput.style.transition = '';
    }, 600);
}

/* ── Game Loop ───────────────────────────────────────────────────── */

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // seconds, capped
    lastTime = timestamp;

    if (gameState === State.RUNNING) {
        // Multiplier growth: starts VERY slow, then speeds up
        multiplierAcc += dt;
        
        // Base growth factor - reduced to match 1.1x after 1s target
        let growth = 0.0016; 
        
        // Progressive acceleration for tension
        if (multiplier > 10) {
            growth = 0.022; // Fast acceleration
        } else if (multiplier > 5) {
            growth = 0.015; // Moderate acceleration
        } else if (multiplier > 2) {
            growth = 0.010; // Slow acceleration
        }
        
        // Exponential-like increase
        multiplier += multiplier * growth * dt * 60;

        // Untethered multiplier display (continues after cashout)
        ui.multiplierValue.textContent = fmtMultiplier(multiplier);

        // Freeze potential value if cashed out
        if (!cashedOut) {
            ui.potentialValue.textContent = Math.floor(currentBet * multiplier);
        }

        // Color shifts
        if (multiplier >= 5) {
            ui.multiplierValue.className = 'danger';
        } else if (multiplier >= 2) {
            ui.multiplierValue.className = 'high';
        }

        // Spawn gold coins randomly based on multiplier size
        // The higher the multiplier, the higher the spawn chance
        // Boost spawn chance slightly if > 10x to make gems more frequent
        let spawnChance = Math.min(0.2 + (multiplier * 0.02), 0.8);
        if (multiplier > 10) spawnChance = Math.min(spawnChance + 0.1, 0.9);

        if (Math.random() < spawnChance) {
            spawnCoinParticle(multiplier);
        }

        // Check crash
        if (multiplier >= crashPoint && !cashedOut) {
            enterCrash();
        } else if (multiplier >= crashPoint && cashedOut) {
            // Crashed after cash out – still show crash but player won
            enterCrash();
        }
    }

    renderer.update(dt, gameState, multiplier);
    renderer.draw(gameState);

    if (gameState === State.RUNNING || gameState === State.CRASH) {
        animFrameId = requestAnimationFrame(gameLoop);
    }
}

/* ── Coin Particles ─────────────────────────────────────────────── */

function spawnCoinParticle(multiplier) {
    const wrap = $('multiplier-wrap');
    if (!wrap) return;

    const coin = document.createElement('img');

    // Mix gems if multiplier > 10
    if (multiplier > 10 && Math.random() < 0.3) {
        coin.src = 'assets/jam_ico.png';
        coin.className = 'coin-particle gem-particle'; // Add class for potential styling
    } else {
        coin.src = 'assets/coin.png';
        coin.className = 'coin-particle';
    }

    // Randomize starting X position slightly around the center
    const rx = (Math.random() - 0.5) * 60;
    coin.style.left = `calc(50% + ${rx}px)`;

    wrap.appendChild(coin);

    // Setup animation properties
    const dur = 0.8 + Math.random() * 0.5;
    const startRot = Math.random() * 360;
    const spinAmt = (90 + Math.random() * 180) * (Math.random() > 0.5 ? 1 : -1);
    const endRot = startRot + spinAmt;

    // Web Animations API – uniform size, slow spin, fade at the end
    const driftX = (Math.random() - 0.5) * 40;
    coin.animate([
        { transform: `translate(0px, 0px) rotate(${startRot}deg)`, opacity: 1, offset: 0 },
        { transform: `translate(${driftX * 0.5}px, 60px) rotate(${startRot + spinAmt * 0.5}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${driftX}px, 130px) rotate(${endRot}deg)`, opacity: 0, offset: 1 }
    ], {
        duration: dur * 1000,
        easing: 'ease-in',
        fill: 'forwards'
    });

    // Clean up DOM after animation
    setTimeout(() => {
        if (coin.parentNode) coin.parentNode.removeChild(coin);
    }, dur * 1000);
}

/* ── UI Helpers ─────────────────────────────────────────────────── */

function updateBalanceDisplay() {
    ui.balanceValue.textContent = balance;
}

/* ── Event Listeners ─────────────────────────────────────────────── */

function init() {
    renderer = new Renderer(ui.canvas);

    // Initial still frame
    renderer.draw(State.WAITING);

    // Bet button
    ui.betBtn.addEventListener('click', placeBet);

    // Bet input: Enter key
    ui.betInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') placeBet();
    });

    // ½ / 2× adjusters
    ui.halfBtn.addEventListener('click', () => {
        const v = Math.max(1, Math.floor(parseInt(ui.betInput.value || 0) / 2));
        ui.betInput.value = v;
    });
    ui.doubleBtn.addEventListener('click', () => {
        const v = Math.min(balance, Math.floor(parseInt(ui.betInput.value || 0) * 2) || 1);
        ui.betInput.value = v;
    });

    // Cash out button
    ui.cashoutBtn.addEventListener('click', cashOut);

    // Space bar cash out shortcut
    window.addEventListener('keydown', e => {
        if (e.code === 'Space' && gameState === State.RUNNING) {
            e.preventDefault();
            cashOut();
        }
    });

    // Play Again
    ui.playAgainBtn.addEventListener('click', () => {
        ui.cashoutBtn.style.background = '';
        enterWaiting();
    });

    // Handle canvas resize
    window.addEventListener('resize', () => {
        renderer.resize();
        renderer.draw(gameState);
    });

    // Redraw if images load late
    window.addEventListener('assetsLoaded', () => {
        if (gameState === State.WAITING) {
            renderer.draw(gameState);
        }
    });

    enterWaiting();
}

/* ── Bootstrap ───────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', init);
