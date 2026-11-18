/* =========================================================
   codex.js — Always-accessible Dictionary & Grammar Book
   ========================================================= */
window.Codex = (function () {
  'use strict';

  let overlay = null;
  let isOpen = false;
  let currentTab = 'vocab';       // 'vocab' | 'grammar'
  let currentLesson = 0;          // 0 = All
  let searchTerm = '';
  let lastPulseEl = null;
  let strokePopup = null;
  let strokeWriter = null;

  /* ── helpers ─────────────────────────────────────────── */

  function isExternalWord(item) {
    if (item.isExternal) return true;
    const ext = window.GAME_DATA && window.GAME_DATA.externalWordsList;
    return Array.isArray(ext) && ext.includes(item.hanzi);
  }

  function normalise(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')   // strip combining diacritics for search
      .trim();
  }

  function matchesSearch(item) {
    if (!searchTerm) return true;
    const q = normalise(searchTerm);
    return (
      item.hanzi.includes(searchTerm) ||            // exact hanzi
      normalise(item.pinyin).includes(q) ||
      normalise(item.meaning).includes(q)
    );
  }

  function matchesLesson(item) {
    return currentLesson === 0 || item.lesson === currentLesson;
  }

  function getLessonName(lessonNum) {
    switch (lessonNum) {
      case 1: return 'Lesson 1';
      case 2: return 'Lesson 2';
      case 3: return 'Lesson 3';
      default: return 'All';
    }
  }

  /* â”€â”€ stroke-order popup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function showStrokePopup(char, anchorRect) {
    closeStrokePopup();

    strokePopup = document.createElement('div');
    strokePopup.className = 'stroke-popup';

    // Header
    const header = document.createElement('div');
    header.className = 'stroke-popup-header';

    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'display:flex;align-items:baseline;gap:6px;';
    const title = document.createElement('span');
    title.textContent = char;
    title.className = 'stroke-popup-title';
    const subtitle = document.createElement('span');
    subtitle.textContent = 'Stroke Practice';
    subtitle.style.cssText = 'font-size:11px;color:#7a7368;font-weight:500;';
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;font-size:18px;cursor:pointer;color:#7a7368;padding:2px 6px;line-height:1;';
    closeBtn.onclick = closeStrokePopup;
    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    strokePopup.appendChild(header);

    // Target box with traditional calligraphy grid
    const targetBox = document.createElement('div');
    targetBox.className = 'stroke-target-box';
    const writerDiv = document.createElement('div');
    writerDiv.id = 'codex-stroke-target';
    writerDiv.style.cssText = 'width:120px;height:120px;display:flex;justify-content:center;align-items:center;';
    targetBox.appendChild(writerDiv);
    strokePopup.appendChild(targetBox);

    // Status message line
    const statusDiv = document.createElement('div');
    statusDiv.className = 'stroke-popup-status';
    statusDiv.textContent = 'Watching stroke order...';
    strokePopup.appendChild(statusDiv);

    // Control buttons grid
    const controls = document.createElement('div');
    controls.className = 'stroke-popup-controls';

    const animateBtn = document.createElement('button');
    animateBtn.className = 'stroke-popup-btn active';
    animateBtn.innerHTML = '▶ Animate';

    const writeBtn = document.createElement('button');
    writeBtn.className = 'stroke-popup-btn';
    writeBtn.innerHTML = '✍️ Write';
    writeBtn.title = 'Practice writing this character yourself with mouse or touch';

    const outlineBtn = document.createElement('button');
    outlineBtn.className = 'stroke-popup-btn active';
    outlineBtn.innerHTML = 'Outline: ON';
    outlineBtn.title = 'Toggle character outline on or off';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'stroke-popup-btn';
    resetBtn.innerHTML = '🔄 Reset';

    controls.appendChild(animateBtn);
    controls.appendChild(writeBtn);
    controls.appendChild(outlineBtn);
    controls.appendChild(resetBtn);
    strokePopup.appendChild(controls);

    document.body.appendChild(strokePopup);

    // Position popup near anchorRect without overflowing viewport
    const popupWidth = 250;
    const popupHeight = 285;
    let top = (anchorRect && anchorRect.bottom ? anchorRect.bottom + 6 : (window.innerHeight - popupHeight) / 2);
    let left = (anchorRect && anchorRect.left ? anchorRect.left : (window.innerWidth - popupWidth) / 2);

    if (top + popupHeight > window.innerHeight) {
      top = Math.max(10, (anchorRect ? anchorRect.top - popupHeight - 6 : 10));
    }
    if (left + popupWidth > window.innerWidth) {
      left = Math.max(10, window.innerWidth - popupWidth - 20);
    }
    strokePopup.style.top = top + 'px';
    strokePopup.style.left = left + 'px';

    let showOutline = true;

    try {
      strokeWriter = HanziWriter.create('codex-stroke-target', char, {
        width: 120,
        height: 120,
        padding: 5,
        showOutline: true,
        showCharacter: false,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 180,
        strokeColor: '#1f1d1a',
        radicalColor: '#b93a26',
        outlineColor: '#ddd5c7',
        drawingColor: '#b93a26',
        drawingWidth: 16,
        highlightColor: '#f59e0b',
        showHintAfterMisses: 1
      });

      // Default: play stroke order animation
      strokeWriter.animateCharacter({
        onComplete: function () {
          statusDiv.textContent = 'Animation finished. Click Write or Replay.';
        }
      });

      // 1. Animate Button
      animateBtn.onclick = function () {
        animateBtn.classList.add('active');
        writeBtn.classList.remove('active');
        statusDiv.textContent = 'Watching stroke order...';
        statusDiv.style.color = '#7a7368';
        try {
          strokeWriter.cancelQuiz();
          strokeWriter.hideCharacter();
          if (showOutline) strokeWriter.showOutline();
          strokeWriter.animateCharacter({
            onComplete: function () {
              statusDiv.textContent = 'Animation finished. Click Write or Replay.';
            }
          });
        } catch (e) {}
      };

      // 2. Write Yourself Button (Interactive Quiz)
      writeBtn.onclick = function () {
        writeBtn.classList.add('active');
        animateBtn.classList.remove('active');
        statusDiv.textContent = 'Draw each stroke with mouse or touch!';
        statusDiv.style.color = '#b93a26';
        try {
          strokeWriter.cancelQuiz();
          strokeWriter.hideCharacter();
          if (showOutline) {
            strokeWriter.showOutline();
          } else {
            strokeWriter.hideOutline();
          }
          strokeWriter.quiz({
            onMistake: function () {
              statusDiv.textContent = 'Missed stroke — try again!';
              statusDiv.style.color = '#b93a26';
            },
            onCorrectStroke: function () {
              statusDiv.textContent = 'Good stroke! Keep going...';
              statusDiv.style.color = '#2e7d32';
            },
            onComplete: function () {
              statusDiv.textContent = '✔ Well done! Character completed.';
              statusDiv.style.color = '#2e7d32';
            }
          });
        } catch (e) {}
      };

      // 3. Outline Toggle Button
      outlineBtn.onclick = function () {
        showOutline = !showOutline;
        if (showOutline) {
          outlineBtn.textContent = 'Outline: ON';
          outlineBtn.classList.add('active');
          try { strokeWriter.showOutline(); } catch (e) {}
        } else {
          outlineBtn.textContent = 'Outline: OFF';
          outlineBtn.classList.remove('active');
          try { strokeWriter.hideOutline(); } catch (e) {}
        }
      };

      // 4. Reset Button
      resetBtn.onclick = function () {
        try {
          strokeWriter.cancelQuiz();
          strokeWriter.hideCharacter();
          if (showOutline) strokeWriter.showOutline();
          if (writeBtn.classList.contains('active')) {
            writeBtn.click();
          } else {
            statusDiv.textContent = 'Cleared. Ready to practice!';
            statusDiv.style.color = '#7a7368';
          }
        } catch (e) {}
      };

    } catch (e) {
      writerDiv.textContent = char;
      writerDiv.style.cssText += 'font-size:64px;text-align:center;line-height:120px;font-family:"Noto Serif SC",serif;';
      statusDiv.textContent = 'Character preview';
    }
  }

  function closeStrokePopup() {
    if (strokePopup) {
      strokePopup.remove();
      strokePopup = null;
    }
    strokeWriter = null;
  }

  /* â”€â”€ render vocabulary cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function renderVocabCards(container) {
    container.innerHTML = '';
    var vocab = window.GAME_DATA.vocabulary || [];
    var filtered = vocab.filter(function (v) { return matchesLesson(v) && matchesSearch(v); });

    if (filtered.length === 0) {
      var empty = document.createElement('p');
      empty.textContent = 'No results found.';
      empty.style.cssText = 'text-align:center;color:#999;padding:32px;';
      container.appendChild(empty);
      return;
    }

    filtered.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'vocab-card';
      card.id = 'vocab-card-' + item.hanzi;

      /* top row: hanzi + badges */
      var topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';

      var hanziSpan = document.createElement('span');
      hanziSpan.className = 'vocab-hanzi';
      hanziSpan.textContent = item.hanzi;
      hanziSpan.title = 'Click to see stroke order';
      hanziSpan.style.cursor = 'pointer';
      hanziSpan.addEventListener('click', function (e) {
        // animate first character for multi-char words
        var ch = item.hanzi.charAt(0);
        showStrokePopup(ch, e.target.getBoundingClientRect());
      });
      topRow.appendChild(hanziSpan);

      // Speak button for vocab word
      var speakBtn = document.createElement('button');
      speakBtn.className = 'speak-btn';
      speakBtn.innerHTML = '🔊';
      speakBtn.title = 'Speak word';
      speakBtn.onclick = function() { window.TextRenderer.speakChinese(item.hanzi, this); };
      topRow.appendChild(speakBtn);

      // If multi-char, add small char buttons
      if (item.hanzi.length > 1) {
        for (var ci = 0; ci < item.hanzi.length; ci++) {
          (function (charIdx) {
            var charBtn = document.createElement('span');
            charBtn.className = 'vocab-char-btn';
            charBtn.textContent = item.hanzi[charIdx];
            charBtn.title = 'Stroke order: ' + item.hanzi[charIdx];
            charBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              showStrokePopup(item.hanzi[charIdx], e.target.getBoundingClientRect());
            });
            topRow.appendChild(charBtn);
          })(ci);
        }
      }

      var posBadge = document.createElement('span');
      posBadge.className = 'pos-badge pos-' + (item.pos || '').toLowerCase().replace(/\s+/g, '-');
      posBadge.textContent = item.pos || '';
      topRow.appendChild(posBadge);

      if (isExternalWord(item)) {
        var extBadge = document.createElement('span');
        extBadge.className = 'external-badge';
        extBadge.textContent = 'â˜… Bonus / Non-Book Word';
        topRow.appendChild(extBadge);
      }

      card.appendChild(topRow);

      /* pinyin */
      var pinyinDiv = document.createElement('div');
      pinyinDiv.className = 'vocab-pinyin';
      pinyinDiv.textContent = item.pinyin;
      card.appendChild(pinyinDiv);

      /* meaning */
      var meaningDiv = document.createElement('div');
      meaningDiv.className = 'vocab-meaning';
      meaningDiv.textContent = item.meaning;
      card.appendChild(meaningDiv);

      /* lesson tag */
      var lessonTag = document.createElement('div');
      lessonTag.className = 'vocab-lesson-tag';
      lessonTag.textContent = 'Lesson ' + item.lesson;
      card.appendChild(lessonTag);

      /* example */
      var exBox = document.createElement('div');
      exBox.className = 'vocab-example';
      var exRow = document.createElement('div');
      exRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
      var exZh = document.createElement('div');
      exZh.className = 'vocab-example-zh';
      exZh.textContent = item.exampleZh;
      exRow.appendChild(exZh);

      // Speak button for example sentence
      var exSpeak = document.createElement('button');
      exSpeak.className = 'speak-btn';
      exSpeak.innerHTML = '🔊';
      exSpeak.title = 'Speak example';
      exSpeak.onclick = function() { window.TextRenderer.speakChinese(item.exampleZh, this); };
      exRow.appendChild(exSpeak);

      exBox.appendChild(exRow);
      var exPy = document.createElement('div');
      exPy.className = 'vocab-example-pinyin';
      exPy.textContent = item.examplePinyin;
      exBox.appendChild(exPy);
      var exEn = document.createElement('div');
      exEn.className = 'vocab-example-en';
      exEn.textContent = item.exampleEn;
      exBox.appendChild(exEn);
      card.appendChild(exBox);

      container.appendChild(card);
    });
  }

  /* â”€â”€ render grammar cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function renderGrammarCards(container) {
    container.innerHTML = '';
    var grammar = window.GAME_DATA.grammar || [];
    var filtered = grammar.filter(function (g) { return matchesLesson(g); });

    if (filtered.length === 0) {
      var empty = document.createElement('p');
      empty.textContent = 'No grammar patterns found.';
      empty.style.cssText = 'text-align:center;color:#999;padding:32px;';
      container.appendChild(empty);
      return;
    }

    filtered.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'grammar-card';

      /* header row */
      var headerRow = document.createElement('div');
      headerRow.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;';

      var idBadge = document.createElement('span');
      idBadge.className = 'grammar-id-badge';
      idBadge.textContent = 'Lesson ' + item.lesson;
      headerRow.appendChild(idBadge);

      var titleSpan = document.createElement('span');
      titleSpan.className = 'grammar-title';
      titleSpan.textContent = item.title;
      headerRow.appendChild(titleSpan);

      card.appendChild(headerRow);

      /* formula box */
      var formulaBox = document.createElement('div');
      formulaBox.className = 'grammar-formula';
      formulaBox.textContent = item.patternFormula;
      card.appendChild(formulaBox);

      /* explanation */
      var explDiv = document.createElement('div');
      explDiv.className = 'grammar-explanation';
      explDiv.textContent = item.explanation;
      card.appendChild(explDiv);

      /* examples */
      if (item.examples && item.examples.length > 0) {
        var exSection = document.createElement('div');
        exSection.className = 'grammar-examples';
        var exLabel = document.createElement('div');
        exLabel.className = 'grammar-examples-label';
        exLabel.textContent = 'Examples';
        exSection.appendChild(exLabel);

        item.examples.forEach(function (ex) {
          var exItem = document.createElement('div');
          exItem.className = 'grammar-example-item';
          var zhLine = document.createElement('div');
          zhLine.className = 'grammar-ex-zh';
          zhLine.textContent = ex.zh;
          zhLine.style.cssText = 'display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;';
          var pyLine = document.createElement('div');
          pyLine.className = 'grammar-ex-pinyin';
          pyLine.textContent = ex.pinyin;
          var enLine = document.createElement('div');
          enLine.className = 'grammar-ex-en';
          enLine.textContent = ex.en;

          // Speak button for grammar example sentence
          var exSpeak = document.createElement('button');
          exSpeak.className = 'speak-btn';
          exSpeak.innerHTML = '🔊';
          exSpeak.title = 'Speak example';
          exSpeak.onclick = function() { window.TextRenderer.speakChinese(ex.zh, this); };
          zhLine.appendChild(exSpeak);

          exItem.appendChild(zhLine);
          exItem.appendChild(pyLine);
          exItem.appendChild(enLine);
          exSection.appendChild(exItem);
        });

        card.appendChild(exSection);
      }

      container.appendChild(card);
    });
  }

  /* â”€â”€ build the entire DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function buildDOM() {
    overlay = document.createElement('div');
    overlay.className = 'codex-overlay';
    overlay.style.display = 'none';

    var modal = document.createElement('div');
    modal.className = 'codex-modal';

    /* — header — */
    var header = document.createElement('div');
    header.className = 'codex-header';

    var titleEl = document.createElement('h2');
    titleEl.className = 'codex-title';
    titleEl.innerHTML = '📖 <span style="font-family:\'Noto Serif SC\',serif;">典籍</span> Codex';
    header.appendChild(titleEl);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'codex-close-btn';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Close Codex';
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);

    modal.appendChild(header);

    /* — tabs — */
    var tabBar = document.createElement('div');
    tabBar.className = 'codex-tab-bar';

    var vocabTab = document.createElement('button');
    vocabTab.className = 'codex-tab-btn active';
    vocabTab.textContent = '词语 Vocabulary';
    vocabTab.dataset.tab = 'vocab';

    var grammarTab = document.createElement('button');
    grammarTab.className = 'codex-tab-btn';
    grammarTab.textContent = '语法 Grammar';
    grammarTab.dataset.tab = 'grammar';

    tabBar.appendChild(vocabTab);
    tabBar.appendChild(grammarTab);
    modal.appendChild(tabBar);

    /* — controls — */
    var controls = document.createElement('div');
    controls.className = 'codex-controls';

    // search
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'codex-search';
    searchInput.placeholder = 'Search by Hanzi, Pinyin, or English...';
    searchInput.id = 'codex-search-input';
    controls.appendChild(searchInput);

    // lesson filters
    var filterRow = document.createElement('div');
    filterRow.className = 'codex-filter-row';
    var lessons = [
      { label: 'All', value: 0 },
      { label: 'Lesson 1', value: 1 },
      { label: 'Lesson 2', value: 2 },
      { label: 'Lesson 3', value: 3 }
    ];
    lessons.forEach(function (l) {
      var btn = document.createElement('button');
      btn.className = 'codex-filter-btn' + (l.value === 0 ? ' active' : '');
      btn.textContent = l.label;
      btn.dataset.lesson = l.value;
      filterRow.appendChild(btn);
    });
    controls.appendChild(filterRow);

    modal.appendChild(controls);

    /* — content area — */
    var contentArea = document.createElement('div');
    contentArea.className = 'codex-content';
    contentArea.id = 'codex-content-area';
    modal.appendChild(contentArea);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    /* —— event wiring —— */

    // close on overlay click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    // tabs
    tabBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.codex-tab-btn');
      if (!btn) return;
      currentTab = btn.dataset.tab;
      tabBar.querySelectorAll('.codex-tab-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      // show/hide search for grammar tab
      searchInput.style.display = currentTab === 'grammar' ? 'none' : '';

      refresh();
    });

    // lesson filter
    filterRow.addEventListener('click', function (e) {
      var btn = e.target.closest('.codex-filter-btn');
      if (!btn) return;
      currentLesson = parseInt(btn.dataset.lesson, 10);
      filterRow.querySelectorAll('.codex-filter-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      refresh();
    });

    // search
    var searchDebounce = null;
    searchInput.addEventListener('input', function () {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(function () {
        searchTerm = searchInput.value;
        refresh();
      }, 180);
    });

    // keyboard
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation();
        close();
      }
    });
  }

  /* â”€â”€ refresh visible content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function refresh() {
    var area = document.getElementById('codex-content-area');
    if (!area) return;
    closeStrokePopup();

    if (currentTab === 'vocab') {
      renderVocabCards(area);
    } else {
      renderGrammarCards(area);
    }
  }

  /* â”€â”€ public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

  function open() {
    if (!overlay) init();
    if (!overlay) return;
    isOpen = true;
    overlay.style.display = 'flex';
    // force reflow then add class for transition
    overlay.offsetHeight;           // eslint-disable-line no-unused-expressions
    overlay.classList.add('visible');
    refresh();
  }

  function close() {
    if (!overlay) return;
    isOpen = false;
    closeStrokePopup();
    overlay.classList.remove('visible');
    setTimeout(function () {
      if (!isOpen) overlay.style.display = 'none';
    }, 300);
  }

  function toggle() {
    if (isOpen) close(); else open();
  }

  /**
   * Open the Codex to the Vocabulary tab, reset the lesson filter to All,
   * filter/scroll directly to the matching vocabulary entry, with a pulse highlight.
   */
  function openToEntry(hanzi) {
    currentTab = 'vocab';
    currentLesson = 0;
    // Set via the real input so search state stays in sync with the UI,
    // letting the user clear it cleanly afterward.
    var si = document.getElementById('codex-search-input');
    if (si) {
      si.value = hanzi;
      si.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      searchTerm = hanzi;
    }
    open();
    setTimeout(function () {
      var area = document.getElementById('codex-content-area');
      var target = document.getElementById('vocab-card-' + hanzi);
      if (!area || !target) return;
      if (lastPulseEl && lastPulseEl !== target) {
        lastPulseEl.classList.remove('pulse-highlight');
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('pulse-highlight');
      lastPulseEl = target;
    }, 0);
  }

  function init() {
    if (overlay) return;            // already initialised
    buildDOM();
  }

  return {
    init: init,
    open: open,
    close: close,
    toggle: toggle,
    openToEntry: openToEntry
  };
})();


