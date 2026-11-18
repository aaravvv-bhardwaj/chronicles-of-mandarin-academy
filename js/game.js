/**
 * game.js — Complete Phaser 3 RPG Engine for Mandarin Journey
 * Features:
 * - Title screen background animation (cherry blossoms, swaying lanterns)
 * - 3 distinct top-down 2D maps: Courtyard, Scholar's Home/Market, Grand Pavilion
 * - Procedural crisp pixel/vector textures & sprites
 * - Smooth player movement (WASD / Arrows) with 4-directional animations & collision
 * - Proximity & click interaction with glowing NPCs and obstacle objects
 * - Synthesized Web Audio API sound effects (no external MP3 dependencies)
 * - Dialogue flow, Question challenges (Chinese-only), Try-Again resets
 * - Seamless integration with WritingBox, Codex, SaveManager, and TextRenderer
 * - Teacher / Demo presentation controls
 */

(function () {
  'use strict';

  /* =========================================================
     HELPERS
     ========================================================= */
  function _escAttr(s) {
    if (!s) return '';
    return s.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  /** Fisher-Yates shuffle — returns a new shuffled array (does not mutate input). */
  function _shuffle(array) {
    const result = array.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /* =========================================================
     AUDIO SYNTHESIZER (Pure Web Audio API)
     ========================================================= */
  const SoundFX = {
    ctx: null,
    enabled: true,

    init() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      } catch (e) {
        console.warn('Web Audio API not supported');
      }
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },

    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    },

    playTone(freq, type, duration, gainVal, endFreq) {
      if (!this.enabled || !this.ctx) return;
      this.resume();
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (endFreq) {
          osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
        }
        gain.gain.setValueAtTime(gainVal || 0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {}
    },

    playFootstep() {
      this.playTone(120, 'triangle', 0.06, 0.05, 80);
    },

    playInteract() {
      this.playTone(523.25, 'sine', 0.15, 0.12, 659.25); // C5 -> E5
    },

    playCorrect() {
      // Pentatonic chime (C5 - E5 - G5 - C6)
      if (!this.enabled || !this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        setTimeout(() => {
          this.playTone(freq, 'sine', 0.35, 0.15);
        }, idx * 90);
      });
    },

    playError() {
      // Gentle error thud
      this.playTone(160, 'sawtooth', 0.25, 0.12, 90);
    },

    playFanfare() {
      if (!this.enabled || !this.ctx) return;
      const chords = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      chords.forEach((freq, idx) => {
        setTimeout(() => {
          this.playTone(freq, 'triangle', 0.6, 0.18);
        }, idx * 120);
      });
    }
  };

  /* =========================================================
     GAME STATE & LOGIC ORCHESTRATOR
     ========================================================= */
  const Game = {
    phaserGame: null,
    currentScene: null,

    // Progression variables
    playerName: 'Traveler',
    currentChapter: 1,
    currentSeqIndex: 0,
    completedObstacles: [],
    masteredVocab: [],

    // Dialogue runtime
    activeDialogue: null,
    currentDialogueLineIdx: 0,

    // Obstacle runtime
    activeObstacle: null,

    init() {
      SoundFX.init();
      if (window.Codex) window.Codex.init();
      if (window.WritingBox) window.WritingBox.init();

      this.bindDOMEvents();
      this.updateTitleScreenUI();
      this.startPhaser();
    },

    /* ── DOM Event Binding ─────────────────────────────── */
    bindDOMEvents() {
      // Sound toggle
      const soundBtn = document.getElementById('sound-btn');
      if (soundBtn) {
        soundBtn.addEventListener('click', () => {
          const state = SoundFX.toggle();
          const label = document.getElementById('sound-label');
          if (label) label.textContent = state ? 'Sound: ON' : 'Sound: OFF';
          soundBtn.innerHTML = (state ? '🔊' : '🔇') + ` <span id="sound-label">${state ? 'Sound: ON' : 'Sound: OFF'}</span>`;
        });
      }

      // Codex button in HUD
      const codexBtn = document.getElementById('codex-btn');
      if (codexBtn) {
        codexBtn.addEventListener('click', () => {
          SoundFX.playInteract();
          if (window.Codex) window.Codex.toggle();
        });
      }

      // Title screen: New Game
      const newGameBtn = document.getElementById('btn-new-game');
      if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
          SoundFX.playInteract();
          document.getElementById('name-modal').style.display = 'flex';
          const input = document.getElementById('player-name-input');
          if (input) {
            input.value = '';
            input.focus();
          }
        });
      }

      // Title screen: Load Game
      const loadGameBtn = document.getElementById('btn-load-game');
      if (loadGameBtn) {
        loadGameBtn.addEventListener('click', () => {
          SoundFX.playInteract();
          this.loadGame();
        });
      }

      // Name modal: Cancel
      const cancelNameBtn = document.getElementById('btn-name-cancel');
      if (cancelNameBtn) {
        cancelNameBtn.addEventListener('click', () => {
          SoundFX.playInteract();
          document.getElementById('name-modal').style.display = 'none';
        });
      }

      // Name modal: Confirm
      const confirmNameBtn = document.getElementById('btn-name-confirm');
      const nameInput = document.getElementById('player-name-input');
      const handleConfirmName = () => {
        SoundFX.playInteract();
        let name = nameInput.value.trim();
        if (!name) name = 'Alex';
        this.playerName = name;
        this.currentChapter = 1;
        this.currentSeqIndex = 0;
        this.completedObstacles = [];
        this.masteredVocab = [];

        document.getElementById('name-modal').style.display = 'none';
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('game-hud').style.display = 'flex';

        // Auto-save checkpoint
        this.saveCheckpoint();
        // Play Chapter 1 Intro Cinema
        this.playChapterCinema(1);
      };

      if (confirmNameBtn) confirmNameBtn.addEventListener('click', handleConfirmName);
      if (nameInput) {
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') handleConfirmName();
        });
      }

      // Chapter Cinema: Start Button
      const cinemaStartBtn = document.getElementById('cinema-start-btn');
      if (cinemaStartBtn) {
        cinemaStartBtn.addEventListener('click', () => {
          SoundFX.playInteract();
          document.getElementById('chapter-cinema').style.display = 'none';
          this.loadMapForCurrentChapter();
        });
      }

      // Dialogue Next Button
      const dialogueNextBtn = document.getElementById('dialogue-next-btn');
      if (dialogueNextBtn) {
        dialogueNextBtn.addEventListener('click', () => {
          SoundFX.playInteract();
          this.advanceDialogue();
        });
      }

      // Dialogue English Translation Toggle
      const dialogueToggleEn = document.getElementById('dialogue-toggle-en');
      if (dialogueToggleEn) {
        dialogueToggleEn.addEventListener('click', () => {
          const enBox = document.getElementById('dialogue-text-en');
          if (enBox.style.display === 'none' || !enBox.style.display) {
            enBox.style.display = 'block';
            dialogueToggleEn.textContent = '[Hide English Translation]';
          } else {
            enBox.style.display = 'none';
            dialogueToggleEn.textContent = '[Show English Translation]';
          }
        });
      }

      // Challenge Codex Hint Button
      const challengeCodexHint = document.getElementById('challenge-codex-hint');
      if (challengeCodexHint) {
        challengeCodexHint.addEventListener('click', () => {
          SoundFX.playInteract();
          if (window.Codex) window.Codex.open();
        });
      }

      // Try Again Retry Button
      const tryAgainRetryBtn = document.getElementById('try-again-retry-btn');
      if (tryAgainRetryBtn) {
        tryAgainRetryBtn.addEventListener('click', () => {
          SoundFX.playInteract();
          document.getElementById('try-again-modal').style.display = 'none';
          // Re-trigger current obstacle challenge
          this.triggerObstacleChallenge(this.activeObstacle);
        });
      }

      // Try Again Codex Button
      const tryAgainCodexBtn = document.getElementById('try-again-codex-btn');
      if (tryAgainCodexBtn) {
        tryAgainCodexBtn.addEventListener('click', () => {
          SoundFX.playInteract();
          if (window.Codex) window.Codex.open();
        });
      }

      // Teacher / Demo Mode dropdown toggle
      const teacherBtn = document.getElementById('teacher-mode-btn');
      const teacherDropdown = document.getElementById('teacher-dropdown');
      if (teacherBtn && teacherDropdown) {
        teacherBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          teacherDropdown.classList.toggle('active');
        });

        document.addEventListener('click', () => {
          teacherDropdown.classList.remove('active');
        });
      }

      // Teacher / Demo items
      const demoCh1 = document.getElementById('demo-tp-ch1');
      if (demoCh1) {
        demoCh1.addEventListener('click', () => {
          this.currentChapter = 1;
          this.currentSeqIndex = 0;
          this.saveCheckpoint();
          this.playChapterCinema(1);
        });
      }
      const demoCh2 = document.getElementById('demo-tp-ch2');
      if (demoCh2) {
        demoCh2.addEventListener('click', () => {
          this.currentChapter = 2;
          this.currentSeqIndex = 0;
          this.saveCheckpoint();
          this.playChapterCinema(2);
        });
      }
      const demoCh3 = document.getElementById('demo-tp-ch3');
      if (demoCh3) {
        demoCh3.addEventListener('click', () => {
          this.currentChapter = 3;
          this.currentSeqIndex = 0;
          this.saveCheckpoint();
          this.playChapterCinema(3);
        });
      }
      const demoAutoSolve = document.getElementById('demo-auto-solve');
      if (demoAutoSolve) {
        demoAutoSolve.addEventListener('click', () => {
          window.__DEMO_AUTO_COMPLETE = !window.__DEMO_AUTO_COMPLETE;
          const isOn = window.__DEMO_AUTO_COMPLETE;
          demoAutoSolve.innerHTML = isOn ? '✍️ Auto-Solve: <b style="color:#16a34a;">[ACTIVE]</b>' : '✍️ Auto-Solve Notebook Box';
          SoundFX.playInteract();

          if (window.WritingBox && window.WritingBox.isOpen()) {
            window.WritingBox.autoCompleteCurrent();
          }

          const bannerText = document.getElementById('mission-text');
          if (bannerText) {
            const prevText = bannerText.textContent;
            bannerText.innerHTML = isOn
              ? '<span style="color:#f59e0b;font-weight:bold;">⚡ Demo Auto-Solve is ON: Writing boxes will solve automatically or via the ⚡ button!</span>'
              : '<span style="color:#bbb;">⚡ Demo Auto-Solve turned OFF.</span>';
            setTimeout(() => {
              if (bannerText.textContent.includes('Demo Auto-Solve')) {
                bannerText.textContent = prevText;
              }
            }, 3500);
          }
        });
      }
      const demoReset = document.getElementById('demo-reset-save');
      if (demoReset) {
        demoReset.addEventListener('click', () => {
          if (window.SaveManager) window.SaveManager.clearSave();
          location.reload();
        });
      }

      // Graduation Modal Buttons
      const gradCodexBtn = document.getElementById('grad-codex-btn');
      if (gradCodexBtn) {
        gradCodexBtn.addEventListener('click', () => {
          if (window.Codex) window.Codex.open();
        });
      }
      const gradRestartBtn = document.getElementById('grad-restart-btn');
      if (gradRestartBtn) {
        gradRestartBtn.addEventListener('click', () => {
          document.getElementById('graduation-modal').style.display = 'none';
          document.getElementById('title-screen').style.display = 'flex';
          this.updateTitleScreenUI();
        });
      }

      // Keyboard listener for Space/Enter in Dialogue
      window.addEventListener('keydown', (e) => {
        // Do not advance dialogue while typing in a form field
        const activeTag = document.activeElement && document.activeElement.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;
        if (e.code === 'Space' || e.code === 'Enter') {
          const dialogueModal = document.getElementById('dialogue-modal');
          if (dialogueModal && dialogueModal.style.display !== 'none') {
            e.preventDefault();
            this.advanceDialogue();
          }
        }
      });
    },

    updateTitleScreenUI() {
      const loadBtn = document.getElementById('btn-load-game');
      const summaryText = document.getElementById('save-summary-text');
      if (window.SaveManager && window.SaveManager.hasSave()) {
        const info = window.SaveManager.getSaveInfo();
        if (info && loadBtn && summaryText) {
          loadBtn.disabled = false;
          summaryText.textContent = info.label;
        }
      } else {
        if (loadBtn) loadBtn.disabled = true;
        if (summaryText) summaryText.textContent = 'No save data found';
      }
    },

    saveCheckpoint() {
      if (window.SaveManager) {
        window.SaveManager.saveCheckpoint(
          this.playerName,
          this.currentChapter,
          this.currentSeqIndex,
          this.completedObstacles,
          this.masteredVocab
        );
      }
    },

    loadGame() {
      if (!window.SaveManager) return;
      const data = window.SaveManager.load();
      if (!data) return;

      this.playerName = data.playerName || 'Traveler';
      this.currentChapter = data.currentChapter || 1;
      this.currentSeqIndex = data.currentSeqIndex || 0;
      this.completedObstacles = data.completedObstacles || [];
      this.masteredVocab = data.masteredVocab || [];

      document.getElementById('title-screen').style.display = 'none';
      document.getElementById('game-hud').style.display = 'flex';

      this.loadMapForCurrentChapter();
    },

    /* ── Chapter Cinema ────────────────────────────────── */
    playChapterCinema(chapterNum) {
      const chapters = (window.GAME_DATA && window.GAME_DATA.chapters) || [];
      const ch = chapters.find(c => c.chapterNumber === chapterNum) || chapters[0];
      if (!ch) return;

      document.getElementById('cinema-badge').textContent = `CHAPTER ${ch.chapterNumber}`;
      document.getElementById('cinema-title-zh').textContent = ch.titleZh;
      document.getElementById('cinema-title-pinyin').textContent = ch.titlePinyin;
      document.getElementById('cinema-title-en').textContent = ch.titleEn;
      document.getElementById('cinema-narrative').textContent = ch.introNarrativeEn;

      const overlay = document.getElementById('chapter-cinema');
      overlay.style.display = 'flex';
      SoundFX.playFanfare();
    },

    /* ── Load Map & Advance Sequence ───────────────────── */
    loadMapForCurrentChapter() {
      const chapters = (window.GAME_DATA && window.GAME_DATA.chapters) || [];
      const ch = chapters.find(c => c.chapterNumber === this.currentChapter);
      if (!ch) return;

      if (this.currentScene) {
        this.currentScene.setupChapter(ch, this.currentSeqIndex);
      }
      this.updateMissionBanner();
    },

    getCurrentSequenceItem() {
      const chapters = (window.GAME_DATA && window.GAME_DATA.chapters) || [];
      const ch = chapters.find(c => c.chapterNumber === this.currentChapter);
      if (!ch || !ch.sequence) return null;
      return ch.sequence[this.currentSeqIndex] || null;
    },

    updateMissionBanner() {
      const bannerText = document.getElementById('mission-text');
      const item = this.getCurrentSequenceItem();
      if (!bannerText) return;

      if (!item) {
        bannerText.textContent = `Chapter ${this.currentChapter} Complete!`;
        return;
      }

      if (item.type === 'dialogue') {
        bannerText.textContent = item.guideInstructionEn || `Talk with ${item.npcNameEn}.`;
      } else if (item.type === 'obstacle') {
        bannerText.textContent = `Challenge at ${item.locationHintEn}: ${item.obstacleTitleEn}`;
      }
    },

    advanceSequence() {
      const chapters = (window.GAME_DATA && window.GAME_DATA.chapters) || [];
      const ch = chapters.find(c => c.chapterNumber === this.currentChapter);
      if (!ch) return;

      this.currentSeqIndex++;
      this.saveCheckpoint();

      if (this.currentSeqIndex >= ch.sequence.length) {
        // Chapter completed!
        if (this.currentChapter === 1) {
          this.currentChapter = 2;
          this.currentSeqIndex = 0;
          this.saveCheckpoint();
          this.playChapterCinema(2);
        } else if (this.currentChapter === 2) {
          this.currentChapter = 3;
          this.currentSeqIndex = 0;
          this.saveCheckpoint();
          this.playChapterCinema(3);
        } else {
          // Chapter 3 completed -> Finale!
          this.showGraduationFinale();
        }
      } else {
        this.loadMapForCurrentChapter();
      }
    },

    /* ── Dialogue Flow ─────────────────────────────────── */
    triggerDialogue(dialogueItem) {
      if (!dialogueItem || !dialogueItem.lines || dialogueItem.lines.length === 0) return;
      this.activeDialogue = dialogueItem;
      this.currentDialogueLineIdx = 0;
      this.renderDialogueLine();
      document.getElementById('dialogue-modal').style.display = 'block';
      SoundFX.playInteract();
    },

    renderDialogueLine() {
      const line = this.activeDialogue.lines[this.currentDialogueLineIdx];
      if (!line) return;

      document.getElementById('dialogue-speaker-zh').textContent = line.speakerZh;
      document.getElementById('dialogue-speaker-pinyin').textContent = line.speakerPinyin;

      // Use TextRenderer to format text and highlight external words,
      // with clickable Chinese lookup spans and a pronunciation button.
      const textZhEl = document.getElementById('dialogue-text-zh');
      if (window.TextRenderer) {
        textZhEl.innerHTML =
          window.TextRenderer.highlightExternalWords(line.textZh) +
          '<button class="dialogue-speak-btn speak-btn" data-speak="' +
          _escAttr(line.textZh) +
          '" onclick="window.TextRenderer.speakChinese(this.getAttribute(\'data-speak\'), this)">🔊</button>';
      } else {
        textZhEl.textContent = line.textZh;
      }

      document.getElementById('dialogue-text-pinyin').textContent = line.textPinyin;

      const enBox = document.getElementById('dialogue-text-en');
      enBox.textContent = line.textEn;
      enBox.style.display = 'none';

      document.getElementById('dialogue-toggle-en').textContent = '[Show English Translation]';

      const nextBtn = document.getElementById('dialogue-next-btn');
      const isLast = this.currentDialogueLineIdx === this.activeDialogue.lines.length - 1;
      nextBtn.textContent = isLast ? 'Finish ➔' : 'Next [Space] ➔';
    },

    advanceDialogue() {
      if (!this.activeDialogue) return;
      this.currentDialogueLineIdx++;
      if (this.currentDialogueLineIdx < this.activeDialogue.lines.length) {
        this.renderDialogueLine();
      } else {
        // Dialogue finished
        document.getElementById('dialogue-modal').style.display = 'none';
        this.activeDialogue = null;
        this.advanceSequence();
      }
    },

    /* ── Obstacle Challenge Flow ───────────────────────── */
    triggerObstacleChallenge(obstacleItem) {
      this.activeObstacle = obstacleItem;
      // Auto-save right before question
      this.saveCheckpoint();

      document.getElementById('challenge-location').textContent = obstacleItem.locationHintEn || 'Obstacle';
      document.getElementById('challenge-context').textContent = obstacleItem.promptContextEn;

      const questionEl = document.getElementById('challenge-question-zh');
      if (window.TextRenderer) {
        questionEl.innerHTML = window.TextRenderer.formatQuestion(obstacleItem.questionZh);
      } else {
        questionEl.textContent = obstacleItem.questionZh;
      }

      // Build { text, isCorrect } entries and Fisher-Yates shuffle so the correct
      // answer is never always in the same button position.
      const options = obstacleItem.options.map((optText, idx) => ({
        text: optText,
        isCorrect: idx === obstacleItem.correctIndex
      }));
      const shuffledOptions = _shuffle(options);

      const grid = document.getElementById('challenge-options-grid');
      grid.innerHTML = '';

      shuffledOptions.forEach((opt, btnIdx) => {
        const btn = document.createElement('button');
        btn.className = 'challenge-opt-btn';
        if (window.TextRenderer) {
          btn.innerHTML = window.TextRenderer.formatOption(opt.text);
        } else {
          btn.textContent = opt.text;
        }

        btn.addEventListener('click', () => {
          this.handleAnswerChoice(opt.isCorrect, obstacleItem);
        });

        grid.appendChild(btn);
      });

      document.getElementById('challenge-modal').style.display = 'flex';
      SoundFX.playInteract();
    },

    handleAnswerChoice(chosenIndex, obstacleItem) {
      document.getElementById('challenge-modal').style.display = 'none';

      if (chosenIndex === true) {
        // Correct answer!
        SoundFX.playCorrect();
        // Transition to 2-stage WritingBox Calligraphy Notebook Challenge
        if (window.WritingBox) {
          window.WritingBox.open(obstacleItem.targetAnswerZh, () => {
            // Callback when BOTH Pass 1 and Pass 2 are completed!
            SoundFX.playCorrect();
            if (!this.completedObstacles.includes(obstacleItem.id)) {
              this.completedObstacles.push(obstacleItem.id);
            }
            this.saveCheckpoint();
            this.advanceSequence();
          });
        } else {
          this.advanceSequence();
        }
      } else {
        // Wrong answer -> Dramatic Try-Again checkpoint screen
        SoundFX.playError();
        const hintEl = document.getElementById('try-again-hint');
        if (obstacleItem.grammarRefId) {
          // Provide lesson reference only, no answer spoilers
          const gramId = obstacleItem.grammarRefId;
          const gramObj = (window.GAME_DATA.grammar || []).find(g => g.id === gramId);
          const lessonNum = gramObj ? gramObj.lesson : 1;
          hintEl.textContent = `💡 Hint: Review Lesson ${lessonNum} Grammar in your Codex!`;
        } else {
          hintEl.textContent = `💡 Hint: Consult your Codex dictionary to check word meanings!`;
        }
        document.getElementById('try-again-modal').style.display = 'flex';
      }
    },

    showGraduationFinale() {
      SoundFX.playFanfare();
      const gradName = document.getElementById('grad-student-name');
      if (gradName) gradName.textContent = `Congratulations, Scholar ${this.playerName}!`;
      document.getElementById('graduation-modal').style.display = 'flex';
    },

    /* ── Start Phaser 3 ────────────────────────────────── */
    startPhaser() {
      const config = {
        type: Phaser.AUTO,
        parent: 'game-container',
        width: 1024,
        height: 640,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        },
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { y: 0 },
            debug: false
          }
        },
        scene: [MainRPGScene]
      };

      this.phaserGame = new Phaser.Game(config);
    }
  };

  /* =========================================================
     PHASER 3 MAIN RPG SCENE
     ========================================================= */
  class MainRPGScene extends Phaser.Scene {
    constructor() {
      super({ key: 'MainRPGScene' });
    }

    preload() {
      // Create rich procedural graphics / textures for all maps, sprites, and objects
      this.createProceduralTextures();
    }

    create() {
      Game.currentScene = this;

      // Input cursors
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        space: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
        enter: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
      };

      // Prevent Phaser from calling preventDefault() on captured keys so
      // typing in HTML <input>, <textarea>, and <select> elements works.
      this.input.keyboard.disableGlobalCapture();

      // Groups
      this.groundLayer = this.add.group();
      this.envLayer = this.physics.add.staticGroup();
      this.npcGroup = this.physics.add.staticGroup();
      this.interactivePrompts = this.add.group();

      // Atmospheric petal particles
      this.createPetalAtmosphere();

      // Setup initial chapter map
      const chapters = (window.GAME_DATA && window.GAME_DATA.chapters) || [];
      const ch = chapters.find(c => c.chapterNumber === Game.currentChapter) || chapters[0];
      if (ch) {
        this.setupChapter(ch, Game.currentSeqIndex);
      }
    }

    /* ── Procedural Graphics & Sprite Textures ──────────── */
    createProceduralTextures() {
      const makeCanvas = (key, w, h, drawFn) => {
        if (this.textures.exists(key)) return;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        drawFn(ctx, w, h);
        this.textures.addCanvas(key, canvas);
      };

      // 1. Tiles: Courtyard Stone Paver
      makeCanvas('tile_courtyard', 64, 64, (ctx) => {
        ctx.fillStyle = '#b5ab99';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#cfc6b6';
        ctx.fillRect(2, 2, 60, 60);
        ctx.fillStyle = '#dfd6c7';
        ctx.fillRect(4, 4, 28, 28);
        ctx.fillStyle = '#bfb6a5';
        ctx.fillRect(34, 34, 28, 28);
        ctx.strokeStyle = '#9e9482';
        ctx.lineWidth = 1;
        ctx.strokeRect(2, 2, 60, 60);
      });

      // 2. Tiles: Scholar Home Wooden Floorboard
      makeCanvas('tile_wood', 64, 64, (ctx) => {
        ctx.fillStyle = '#7a4b27';
        ctx.fillRect(0, 0, 64, 64);
        // 4 wood planks
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = (i % 2 === 0) ? '#a66e44' : '#99633c';
          ctx.fillRect(2, i * 16 + 1, 60, 14);
          // wood grain line
          ctx.strokeStyle = '#85522e';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(8, i * 16 + 8);
          ctx.lineTo(56, i * 16 + 8);
          ctx.stroke();
        }
      });

      // 3. Tiles: Pavilion Campus Stone & Court
      makeCanvas('tile_pavilion', 64, 64, (ctx) => {
        ctx.fillStyle = '#6b7280';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#9ca3af';
        ctx.fillRect(2, 2, 60, 60);
        ctx.fillStyle = '#d1d5db';
        ctx.fillRect(4, 4, 56, 56);
        ctx.strokeStyle = '#4b5563';
        ctx.strokeRect(0, 0, 64, 64);
      });

      // 4. Courtyard Wall
      makeCanvas('wall_brick', 64, 64, (ctx) => {
        ctx.fillStyle = '#4a443b';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#6b6357';
        ctx.fillRect(2, 2, 60, 60);
        ctx.fillStyle = '#8c3a2b'; // vermilion roof top
        ctx.fillRect(0, 0, 64, 14);
        ctx.fillStyle = '#b34735';
        ctx.fillRect(0, 0, 64, 6);
      });

      // 5. Koi Pond
      makeCanvas('koi_pond', 160, 120, (ctx) => {
        // Stone rim
        ctx.fillStyle = '#8c8273';
        ctx.beginPath();
        ctx.ellipse(80, 60, 78, 56, 0, 0, Math.PI * 2);
        ctx.fill();
        // Water
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.ellipse(80, 60, 70, 48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(80, 60, 60, 38, 0, 0, Math.PI * 2);
        ctx.fill();
        // Lily pad
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.arc(60, 50, 14, 0, Math.PI * 1.8);
        ctx.lineTo(60, 50);
        ctx.fill();
        // Koi fish (orange streak)
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.ellipse(100, 65, 12, 5, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // 6. Tea Table & Chairs
      makeCanvas('tea_table', 96, 72, (ctx) => {
        // Wood table
        ctx.fillStyle = '#854d0e';
        ctx.beginPath();
        ctx.roundRect(16, 12, 64, 48, 8);
        ctx.fill();
        ctx.fillStyle = '#a16207';
        ctx.beginPath();
        ctx.roundRect(20, 16, 56, 40, 6);
        ctx.fill();
        // Teapot & Teacups
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.arc(48, 36, 10, 0, Math.PI * 2);
        ctx.fill();
        // Green tea inside cups
        ctx.fillStyle = '#65a30d';
        ctx.beginPath();
        ctx.arc(32, 28, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(64, 44, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // 7. Bookshelf
      makeCanvas('bookshelf', 80, 96, (ctx) => {
        ctx.fillStyle = '#5c3818';
        ctx.fillRect(0, 0, 80, 96);
        ctx.fillStyle = '#85522e';
        ctx.fillRect(4, 4, 72, 88);
        // Shelves
        ctx.fillStyle = '#5c3818';
        ctx.fillRect(4, 32, 72, 6);
        ctx.fillRect(4, 62, 72, 6);
        // Books
        const colors = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea'];
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = colors[i % colors.length];
          ctx.fillRect(10 + i * 10, 10, 8, 22);
          ctx.fillStyle = colors[(i + 2) % colors.length];
          ctx.fillRect(10 + i * 10, 38, 8, 24);
          ctx.fillStyle = colors[(i + 4) % colors.length];
          ctx.fillRect(10 + i * 10, 68, 8, 22);
        }
      });

      // 8. Glowing Lantern
      makeCanvas('lantern_obj', 48, 64, (ctx) => {
        // Red lantern body
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.ellipse(24, 32, 18, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        // Gold trims
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(12, 10, 24, 6);
        ctx.fillRect(12, 48, 24, 6);
        // Golden tassel
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(24, 54);
        ctx.lineTo(24, 64);
        ctx.stroke();
      });

      // 9. Cherry Blossom Tree
      makeCanvas('cherry_tree', 110, 120, (ctx) => {
        // Trunk
        ctx.fillStyle = '#5c3d2e';
        ctx.beginPath();
        ctx.moveTo(50, 120);
        ctx.lineTo(46, 75);
        ctx.lineTo(40, 50);
        ctx.lineTo(60, 50);
        ctx.lineTo(58, 75);
        ctx.lineTo(64, 120);
        ctx.fill();
        // Foliage pink clouds
        ctx.fillStyle = '#f472b6';
        ctx.beginPath();
        ctx.arc(52, 45, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.arc(36, 40, 26, 0, Math.PI * 2);
        ctx.arc(68, 38, 28, 0, Math.PI * 2);
        ctx.arc(52, 22, 24, 0, Math.PI * 2);
        ctx.fill();
      });

      // 10. Sports Court Lines (Tennis / Basketball)
      makeCanvas('sports_court', 240, 160, (ctx) => {
        ctx.fillStyle = '#059669'; // Green court
        ctx.fillRect(0, 0, 240, 160);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, 220, 140);
        // Net line
        ctx.beginPath();
        ctx.moveTo(120, 10);
        ctx.lineTo(120, 150);
        ctx.stroke();
        // Center circle
        ctx.beginPath();
        ctx.arc(120, 80, 26, 0, Math.PI * 2);
        ctx.stroke();
      });

      // 11. Player Sprites (Walk 4 directions)
      const drawCharacter = (key, shirtColor, hairColor, hasGlasses) => {
        makeCanvas(key, 32, 44, (ctx) => {
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(16, 40, 12, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          // Legs
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(10, 28, 5, 12);
          ctx.fillRect(17, 28, 5, 12);
          // Shoes
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(9, 38, 6, 4);
          ctx.fillRect(17, 38, 6, 4);
          // Torso / Shirt
          ctx.fillStyle = shirtColor;
          ctx.fillRect(8, 16, 16, 14);
          // Head
          ctx.fillStyle = '#ffd1a4';
          ctx.beginPath();
          ctx.arc(16, 11, 8, 0, Math.PI * 2);
          ctx.fill();
          // Hair
          ctx.fillStyle = hairColor;
          ctx.beginPath();
          ctx.arc(16, 8, 8, Math.PI, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(8, 8, 16, 4);
          // Face details
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(13, 11, 2, 2); // left eye
          ctx.fillRect(17, 11, 2, 2); // right eye
          if (hasGlasses) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1;
            ctx.strokeRect(11, 9, 5, 5);
            ctx.strokeRect(16, 9, 5, 5);
          }
        });
      };

      // Characters
      drawCharacter('player_sprite', '#b91c1c', '#1f1d1a', false); // Player: Vermilion jacket
      drawCharacter('npc_guide', '#0284c7', '#334155', true);      // Li Minghua: Blue vest & glasses
      drawCharacter('npc_traveler', '#15803d', '#451a03', false);  // Wang Kaiwen: Green jacket
      drawCharacter('npc_female', '#db2777', '#0f172a', false);    // Chen Yuemei / Zhang Yijun: Pink/Coral
      drawCharacter('npc_student', '#d97706', '#172554', false);   // Tianzhong / Ma Antong: Amber shirt
      drawCharacter('npc_bairuyu', '#7c3aed', '#78350f', false);   // Bai Ruyu: Purple coat

      // 12. Floating Petal
      makeCanvas('petal', 8, 8, (ctx) => {
        ctx.fillStyle = '#f472b6';
        ctx.beginPath();
        ctx.ellipse(4, 4, 4, 2, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    /* ── Atmospheric Cherry Blossom Petals ──────────────── */
    createPetalAtmosphere() {
      this.petals = [];
      for (let i = 0; i < 24; i++) {
        const petal = this.add.image(
          Phaser.Math.Between(0, 1024),
          Phaser.Math.Between(0, 640),
          'petal'
        );
        petal.setAlpha(Phaser.Math.FloatBetween(0.4, 0.85));
        petal.setScale(Phaser.Math.FloatBetween(0.7, 1.3));
        petal.speedX = Phaser.Math.FloatBetween(0.4, 1.2);
        petal.speedY = Phaser.Math.FloatBetween(0.6, 1.6);
        petal.rotSpeed = Phaser.Math.FloatBetween(0.01, 0.03);
        petal.setDepth(99);
        this.petals.push(petal);
      }
    }

    /* ── Map Setup per Chapter ─────────────────────────── */
    setupChapter(chapterData, seqIndex) {
      // Clear existing entities
      this.groundLayer.clear(true, true);
      this.envLayer.clear(true, true);
      this.npcGroup.clear(true, true);
      this.interactivePrompts.clear(true, true);

      const theme = chapterData.settingTheme || 'courtyard';
      let tileKey = 'tile_courtyard';
      if (theme === 'market') tileKey = 'tile_wood';
      if (theme === 'pavilion') tileKey = 'tile_pavilion';

      // 1. Fill ground tiles (16 x 10 grid of 64px tiles)
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 10; y++) {
          const tile = this.add.image(x * 64 + 32, y * 64 + 32, tileKey);
          tile.setDepth(0);
          this.groundLayer.add(tile);
        }
      }

      // 2. Build map environment matching the chapter theme
      if (theme === 'courtyard') {
        // Top boundary wall
        for (let x = 0; x < 16; x++) {
          if (x !== 7 && x !== 8) { // Gate archway opening in middle
            const wall = this.envLayer.create(x * 64 + 32, 32, 'wall_brick');
            wall.setDepth(2);
          }
        }
        // Left & right border walls
        for (let y = 1; y < 10; y++) {
          const wL = this.envLayer.create(32, y * 64 + 32, 'wall_brick');
          const wR = this.envLayer.create(1024 - 32, y * 64 + 32, 'wall_brick');
          wL.setDepth(2);
          wR.setDepth(2);
        }
        // Koi pond in bottom-left
        const pond = this.envLayer.create(200, 480, 'koi_pond');
        pond.setDepth(1);

        // Tea Pavilion Table in center-right
        const teaTable = this.envLayer.create(750, 280, 'tea_table');
        teaTable.setDepth(1);

        // Cherry trees
        const tree1 = this.add.image(140, 160, 'cherry_tree').setDepth(3);
        const tree2 = this.add.image(890, 460, 'cherry_tree').setDepth(3);

        // Glowing lanterns
        const l1 = this.add.image(416, 70, 'lantern_obj').setDepth(2);
        const l2 = this.add.image(608, 70, 'lantern_obj').setDepth(2);
      } else if (theme === 'market') {
        // Scholar's Home & Market
        // Top bookshelf wall
        for (let x = 0; x < 16; x++) {
          if (x < 6 || x > 9) {
            const shelf = this.envLayer.create(x * 64 + 32, 48, 'bookshelf');
            shelf.setDepth(2);
          }
        }
        // Living room tea table
        const table = this.envLayer.create(512, 300, 'tea_table');
        table.setDepth(1);

        // Photo display & decorative lantern
        const lantern1 = this.add.image(200, 200, 'lantern_obj').setDepth(2);
        const lantern2 = this.add.image(824, 200, 'lantern_obj').setDepth(2);
      } else {
        // Pavilion Sports Court & Campus
        const court = this.add.image(512, 360, 'sports_court').setDepth(1);
        const tree1 = this.add.image(120, 180, 'cherry_tree').setDepth(3);
        const tree2 = this.add.image(900, 180, 'cherry_tree').setDepth(3);
        const l1 = this.add.image(300, 80, 'lantern_obj').setDepth(2);
        const l2 = this.add.image(724, 80, 'lantern_obj').setDepth(2);
      }

      // 3. Create or reposition Player
      if (!this.player) {
        this.player = this.physics.add.sprite(512, 480, 'player_sprite');
        this.player.setCollideWorldBounds(true);
        this.player.setSize(24, 20);
        this.player.setOffset(4, 22);
        this.player.setDepth(10);
      } else {
        this.player.setPosition(512, 480);
      }

      this.physics.add.collider(this.player, this.envLayer);

      // 4. Place current active NPC or Obstacle from the sequence
      const currentItem = chapterData.sequence[seqIndex];
      this.activeInteractable = null;

      if (currentItem) {
        if (currentItem.type === 'dialogue') {
          // Place NPC
          let npcSpriteKey = 'npc_guide';
          if (currentItem.npcNameEn.includes('Wang')) npcSpriteKey = 'npc_traveler';
          else if (currentItem.npcNameEn.includes('Chen') || currentItem.npcNameEn.includes('Zhang')) npcSpriteKey = 'npc_female';
          else if (currentItem.npcNameEn.includes('Tianzhong') || currentItem.npcNameEn.includes('Ma')) npcSpriteKey = 'npc_student';
          else if (currentItem.npcNameEn.includes('Bai')) npcSpriteKey = 'npc_bairuyu';

          const npc = this.npcGroup.create(512, 220, npcSpriteKey);
          npc.setDepth(9);
          npc.itemData = currentItem;
          this.activeInteractable = npc;

          // Indicator badge above NPC
          this.createInteractPrompt(npc, `💬 ${currentItem.npcNameZh} (Talk)`);
        } else if (currentItem.type === 'obstacle') {
          // Place Obstacle object (glowing lantern / scroll / marker)
          let targetX = 512;
          let targetY = 220;
          if (currentItem.locationHintEn.includes('Gate')) { targetX = 512; targetY = 120; }
          else if (currentItem.locationHintEn.includes('Tea')) { targetX = 750; targetY = 240; }
          else if (currentItem.locationHintEn.includes('Bench')) { targetX = 350; targetY = 320; }
          else if (currentItem.locationHintEn.includes('Bookshelf')) { targetX = 300; targetY = 140; }
          else if (currentItem.locationHintEn.includes('Court')) { targetX = 512; targetY = 300; }

          const obj = this.npcGroup.create(targetX, targetY, 'lantern_obj');
          obj.setDepth(9);
          obj.itemData = currentItem;
          this.activeInteractable = obj;

          // Pulsing glow tween
          this.tweens.add({
            targets: obj,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });

          // Indicator badge above obstacle
          this.createInteractPrompt(obj, `⚡ ${currentItem.obstacleTitleEn}`);
        }
      }
    }

    createInteractPrompt(targetSprite, text) {
      const container = this.add.container(targetSprite.x, targetSprite.y - 40);
      container.setDepth(20);

      const bg = this.add.rectangle(0, 0, text.length * 10 + 20, 24, 0x1f1d1a, 0.85);
      bg.setStrokeStyle(1.5, 0xf59e0b);
      const label = this.add.text(0, 0, text, {
        fontFamily: 'Noto Sans SC, sans-serif',
        fontSize: '12px',
        color: '#fef3c7',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      container.add([bg, label]);
      this.interactivePrompts.add(container);

      // Bounce tween
      this.tweens.add({
        targets: container,
        y: container.y - 6,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    update() {
      // Ignore keyboard movement/interaction while a browser form element is focused
      const activeTag = document.activeElement && document.activeElement.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

      // 1. Petals animation
      if (this.petals) {
        this.petals.forEach(p => {
          p.x += p.speedX;
          p.y += p.speedY;
          p.rotation += p.rotSpeed;
          if (p.x > 1050) p.x = -20;
          if (p.y > 660) p.y = -20;
        });
      }

      // Check if any modal is currently open (pause movement)
      const isAnyModalOpen =
        document.getElementById('dialogue-modal').style.display !== 'none' ||
        document.getElementById('challenge-modal').style.display !== 'none' ||
        document.getElementById('try-again-modal').style.display !== 'none' ||
        document.getElementById('chapter-cinema').style.display !== 'none' ||
        document.getElementById('title-screen').style.display !== 'none' ||
        document.getElementById('name-modal').style.display !== 'none' ||
        document.getElementById('graduation-modal').style.display !== 'none' ||
        (document.querySelector('.writing-overlay') && document.querySelector('.writing-overlay').style.display !== 'none') ||
        (document.querySelector('.codex-overlay') && document.querySelector('.codex-overlay').classList.contains('visible'));

      if (isAnyModalOpen || !this.player) {
        if (this.player && this.player.body) {
          this.player.setVelocity(0, 0);
        }
        return;
      }

      // 2. Smooth 8-way player movement (WASD or Arrows)
      const speed = 190;
      let vx = 0;
      let vy = 0;

      if (this.cursors.left.isDown || this.wasd.left.isDown) vx -= speed;
      if (this.cursors.right.isDown || this.wasd.right.isDown) vx += speed;
      if (this.cursors.up.isDown || this.wasd.up.isDown) vy -= speed;
      if (this.cursors.down.isDown || this.wasd.down.isDown) vy += speed;

      // Normalize diagonal speed
      if (vx !== 0 && vy !== 0) {
        vx *= 0.7071;
        vy *= 0.7071;
      }

      this.player.setVelocity(vx, vy);

      // Footstep sound on movement
      if ((vx !== 0 || vy !== 0) && Phaser.Math.Between(0, 20) === 0) {
        SoundFX.playFootstep();
      }

      // 3. Proximity Check for Active Interactable
      if (this.activeInteractable) {
        const dist = Phaser.Math.Distance.Between(
          this.player.x, this.player.y,
          this.activeInteractable.x, this.activeInteractable.y
        );

        const isInteracting =
          Phaser.Input.Keyboard.JustDown(this.wasd.space) ||
          Phaser.Input.Keyboard.JustDown(this.wasd.enter) ||
          (this.input.activePointer.isDown && dist < 120);

        if (dist < 90 && isInteracting) {
          const item = this.activeInteractable.itemData;
          if (item) {
            if (item.type === 'dialogue') {
              Game.triggerDialogue(item);
            } else if (item.type === 'obstacle') {
              Game.triggerObstacleChallenge(item);
            }
          }
        }
      }
    }
  }

  // Auto-boot Game on window load
  window.addEventListener('DOMContentLoaded', () => {
    window.GameApp = Game;
    Game.init();
  });
})();
