/**
 * WritingBox.js
 * Multi-character continuous notebook Hanzi Writer system with 2-pass mastery verification
 */

(function() {
  'use strict';

  const WritingBox = {
    overlay: null,
    panel: null,
    notebook: null,
    onCompleteCallback: null,
    targetAnswer: '',
    writers: [],
    currentCharIndex: 0,
    pass1Complete: false,
    pass2Complete: false,
    guidedMode: true, // true = outlines ON, false = outlines OFF

    init() {
      // Create DOM structure
      this.overlay = document.createElement('div');
      this.overlay.className = 'writing-overlay';
      this.overlay.style.display = 'none';

      this.panel = document.createElement('div');
      this.panel.className = 'writing-panel';

      // Title area
      const titleDiv = document.createElement('div');
      titleDiv.className = 'writing-title';
      titleDiv.innerHTML = '<h2>Calligraphy Practice</h2><div class="writing-target"></div>';
      this.panel.appendChild(titleDiv);

      // Toggle button
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'writing-toggle writing-btn';
      toggleBtn.innerHTML = 'Outlines & Stroke Animation: <span class="toggle-state">ON</span>';
      toggleBtn.addEventListener('click', () => this.toggleMode());
      this.panel.appendChild(toggleBtn);

      // Progress badges
      const badgesDiv = document.createElement('div');
      badgesDiv.className = 'writing-badges';
      badgesDiv.innerHTML = `
        <div class="writing-badge" data-step="1">
          <span class="badge-icon">○</span> Step 1: Guided Writing (Outlines & Animation ON)
        </div>
        <div class="writing-badge" data-step="2">
          <span class="badge-icon">○</span> Step 2: Memory Writing (Outlines & Animation OFF)
        </div>
      `;
      this.panel.appendChild(badgesDiv);

      // Notebook container
      this.notebook = document.createElement('div');
      this.notebook.className = 'writing-notebook';
      this.panel.appendChild(this.notebook);

      // Action buttons
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'writing-actions';

      const resetBtn = document.createElement('button');
      resetBtn.className = 'writing-btn';
      resetBtn.textContent = 'Reset / Erase';
      resetBtn.addEventListener('click', () => this.resetCurrentPass());

      const autoBtn = document.createElement('button');
      autoBtn.className = 'writing-btn writing-btn-demo';
      autoBtn.innerHTML = '⚡ Auto-Solve (Demo)';
      autoBtn.title = 'Instantly complete both guided and memory passes';
      autoBtn.addEventListener('click', () => this.autoCompleteCurrent());

      const continueBtn = document.createElement('button');
      continueBtn.className = 'writing-btn writing-btn-primary disabled';
      continueBtn.textContent = 'Continue Journey';
      continueBtn.dataset.continueBtn = 'true';
      continueBtn.addEventListener('click', () => this.completeAndClose());

      actionsDiv.appendChild(resetBtn);
      actionsDiv.appendChild(autoBtn);
      actionsDiv.appendChild(continueBtn);
      this.panel.appendChild(actionsDiv);

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'writing-close';
      closeBtn.innerHTML = '×';
      closeBtn.addEventListener('click', () => this.close());
      this.panel.appendChild(closeBtn);

      this.overlay.appendChild(this.panel);
      document.body.appendChild(this.overlay);
    },

    open(targetAnswerZh, onComplete) {
      if (!this.overlay) {
        this.init();
      }
      this.targetAnswer = targetAnswerZh;
      this.onCompleteCallback = onComplete;
      this.pass1Complete = false;
      this.pass2Complete = false;
      this.guidedMode = true;
      this.currentCharIndex = 0;

      // Update title
      const targetDiv = this.panel.querySelector('.writing-target');
      targetDiv.textContent = targetAnswerZh;

      // Reset badges
      this.updateBadge(1, false);
      this.updateBadge(2, false);
      this.updateContinueButton();

      // Reset toggle
      const toggleState = this.panel.querySelector('.toggle-state');
      toggleState.textContent = 'ON';

      // Create character cells
      this.createNotebook();

      this.overlay.style.display = 'flex';

      // Demo mode auto-complete
      if (window.__DEMO_AUTO_COMPLETE) {
        setTimeout(() => {
          this.autoCompleteCurrent();
        }, 200);
      }
    },

    close() {
      this.overlay.style.display = 'none';
      this.cleanupWriters();
      this.notebook.innerHTML = '';
    },

    createNotebook() {
      this.notebook.innerHTML = '';
      this.writers = [];
      this.currentCharIndex = 0;

      const chars = Array.from(this.targetAnswer);
      const punctuation = ['。', '？', '！', '，', '、', '：', '；', '?', '!', ',', '.'];

      chars.forEach((char, index) => {
        const cell = document.createElement('div');
        cell.className = 'writing-cell';
        cell.dataset.index = index;

        if (punctuation.includes(char)) {
          // Static punctuation display
          cell.classList.add('punctuation');
          cell.textContent = char;
          this.writers.push(null); // placeholder
        } else {
          // Create HanziWriter instance
          const writerDiv = document.createElement('div');
          writerDiv.className = 'hanzi-writer-cell';
          cell.appendChild(writerDiv);

          this.writers.push({
            element: writerDiv,
            char: char,
            writer: null,
            completed: false
          });
        }

        this.notebook.appendChild(cell);
      });

      // Initialize writers after DOM is ready
      setTimeout(() => {
        this.initializeWriters();
        this.startQuiz();
      }, 100);
    },

    initializeWriters() {
      this.writers.forEach((writerObj, index) => {
        if (!writerObj) return; // skip punctuation

        const options = {
          width: 120,
          height: 120,
          padding: 5,
          showOutline: this.guidedMode,
          showCharacter: false,
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 100,
          highlightOnComplete: true,
          drawingWidth: 20,
          strokeColor: '#333',
          outlineColor: '#DDD',
          highlightColor: '#AAF'
        };

        if (this.guidedMode) {
          options.showHintAfterMisses = 1;
        } else {
          options.showHintAfterMisses = false;
        }

        try {
          writerObj.writer = HanziWriter.create(writerObj.element, writerObj.char, options);
          writerObj.completed = false;
        } catch (e) {
          console.error('HanziWriter creation error:', e);
        }
      });
    },

    startQuiz() {
      // Find first non-punctuation character
      this.currentCharIndex = 0;
      while (this.currentCharIndex < this.writers.length && !this.writers[this.currentCharIndex]) {
        this.currentCharIndex++;
      }

      if (this.currentCharIndex < this.writers.length) {
        this.quizCurrentCharacter();
      }
    },

    quizCurrentCharacter() {
      if (this.currentCharIndex >= this.writers.length) return;

      const writerObj = this.writers[this.currentCharIndex];
      if (!writerObj || !writerObj.writer) {
        this.moveToNextCharacter();
        return;
      }

      // Highlight current cell
      this.highlightCell(this.currentCharIndex);

      writerObj.writer.quiz({
        onMistake: (strokeData) => {
          // Visual feedback handled by HanziWriter highlightOnComplete
        },
        onCorrectStroke: (strokeData) => {
          // Optional: could add sound effect here
        },
        onComplete: (summaryData) => {
          writerObj.completed = true;
          this.markCellCompleted(this.currentCharIndex);
          this.moveToNextCharacter();
        }
      });
    },

    moveToNextCharacter() {
      // Find next non-punctuation character
      this.currentCharIndex++;
      while (this.currentCharIndex < this.writers.length && !this.writers[this.currentCharIndex]) {
        this.currentCharIndex++;
      }

      if (this.currentCharIndex < this.writers.length) {
        this.quizCurrentCharacter();
      } else {
        // All characters completed
        this.handlePassComplete();
      }
    },

    handlePassComplete() {
      if (this.guidedMode && !this.pass1Complete) {
        // Pass 1 completed
        this.pass1Complete = true;
        this.updateBadge(1, true);
        this.updateContinueButton();
        // Keep in guided mode until user toggles
      } else if (!this.guidedMode && !this.pass2Complete) {
        // Pass 2 completed
        this.pass2Complete = true;
        this.updateBadge(2, true);
        this.updateContinueButton();
      }
    },

    resetCurrentPass() {
      this.cleanupWriters();
      this.createNotebook();
    },

    toggleMode() {
      this.guidedMode = !this.guidedMode;
      const toggleState = this.panel.querySelector('.toggle-state');
      toggleState.textContent = this.guidedMode ? 'ON' : 'OFF';

      // If toggling to OFF and pass1 not complete, don't allow
      if (!this.guidedMode && !this.pass1Complete) {
        // Force complete pass 1 first
        this.guidedMode = true;
        toggleState.textContent = 'ON';
        return;
      }

      // Recreate notebook with new mode
      this.cleanupWriters();
      this.createNotebook();
    },

    highlightCell(index) {
      const cells = this.notebook.querySelectorAll('.writing-cell');
      cells.forEach(cell => cell.classList.remove('active'));
      if (cells[index]) {
        cells[index].classList.add('active');
      }
    },

    markCellCompleted(index) {
      const cells = this.notebook.querySelectorAll('.writing-cell');
      if (cells[index]) {
        cells[index].classList.remove('active');
        cells[index].classList.add('completed');
      }
    },

    updateBadge(step, completed) {
      const badge = this.panel.querySelector(`.writing-badge[data-step="${step}"]`);
      if (!badge) return;

      const icon = badge.querySelector('.badge-icon');
      if (completed) {
        badge.classList.add('completed');
        icon.textContent = '✓';
      } else {
        badge.classList.remove('completed');
        icon.textContent = '○';
      }
    },

    updateContinueButton() {
      const continueBtn = this.panel.querySelector('[data-continue-btn]');
      if (!continueBtn) return;

      if (this.pass1Complete && this.pass2Complete) {
        continueBtn.classList.remove('disabled');
      } else {
        continueBtn.classList.add('disabled');
      }
    },

    completeAndClose() {
      if (!this.pass1Complete || !this.pass2Complete) return;

      if (this.onCompleteCallback) {
        this.onCompleteCallback();
      }
      this.close();
    },

    isOpen() {
      return !!(this.overlay && this.overlay.style.display !== 'none');
    },

    autoCompleteCurrent() {
      this.pass1Complete = true;
      this.pass2Complete = true;
      this.updateBadge(1, true);
      this.updateBadge(2, true);

      const performShow = () => {
        this.writers.forEach((w, i) => {
          if (w) {
            w.completed = true;
            if (w.writer) {
              try {
                w.writer.cancelQuiz();
                w.writer.showCharacter();
              } catch (e) {}
            }
            this.markCellCompleted(i);
          }
        });
        this.currentCharIndex = this.writers.length;
        this.updateContinueButton();
      };

      performShow();
      setTimeout(performShow, 120);
      setTimeout(performShow, 260);
    },

    cleanupWriters() {
      this.writers.forEach(writerObj => {
        if (writerObj && writerObj.writer) {
          try {
            writerObj.writer.cancelQuiz();
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      });
      this.writers = [];
    }
  };

  // Expose globally
  window.WritingBox = WritingBox;

})();
