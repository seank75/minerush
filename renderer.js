/**
 * MineRush – Renderer
 * Handles all canvas drawing: background, rails, Guru + coal creature, particles.
 */

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Scroll state
    this.scrollX = 0;
    this.scrollSpeed = 0;

    // Particles for crash
    this.particles = [];

    // Bounce/bob for character
    this.bobTime = 0;

    // Rail shake on crash
    this.shakeX = 0;
    this.shakeY = 0;
    this.shaking = false;
    this.shakeDecay = 0;

    // Wheel rotation
    this.wheelAngle = 0;

    this.crashProgress = 0;
    this.crashed = false;
    this.cashoutToast = null; // { text, birth, duration }
    this.currentMultiplier = 1.0;
    this.baseScale = 1.0;

    // Load custom layered image assets (Fallback to native drawing if missing)
    this.customAssets = {
      body: new Image(),
      arm: new Image(),
      wheel: new Image(),
      rail: new Image(),
      tile01: new Image(),
      stone: new Image()
    };
    
    const triggerRedraw = () => window.dispatchEvent(new Event('assetsLoaded'));
    this.customAssets.body.onload = triggerRedraw;
    this.customAssets.arm.onload = triggerRedraw;
    this.customAssets.wheel.onload = triggerRedraw;
    this.customAssets.rail.onload = triggerRedraw;
    this.customAssets.tile01.onload = triggerRedraw;
    this.customAssets.stone.onload = triggerRedraw;

    this.customAssets.body.src = 'assets/body.png';
    this.customAssets.arm.src = 'assets/arm.png';
    this.customAssets.wheel.src = 'assets/wheel.png';
    this.customAssets.rail.src = 'assets/rail.png';
    this.customAssets.tile01.src = 'assets/tile01.png';
    this.customAssets.stone.src = 'assets/stone.png';

    // Bat swarm state
    this.bats = [];
    this.batContainer = document.getElementById('bat-container');
    if (!this.batContainer) {
      this.batContainer = document.createElement('div');
      this.batContainer.id = 'bat-container';
      this.canvas.parentNode.insertBefore(this.batContainer, this.canvas.nextSibling);
    }
  }

  resize() {
    this.canvas.width  = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    
    // Calculate baseScale using both height (H) and width (W).
    // Reference: 600x850. Min scale 0.65 for mobile accessibility.
    const hScale = this.H / 600;
    const wScale = (this.W / 850) * 1.2; // slight bias to width
    this.baseScale = Math.max(0.65, Math.min(1.2, Math.min(hScale, wScale)));
  }

  // ── Public API ────────────────────────────────────────────────────

  startRunning() {
    this.scrollSpeed = 8; // increased speed
    this.crashProgress = 0;
    this.crashedAngle = 0;
    this.crashed = false;
    this.particles = [];
    this.shaking = false;
    this.bobTime = 0;
    this.scrollX = 0;
    this.wheelAngle = 0;
    this.bats = [];
  }

  triggerCrash() {
    this.crashed = true;
    this.scrollSpeed = 0;
    this.spawnCrashParticles();
    this.startShake(14);
  }

  stopAll() {
    this.scrollSpeed = 0;
  }

  reset() {
    this.scrollX = 0;
    this.scrollSpeed = 0;
    this.particles = [];
    this.crashProgress = 0;
    this.crashed = false;
    this.shaking = false;
    this.bobTime = 0;
    this.wheelAngle = 0;
    this.cashoutToast = null;
    this._clearBats();
  }

  _clearBats() {
    this.bats = [];
    if (this.batContainer) this.batContainer.innerHTML = '';
  }

  // ── Cashout Toast ─────────────────────────────────────────────────

  showCashoutToast(text) {
    this.cashoutToast = { text, birth: performance.now(), duration: 2200 };
  }

  // ── Update ────────────────────────────────────────────────────────

  update(dt, state, multiplier = 1.0) {
    const running = state === 'running';
    this.currentMultiplier = multiplier;

    if (running) {
      this.scrollX += this.scrollSpeed;
      this.bobTime += dt * 8;
      this.wheelAngle += 0.18;
    }

    if (this.crashed) {
      this.crashProgress = Math.min(this.crashProgress + dt * 1.5, 1);
    }

    // Shake
    if (this.shaking) {
      const s = this.shakeDecay;
      this.shakeX = (Math.random() * 2 - 1) * s;
      this.shakeY = (Math.random() * 2 - 1) * s;
      this.shakeDecay *= 0.88;
      if (this.shakeDecay < 0.5) { this.shaking = false; this.shakeX = 0; this.shakeY = 0; }
    }

    // Particles
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      p.x  += p.vx;
      p.y  += p.vy;
      p.vy += 0.4; // gravity
      p.life -= dt * 1.2;
      p.rot += p.rotV;
    }

    // Update bats
    this._updateBats(dt, running);
  }

  _updateBats(dt, running) {
    if (!running) return;

    // Spawn bats based on multiplier
    // Swarms come in waves
    if (this.currentMultiplier > 1.5 && Math.random() < 0.02) {
      const count = Math.floor(2 + Math.random() * 5);
      for(let i=0; i<count; i++) {
        this._spawnBatDOM();
      }
    }

    for (let i = this.bats.length - 1; i >= 0; i--) {
      const bat = this.bats[i];
      bat.x -= bat.speed * 60 * dt;
      bat.time += dt;
      const y = bat.startY + Math.sin(bat.time * bat.freq) * bat.amp;
      
      bat.el.style.transform = `translate(${bat.x}px, ${y}px) scale(${bat.scale})`;
      
      if (bat.x < -200) {
        bat.el.remove();
        this.bats.splice(i, 1);
      }
    }
  }

  _spawnBatDOM() {
    const el = document.createElement('img');
    el.src = 'assets/batflying.gif';
    el.className = 'bat-element';
    this.batContainer.appendChild(el);

    const scale = (0.3 + Math.random() * 0.4) * this.baseScale;
    
    // Position bats high in the air above the rails
    // railY is absolute canvas coordinate (e.g. 450)
    const railY = this.getRailHeight(this.W * 0.3);
    // Relative startY in container (offset by 120px header)
    const containerRelativeRailY = railY - 120;
    const startY = containerRelativeRailY - (120 * this.baseScale) - Math.random() * (150 * this.baseScale);

    const bat = {
      el: el,
      x: this.W + 50 + Math.random() * 300,
      startY: startY,
      speed: 12 + Math.random() * 12, // Much faster
      amp: 20 + Math.random() * 40,
      freq: 3 + Math.random() * 4,
      time: Math.random() * 10,
      scale: scale
    };
    this.bats.push(bat);
  }

  // ── Draw ──────────────────────────────────────────────────────────

  draw(state) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    this._drawBackground(state);
    this._drawRails(state);
    this._drawCharacter(state);
    this._drawParticles();
    this._drawCashoutToast();

    ctx.restore();
  }

  _drawCashoutToast() {
    const t = this.cashoutToast;
    if (!t) return;
    const elapsed = performance.now() - t.birth;
    const frac = elapsed / t.duration;
    if (frac >= 1) { this.cashoutToast = null; return; }

    const ctx = this.ctx;
    const baseX = this.W * 0.28;
    // Position above the character head – character is drawn at baseY
    const headY = this.getRailHeight(baseX) - (110 * this.baseScale); // scale offset

    // Float up as time progresses
    const floatY = headY - frac * (80 * this.baseScale);

    // Fade out in the last 40%
    const alpha = frac < 0.6 ? 1 : 1 - (frac - 0.6) / 0.4;
    // Scale: pop in then settle
    const scale = frac < 0.08 ? frac / 0.08 * 1.3 : frac < 0.15 ? 1.3 - (frac - 0.08) / 0.07 * 0.3 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(baseX, floatY);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.round(this.W * 0.038 * this.baseScale);
    ctx.font = `900 ${fs}px 'Segoe UI', system-ui, sans-serif`;
    // Green glow shadow
    ctx.shadowColor = 'rgba(76,217,100,0.9)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#4cd964';
    ctx.fillText(t.text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Environment Helpers ──────────────────────────────────────────

  getRailHeight(x) {
    const worldX = x + this.scrollX;
    const base = this.H * 0.72; // baseline
    
    // Combine sine waves to create undulating hills
    // Scale amplitudes based on height to keep them in view
    const ampScale = Math.min(1.0, this.H / 500);
    const hill1 = Math.sin(worldX * 0.0025) * 60 * ampScale;
    const hill2 = Math.sin(worldX * 0.0051) * 25 * ampScale;
    const hill3 = Math.sin(worldX * 0.0120) * 8 * ampScale;
    
    return base + hill1 + hill2 + hill3;
  }

  // ── Background ────────────────────────────────────────────────────

  _drawBackground(state) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    // Sky / deep mine gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#080912');
    grad.addColorStop(0.55, '#0e1020');
    grad.addColorStop(1,  '#1a0d06');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Render mine wall texture using tile01.png with large, varied, rotated tiles
    const tImg = this.customAssets.tile01;
    if (tImg.complete && tImg.naturalWidth > 0) {
      ctx.save();
      // Clip to above-the-rail area
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, 0);
      for (let x = W; x > 0; x -= 20) {
        ctx.lineTo(x, this.getRailHeight(x));
      }
      ctx.lineTo(0, this.getRailHeight(0));
      ctx.closePath();
      ctx.clip();

      // Base tile size — intentionally much larger for a varied mine wall
      const baseW = tImg.naturalWidth * 3.5;
      const baseH = tImg.naturalHeight * 3.5;
      const stepX = baseW * 0.45;  // Need to be denser due to full rotation possibility
      const stepY = baseH * 0.45;
      const cols = Math.ceil(W / stepX) + 3;
      const rows = Math.ceil(H / stepY) + 3;
      const parallaxScroll = this.scrollX * 0.3;
      
      // Calculate which absolute grid column we are starting at
      const startCol = Math.floor(parallaxScroll / stepX);
      const txOff = parallaxScroll % stepX;

      for (let r = -1; r < rows + 1; r++) { // Extra rows outside to fill edges
        for (let c = -4; c < cols + 2; c++) {
          const absC = startCol + c;
          const absR = r; // Rows don't scroll vertically in this game

          // Seeded pseudo-random per absolute grid cell so they don't change while scrolling
          const seed1 = Math.sin(absR * 73.1 + absC * 37.7) * 43758;
          const seed2 = Math.sin(absR * 53.3 + absC * 91.1) * 29435;
          const rand1 = seed1 - Math.floor(seed1); // 0..1
          const rand2 = seed2 - Math.floor(seed2);
          const rand3 = (Math.sin(absR * 19.1 + absC * 61.3) * 55123) % 1;

          const scale = 0.5 + rand1 * 1.5; // Massive size variation: 0.5× to 2.0×
          const tW = baseW * scale;
          const tH = baseH * scale;

          // Full random rotation to break the grid pattern
          const rotAngle = rand2 * Math.PI * 2; 
          
          const jitterX = (rand3 - 0.5) * stepX * 1.5;
          const stagger = (absR % 2 === 0) ? 0 : stepX * 0.5;

          const cx = c * stepX + stagger - txOff + jitterX;
          const cy = r * stepY + (rand1 - 0.5) * stepY * 1.5;

          // Optional edge darkening or brightness var based on seed
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rotAngle);
          
          // Subtle opacity variance so chunks blend dynamically
          ctx.globalAlpha = 0.7 + (rand3 * 0.3);
          ctx.drawImage(tImg, -tW / 2, -tH / 2, tW, tH);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // Distant rock textures (parallax slow) - No stalactites
    this._drawRockWalls(W, H, this.scrollX * 0.15, 0.3, false);

    // Mid rock layer - With diverse stalactites
    this._drawRockWalls(W, H, this.scrollX * 0.4, 0.6, true);

    // Solid ground below curving rails
    const gGrad = ctx.createLinearGradient(0, H * 0.4, 0, H);
    gGrad.addColorStop(0, '#2a1a0e');
    gGrad.addColorStop(1, '#120a04');
    ctx.fillStyle = gGrad;
    
    ctx.beginPath();
    ctx.moveTo(0, H);
    // Trace ground contour - overlap rails substantially to cover the top line
    const groundOverlap = 45 * this.baseScale;
    for(let x = 0; x <= W + 40; x += 40) {
      ctx.lineTo(x, this.getRailHeight(x) - groundOverlap);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Ground top edge highlight matching the curve
    ctx.strokeStyle = '#3d2510';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, this.getRailHeight(0) - groundOverlap);
    for(let x = 40; x <= W + 40; x += 40) {
      ctx.lineTo(x, this.getRailHeight(x) - groundOverlap);
    }
    ctx.stroke();
  }

  _drawRockWalls(W, H, offsetX, opacity, includeStalactites = true) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = opacity * 0.18;
    ctx.fillStyle = '#4a3020';

    // Ceiling stalactites using stone.png — small, anchored to ceiling, randomized
    const stImg = this.customAssets.stone;
    
    // Use an absolute grid based on scroll offset to prevent backward movement / mutating
    const stSpacing = W * 0.08;
    const startCol = Math.floor(offsetX / stSpacing);
    const pxOff = offsetX % stSpacing;
    const stCount = Math.ceil(W / stSpacing) + 4; // Extra buffer for jitter

    if (includeStalactites) {
      if (stImg.complete && stImg.naturalWidth > 0) {
      const aspect = stImg.naturalHeight / stImg.naturalWidth;
      for (let c = -3; c < stCount; c++) {
        const absC = startCol + c;
        const seed = Math.abs(Math.sin(absC * 17.31));
        if (seed > 0.85) continue; 

        // Randomized spacing and size for more "diverse" look
        const jitterX = (Math.sin(absC * 51.3) * 1.5) * stSpacing;
        const bx = c * stSpacing - pxOff + jitterX;
        
        const sizeSeed = Math.abs(Math.cos(absC * 41.2));
        const width = (12 + Math.pow(sizeSeed, 3) * 56) * this.baseScale;
        const height = width * aspect * 1.5; // Stretched height
        
        const yOffset = -(height * 0.7) - (60 * this.baseScale);

        ctx.globalAlpha = 0.5 + seed * 0.5;
        ctx.drawImage(stImg, bx - width / 2, yOffset, width, height);
      }
    } else {
      // Fallback native stalactites (original triangles)
      ctx.globalAlpha = opacity * 0.18;
      ctx.fillStyle = '#4a3020';
      for (let c = -1; c < stCount; c++) {
        const absC = startCol + c;
        const bx = c * stSpacing - pxOff;
        const bh = 40 + Math.sin(absC * 2.7) * 20 + Math.cos(absC * 1.3) * 15;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx + stSpacing * 0.4, 0);
        ctx.lineTo(bx + stSpacing * 0.2, bh);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

    // Wall cracks / vein lines
    ctx.globalAlpha = opacity * 0.12;
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const bx = ((i * W * 0.22 - offsetX * 0.5) + W * 4) % (W * 1.2);
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + 30, H * 0.3);
      ctx.lineTo(bx - 10, H * 0.55);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Rails ─────────────────────────────────────────────────────────

  _drawRails(state) {
    const ctx = this.ctx;
    const W = this.W;
    const rImg = this.customAssets.rail;

    // ─ Crash break point at right side ─
    const breakX = this.crashed
      ? W * 0.78 - this.crashProgress * W * 0.3
      : W * 1.1;

    let tileW = 60 * this.baseScale;
    let tileH = 20 * this.baseScale;
    if (rImg.complete && rImg.naturalWidth > 0) {
      tileW = 80 * this.baseScale;
      tileH = (rImg.naturalHeight / rImg.naturalWidth) * tileW;
    }

    // Shrink the step size slightly so tiles overlap and don't break apart
    const stepW = tileW * 0.95;
    const scrollOffset = this.scrollX % stepW;
    
    for (let x = -stepW - scrollOffset; x < breakX; x += stepW) {
      const segStart = x;
      const segEnd = x + stepW;
      
      const yStart = this.getRailHeight(segStart);
      const yEnd = this.getRailHeight(segEnd);
      
      const angle = Math.atan2(yEnd - yStart, stepW);
      // Determine center position of this tile to rotate around
      const midX = segStart + stepW / 2;
      const midY = (yStart + yEnd) / 2;

      ctx.save();
      ctx.translate(midX, midY);
      ctx.rotate(angle);

      if (rImg.complete && rImg.naturalWidth > 0) {
        // Draw image slightly wider than the step size to cover gaps seamlessly
        ctx.drawImage(rImg, -(tileW * 1.05) / 2, -tileH * 0.8, tileW * 1.05, tileH);
      } else {
        // Fallback drawing if image missing
        ctx.fillStyle = '#6a5040';
        ctx.fillRect(-tileW / 2, -4, tileW, 8);
        ctx.fillStyle = '#3d2510';
        ctx.fillRect(-tileW / 2, -8, 10, 16);
        ctx.fillRect(0, -8, 10, 16);
      }

      ctx.restore();
    }

    // ─ Break gap (black void) ─
    if (this.crashed) {
      const gapStartY = this.getRailHeight(breakX);
      const gapW = 40 + this.crashProgress * 80;
      
      ctx.save();
      ctx.strokeStyle = '#e03434';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      // approximate break lines
      ctx.moveTo(breakX, gapStartY - 4);
      ctx.lineTo(breakX + 10, gapStartY + 6);
      ctx.lineTo(breakX - 5, gapStartY + 14);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(breakX, gapStartY - 10, gapW, 40);
      ctx.restore();
    }
  }

  // ── Guru + Coal Creature / Custom Cart ───────────────────────────

  _drawCharacter(state) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    const baseX = W * 0.28;
    // Lift character up relative to the calculated rail height 
    // to put the wheels directly on top of the rails
    const baseY = this.getRailHeight(baseX) - (40 * this.baseScale);
    const bob = state === 'running' ? Math.sin(this.bobTime) * 3 * this.baseScale : 0;
    
    // Determine the slope / angle of the track at character position
    const dx = 10;
    const dy = this.getRailHeight(baseX + dx) - this.getRailHeight(baseX - dx);
    const slopeAngle = Math.atan2(dy, dx * 2);

    ctx.save();

    // Move to character position
    ctx.translate(baseX, baseY + bob);
    // Apply slope rotation
    ctx.rotate(slopeAngle);

    // Randomly spawn sparks at the wheel base while running
    if (state === 'running' && !this.crashed && Math.random() < 0.35) {
      // Coordinates loosely matched to back wheel offset underneath the cart
      const wx = baseX - 30;
      const wy = baseY + 25;
      this._spawnSpark(wx, wy);
    }

    // ─ Crash tilt (additional rotation over slope) ─
    if (this.crashed) {
      const angle = this.crashProgress * 0.6;
      ctx.rotate(angle);
    }

    // Now draw at 0, 0 since we've already translated
    const ca = this.customAssets;
    if (ca.body && ca.body.complete && ca.body.naturalWidth > 0 &&
        ca.arm && ca.arm.complete && ca.arm.naturalWidth > 0 &&
        ca.wheel && ca.wheel.complete && ca.wheel.naturalWidth > 0) {
      this._drawCustomCharacter(0, 0, state);
    } else {
      // Fallback native drawing
      this._drawCoalCreature(0, 0, state);
      this._drawGuru(0, 0, state);
    }

    ctx.restore();
  }

  _drawCustomCharacter(cx, cy, state) {
    const ctx = this.ctx;
    const run = state === 'running';
    const ca = this.customAssets;

    ctx.save();
    ctx.translate(cx, cy);

    // Increase character scale by 3.0x * baseScale
    const scale = 0.35 * 3.0 * this.baseScale;

    // Compute dimensions
    const bImg = ca.body;
    const bWidth = bImg.naturalWidth * scale;
    const bHeight = bImg.naturalHeight * scale;

    const aImg = ca.arm;
    const aWidth = aImg.naturalWidth * scale;
    const aHeight = aImg.naturalHeight * scale;

    const wImg = ca.wheel;
    const wWidth = wImg.naturalWidth * scale;
    const wHeight = wImg.naturalHeight * scale;

    // Body base position with bobbing
    const bodyBob = run ? Math.sin(this.bobTime * 1.5) * 4 : 0;
    
    // Lift body higher relative to wheels
    const bodyY = bodyBob - bHeight - 15;

    // 1. Draw Arm (Background layer)
    // Apply arm swing relative to the body
    let swingFreq = 0.8;
    let swingAmp = 0.15;
    
    if (this.currentMultiplier > 10) {
      swingFreq = 1.6; // double frequency
      swingAmp = 0.3;  // double amplitude
    }
    
    const armSwing = run ? Math.sin(this.bobTime * swingFreq) * swingAmp : 0;
    ctx.save();
    // Arm pivot point: aligned roughly to the character's shoulder on the body image
    // Tweak to shift arm position horizontally/vertically relative to the body center
    const pivotX = bWidth * 0.12;  // moved slightly forward
    const pivotY = bodyY + bHeight * 0.38; // moved slightly higher

    ctx.translate(pivotX, pivotY);
    ctx.rotate(armSwing);
    // Draw the arm offset so the shoulder joint aligns with the pivot point
    ctx.drawImage(aImg, -aWidth * 0.22, -aHeight * 0.18, aWidth, aHeight);
    ctx.restore();

    // 2. Draw Body (Middle layer)
    ctx.save();
    ctx.translate(0, bodyY);
    ctx.drawImage(bImg, -bWidth / 2, 0, bWidth, bHeight);
    ctx.restore();

    // 3. Draw Wheels (Foreground layer)
    const drawWheel = (xOffset, yOffset) => {
      ctx.save();
      ctx.translate(xOffset, yOffset);
      ctx.rotate(this.wheelAngle);
      ctx.drawImage(wImg, -wWidth / 2, -wHeight / 2, wWidth, wHeight);
      ctx.restore();
    };

    // Fine-tuned wheel positions referencing the screenshot
    // Wheels sit on the rail (yOffset near 0 or slightly negative)
    const wheelSpacing = bWidth * 0.25; // further reduced spacing to move wheels closer
    drawWheel(-wheelSpacing, -5); // back wheel
    drawWheel(wheelSpacing + (bWidth * 0.03), -5);  // front wheel

    ctx.restore(); // restore character
  }

  _drawCoalCreature(cx, cy, state) {
    const ctx = this.ctx;
    const wa = this.wheelAngle;
    const run = state === 'running';

    // ── Fallback Body: chunky black rock oval ──
    ctx.save();
    ctx.translate(cx, cy);

    // Main body
    const bodyGrad = ctx.createRadialGradient(-8, -10, 4, 0, -6, 36);
    bodyGrad.addColorStop(0, '#3a3a3a');
    bodyGrad.addColorStop(0.6, '#1a1a1a');
    bodyGrad.addColorStop(1, '#0d0d0d');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(0, -12, 38, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Coal glint highlights
    ctx.fillStyle = 'rgba(100,100,120,0.3)';
    ctx.beginPath();
    ctx.ellipse(-12, -22, 8, 4, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(80,80,100,0.2)';
    ctx.beginPath();
    ctx.ellipse(8, -20, 5, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Rock texture bumps
    const bumps = [[-20, -10, 6], [14, -16, 5], [-5, -26, 4], [22, -8, 5], [-28, -5, 4]];
    ctx.fillStyle = '#222';
    for (const [bx, by, br] of bumps) {
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    // Eyes (red ember glow)
    ctx.fillStyle = '#ff4422';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff4422';
    ctx.beginPath();
    ctx.arc(-10, -16, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6, -18, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Pupils
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-9, -16, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7, -18, 2, 0, Math.PI * 2);
    ctx.fill();

    // ── Legs / Wheels ──
    // Minecart wheels underneath
    const wheelY = 10;
    const wheels = [[-22, wheelY], [-4, wheelY + 2], [14, wheelY]];
    for (const [wx, wy] of wheels) {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(wa);

      // Wheel disc
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Spokes
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 2;
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
        ctx.stroke();
      }

      // Hub
      ctx.fillStyle = '#aaa';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Legs (animated) – stubby rock legs
    if (run) {
      const legPhase = this.bobTime;
      const lleg = Math.sin(legPhase) * 10;
      const rleg = Math.sin(legPhase + Math.PI) * 10;

      ctx.fillStyle = '#222';
      // Front leg
      ctx.beginPath();
      ctx.roundRect(12, 8, 10, rleg + 12, 4);
      ctx.fill();
      // Back leg
      ctx.beginPath();
      ctx.roundRect(-22, 8, 10, lleg + 12, 4);
      ctx.fill();
    } else {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.roundRect(12, 8, 10, 16, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-22, 8, 10, 16, 4);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawGuru(cx, cy, state) {
    const ctx = this.ctx;
    const run = state === 'running';
    const bob = run ? Math.sin(this.bobTime * 1.2) * 2 : 0;

    ctx.save();
    ctx.translate(cx, cy - 46 + bob); // Sit on top of creature

    // ── Fallback Body ──
    ctx.fillStyle = '#4a6fa5';
    ctx.beginPath();
    ctx.roundRect(-10, -22, 22, 28, 4);
    ctx.fill();

    // Belt
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(-10, -4, 22, 5);
    ctx.fillStyle = '#f5c842';
    ctx.fillRect(-4, -5, 8, 7);

    // ── Arms ──
    const armSwing = run ? Math.sin(this.bobTime) * 15 : 0;
    // Left arm
    ctx.save();
    ctx.translate(-12, -14);
    ctx.rotate((-20 + armSwing) * Math.PI / 180);
    ctx.fillStyle = '#4a6fa5';
    ctx.beginPath();
    ctx.roundRect(-4, 0, 8, 20, 3);
    ctx.fill();
    // Hand
    ctx.fillStyle = '#e8c49a';
    ctx.beginPath();
    ctx.arc(0, 20, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Right arm (holding pick direction suggestion)
    ctx.save();
    ctx.translate(12, -14);
    ctx.rotate((20 - armSwing) * Math.PI / 180);
    ctx.fillStyle = '#4a6fa5';
    ctx.beginPath();
    ctx.roundRect(-4, 0, 8, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#e8c49a';
    ctx.beginPath();
    ctx.arc(0, 20, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Legs ──
    const legSwing = run ? Math.sin(this.bobTime) * 12 : 0;
    // Left leg
    ctx.save();
    ctx.translate(-6, 6);
    ctx.rotate(legSwing * Math.PI / 180);
    ctx.fillStyle = '#2d3a5e';
    ctx.beginPath();
    ctx.roundRect(-5, 0, 10, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillRect(-5, 18, 10, 7);
    ctx.restore();

    // Right leg
    ctx.save();
    ctx.translate(6, 6);
    ctx.rotate(-legSwing * Math.PI / 180);
    ctx.fillStyle = '#2d3a5e';
    ctx.beginPath();
    ctx.roundRect(-5, 0, 10, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillRect(-5, 18, 10, 7);
    ctx.restore();

    // ── Head ──
    ctx.fillStyle = '#e8c49a';
    ctx.beginPath();
    ctx.arc(1, -30, 14, 0, Math.PI * 2);
    ctx.fill();

    // Face features
    // Eyes
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-4, -32, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8, -32, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Pupils (looking right)
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-3, -32, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(9, -32, 1, 0, Math.PI * 2);
    ctx.fill();

    // Smile
    ctx.strokeStyle = '#7a4010';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(2, -26, 6, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // ── Helmet ──
    // Hard hat brim
    ctx.fillStyle = '#f5c842';
    ctx.beginPath();
    ctx.ellipse(1, -42, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Helmet dome
    ctx.fillStyle = '#e6b830';
    ctx.beginPath();
    ctx.arc(1, -44, 14, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    // Helmet stripe
    ctx.fillStyle = '#c9a020';
    ctx.fillRect(-6, -52, 14, 4);

    // Helmet lamp
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.roundRect(-4, -54, 10, 7, 3);
    ctx.fill();

    // Lamp glow
    ctx.fillStyle = '#fff7a0';
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ffe050';
    ctx.beginPath();
    ctx.arc(1, -51, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ── Crash Particles ───────────────────────────────────────────────

  spawnCrashParticles() {
    const cx = this.W * 0.72;
    const cy = this.H * 0.72;

    const colors = ['#e03434', '#ff7043', '#f5a623', '#555', '#888', '#333'];
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 2 + Math.random() * 8;
      this.particles.push({
        x:    cx + (Math.random() - 0.5) * 30,
        y:    cy,
        vx:   Math.cos(angle) * spd,
        vy:   Math.sin(angle) * spd - 3,
        size: 3 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0.8 + Math.random() * 0.8,
        rot:  Math.random() * Math.PI,
        rotV: (Math.random() - 0.5) * 0.2,
        square: Math.random() > 0.5,
      });
    }
  }

  _spawnSpark(x, y) {
    // Small, fast-fading bright particle moving left/down
    const size = 2 + Math.random() * 3;
    const colors = ['#fff', '#fce883', '#f5a623', '#ff7043'];
    this.particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 5,
      vx: -1 - Math.random() * 4, // move mostly backward relative to cart
      vy: Math.random() * 2 - 1,
      size: size,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0.3 + Math.random() * 0.4, // short life
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.4,
      square: true,
    });
  }

  startShake(intensity) {
    this.shaking = true;
    this.shakeDecay = intensity;
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.square) {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
