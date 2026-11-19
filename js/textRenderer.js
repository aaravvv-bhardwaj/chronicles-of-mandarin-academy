/**
 * textRenderer.js — Centralized Chinese text formatter
 * Handles pinyin display, English translations, external-word highlighting,
 * clickable Chinese lookup spans, and Mandarin pronunciation audio.
 */
window.TextRenderer = (function () {
  'use strict';

  /* ─── constants ─── */

  var HANZI_RE = /[㐀-䶿一-鿿]/;

  /* ─── helpers ─── */

  /** Look up a hanzi string in the vocabulary and return its pinyin, or '' */
  function _pinyinFor(hanzi) {
    var vocab = (window.GAME_DATA && window.GAME_DATA.vocabulary) || [];
    for (var i = 0; i < vocab.length; i++) {
      if (vocab[i].hanzi === hanzi) return vocab[i].pinyin;
    }
    return '';
  }

  /** Return the current external-words list (always an array). */
  function _externals() {
    return (window.GAME_DATA && window.GAME_DATA.externalWordsList) || [];
  }

  /** Unique vocab hanzi words, longest-first, for greedy segmentation. */
  function _vocabHanziWords() {
    var vocab = (window.GAME_DATA && window.GAME_DATA.vocabulary) || [];
    var seen = {};
    var out = [];
    for (var i = 0; i < vocab.length; i++) {
      var h = vocab[i].hanzi;
      if (h && !seen[h]) {
        seen[h] = true;
        out.push(h);
      }
    }
    return out.sort(function (a, b) {
      return b.length - a.length;
    });
  }

  /** Sort external words longest-first so greedy replacement doesn't
   *  consume a shorter substring before a longer one gets a chance. */
  function _sortedExternals() {
    return _externals().slice().sort(function (a, b) {
      return b.length - a.length;
    });
  }

  /** Minimal HTML-escaper for user-facing text. */
  function _escHtml(s) {
    if (!s) return '';
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─── clickable Chinese word/character wrapping ─── */

  /**
   * Wrap a run of only-Hanzi characters in clickable spans, segmenting into
   * whole vocabulary words where possible so a click resolves to a real entry.
   * Leftover characters fall back to single-character spans.
   */
  function _wrapRun(run) {
    var words = _vocabHanziWords();
    var out = '';
    var i = 0;
    while (i < run.length) {
      var matched = false;
      for (var w = 0; w < words.length; w++) {
        var word = words[w];
        if (run.slice(i, i + word.length) === word) {
          out +=
            '<span class="clickable-zh" data-zh="' +
            _escAttr(word) +
            '" onclick="event.stopPropagation(); window.TextRenderer.lookupChinese(this.getAttribute(\'data-zh\'), this)">' +
            _escHtml(word) +
            '</span>';
          i += word.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        out +=
          '<span class="clickable-zh" data-zh="' +
          _escAttr(run[i]) +
          '" onclick="event.stopPropagation(); window.TextRenderer.lookupChinese(this.getAttribute(\'data-zh\'), this)">' +
          _escHtml(run[i]) +
          '</span>';
        i++;
      }
    }
    return out;
  }

  /**
   * Walk `text`, escaping non-Hanzi runs and wrapping every Hanzi run in
   * clickable spans (vocab-word segmented). Returns HTML.
   */
  function _wrapChineseInText(text) {
    if (!text) return '';
    var out = '';
    var i = 0;
    var len = text.length;
    while (i < len) {
      if (HANZI_RE.test(text[i])) {
        var j = i;
        while (j < len && HANZI_RE.test(text[j])) j++;
        out += _wrapRun(text.slice(i, j));
        i = j;
      } else {
        var j = i;
        while (j < len && !HANZI_RE.test(text[j])) j++;
        out += _escHtml(text.slice(i, j));
        i = j;
      }
    }
    return out;
  }

  function _escAttr(s) {
    return _escHtml(s);
  }

  /* ─── core: external-word highlighting + clickable wrapping ─── */

  /**
   * Scan `text` for any word in externalWordsList and wrap every
   * occurrence in a gold-highlighted span with permanent pinyin.
   * All other Chinese is wrapped in clickable lookup spans.
   * Returns an HTML string.
   */
  function highlightExternalWords(text) {
    var words = _sortedExternals();
    if (!words.length) return _wrapChineseInText(text);

    // Build a combined regex — escape each word for regex safety
    var escaped = words.map(function (w) {
      return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    var re = new RegExp('(' + escaped.join('|') + ')', 'g');

    // Split on matches, preserving delimiters
    var parts = text.split(re);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (words.indexOf(seg) !== -1) {
        var py = _pinyinFor(seg);
        out +=
          '<span class="external-word clickable-zh" data-zh="' +
          _escAttr(seg) +
          '" onclick="event.stopPropagation(); window.TextRenderer.lookupChinese(this.getAttribute(\'data-zh\'), this)">' +
          _escHtml(seg) +
          '<span class="external-pinyin">' + _escHtml(py) + '</span>' +
          '</span>';
      } else {
        out += _wrapChineseInText(seg);
      }
    }
    return out;
  }

  /* ─── pronunciation (Web Speech API) ─── */

  var _speakingBtn = null;

  function _clearSpeakingHighlight() {
    if (_speakingBtn) {
      _speakingBtn.classList.remove('speaking');
      _speakingBtn = null;
    }
  }

  /**
   * Pick the best Mandarin voice for synthesis.
   * Filters all Chinese voices and strictly prioritizes offline local voices
   * (v.localService === true), preferring zh-TW or zh-CN. Falls back to cloud
   * voices only when no local Chinese voice exists.
   * @returns {SpeechSynthesisVoice|null}
   */
  function _pickChineseVoice() {
    var voices = window.speechSynthesis.getVoices() || [];
    var chinese = voices.filter(function (v) {
      return String(v.lang || '').toLowerCase().startsWith('zh');
    });

    var local = chinese.filter(function (v) {
      return v.localService === true;
    });
    var cloud = chinese.filter(function (v) {
      return v.localService !== true;
    });

    /** Among a list of voices, prefer zh-TW / zh-CN, else the first. */
    var best = function (list) {
      for (var i = 0; i < list.length; i++) {
        var lang = String(list[i].lang || '').toLowerCase();
        if (lang === 'zh-tw' || lang === 'zh-cn') return list[i];
      }
      return list[0];
    };

    return best(local) || best(cloud) || null;
  }

  /** Play a pleasant soft two-note chime via the Web Audio API. */
  function _playOfflineChime() {
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      var ctx = new AudioContext();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }

  /** Show a subtle non-intrusive toast tooltip that fades away on its own. */
  function _showToast(message) {
    var el = document.createElement('div');
    el.className = 'voice-toast';
    el.textContent = message;
    el.style.opacity = '0';
    document.body.appendChild(el);
    // Kick into view, then fade out and remove after a short delay.
    requestAnimationFrame(function () {
      el.style.opacity = '1';
      setTimeout(function () {
        el.style.opacity = '0';
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
      }, 2200);
    });
  }

  /**
   * Speak Mandarin text via window.speechSynthesis.
   * Prefers offline local zh-TW / zh-CN voices at rate 0.85, cancels
   * overlapping speech, and briefly highlights the active button while
   * speaking. On synthesis failure (e.g. no offline voice pack installed),
   * plays a soft chime and shows a subtle toast instead of failing silently.
   *
   * @param {string} text      Chinese text to speak
   * @param {Element} buttonEl the 🔊 button being spoken (highlighted)
   */
  function speakChinese(text, buttonEl) {
    if (!window.speechSynthesis || !text) return;

    window.speechSynthesis.cancel();
    _clearSpeakingHighlight();

    var utter = new SpeechSynthesisUtterance(String(text));
    utter.lang = 'zh-TW';
    utter.rate = 0.85;

    var voice = _pickChineseVoice();
    if (voice) utter.voice = voice;

    if (buttonEl) {
      buttonEl.classList.add('speaking');
      _speakingBtn = buttonEl;
    }

    utter.onend = function () {
      _clearSpeakingHighlight();
    };

    utter.onerror = function () {
      _clearSpeakingHighlight();
      _playOfflineChime();
      _showToast('Offline voice pack not installed on this PC — connect Wi-Fi for cloud voice');
    };

    window.speechSynthesis.speak(utter);
  }

  /* ─── click-to-lookup (Codex) ─── */

  /**
   * Handle a click on a Chinese word/character: briefly pulse the clicked
   * span, then open the Codex to the Vocabulary tab and filter to the entry.
   *
   * @param {string} hanzi   the clicked Chinese text
   * @param {Element} el     the clicked span (for visual pulse)
   */
  function lookupChinese(hanzi, el) {
    if (!hanzi) return;
    if (el) {
      el.classList.add('clickable-zh--active');
      setTimeout(function () {
        el.classList.remove('clickable-zh--active');
      }, 300);
    }
    if (window.Codex) {
      window.Codex.openToEntry(hanzi);
    }
  }

  /* ─── public API: formatters ─── */

  /**
   * formatText — generic formatter.
   * @param {string} text        Chinese text to render
   * @param {object} [options]   { showPinyin, pinyinText, showEnglish, englishText }
   * @returns {string} HTML
   */
  function formatText(text, options) {
    var opts = options || {};
    var html = '<span class="cn-text">' + highlightExternalWords(text) + '</span>';

    if (opts.showPinyin && opts.pinyinText) {
      html += '<span class="pinyin-text">' + _escHtml(opts.pinyinText) + '</span>';
    }
    if (opts.showEnglish && opts.englishText) {
      html += '<span class="en-text">' + _escHtml(opts.englishText) + '</span>';
    }

    return '<span class="formatted-text">' + html + '</span>';
  }

  /**
   * formatDialogue — renders a single dialogue line.
   * Large Chinese text with dimmer pinyin underneath;
   * English hidden behind a toggle.
   *
   * @param {object} line  { speakerZh, speakerPinyin, textZh, textPinyin, textEn }
   * @returns {string} HTML
   */
  function formatDialogue(line) {
    var id = 'dlg_' + Math.random().toString(36).substr(2, 8);

    var html = '<div class="dialogue-line">';

    // Speaker label
    html +=
      '<div class="dialogue-speaker">' +
        '<span class="speaker-zh">' + _escHtml(line.speakerZh) + '</span>' +
        '<span class="speaker-pinyin">' + _escHtml(line.speakerPinyin) + '</span>' +
      '</div>';

    // Main Chinese text (24px+) — clickable + external-word highlighted
    html +=
      '<div class="dialogue-body">' + highlightExternalWords(line.textZh) + '</div>';

    // Pinyin (slightly dimmer, always visible by default)
    html +=
      '<div class="dialogue-pinyin">' + _escHtml(line.textPinyin) + '</div>';

    // English translation — hidden by default, toggled via button
    html +=
      '<div class="dialogue-en" id="' + id + '" style="display:none;">' +
        _escHtml(line.textEn) +
      '</div>';
    html +=
      '<button class="toggle-en-btn" onclick="(function(){ ' +
        'var el=document.getElementById(\'' + id + '\'); ' +
        'var btn=el.nextElementSibling||el.previousElementSibling; ' +
        'if(el.style.display===\'none\'){el.style.display=\'block\';this.textContent=\'[Hide English]\';} ' +
        'else{el.style.display=\'none\';this.textContent=\'[Show English Translation]\';} ' +
      '}).call(this)">[Show English Translation]</button>';

    html += '</div>';
    return html;
  }

  /**
   * formatQuestion — Chinese characters only (no pinyin, no English),
   * except external words still appear gold with pinyin.
   * Includes a 🔊 pronunciation button.
   *
   * @param {string} questionZh
   * @returns {string} HTML
   */
  function formatQuestion(questionZh) {
    return (
      '<span class="question-row">' +
        '<span class="question-text">' +
        highlightExternalWords(questionZh) +
        '</span>' +
        '<button class="q-speak-btn speak-btn" data-speak="' +
        _escAttr(questionZh) +
        '" onclick="window.TextRenderer.speakChinese(this.getAttribute(\'data-speak\'), this)">🔊</button>' +
      '</span>'
    );
  }

  /**
   * formatOption — Chinese-only answer button content,
   * with external words highlighted. Includes a 🔊 pronunciation button
   * that uses event.stopPropagation() so it never triggers answer selection.
   *
   * @param {string} optionText
   * @returns {string} HTML
   */
  function formatOption(optionText) {
    return (
      '<span class="option-row">' +
        '<span class="option-text">' +
        highlightExternalWords(optionText) +
        '</span>' +
        '<button class="option-speak-btn speak-btn" data-speak="' +
        _escAttr(optionText) +
        '" onclick="event.stopPropagation(); window.TextRenderer.speakChinese(this.getAttribute(\'data-speak\'), this)">🔊</button>' +
      '</span>'
    );
  }

  /* ─── expose ─── */
  return {
    formatText: formatText,
    formatDialogue: formatDialogue,
    formatQuestion: formatQuestion,
    formatOption: formatOption,
    highlightExternalWords: highlightExternalWords,
    speakChinese: speakChinese,
    lookupChinese: lookupChinese
  };
})();
