(function () {
  var SUPABASE_URL = 'https://dtwpdqtsigyjzcsqkvgl.supabase.co';
  // Publishable key (same one that ships in the app); read-only through RLS.
  var SUPABASE_KEY = 'sb_publishable_bWwOmivykMW0N7krn6m-ZA_HlvSC-Lc';
  var FETCH_TIMEOUT_MS = 1500;
  var LONG_QUOTE_CHARS = 60;
  var TYPE_CYCLE_MS = 2800;
  var WORD_STAGGER_MS = 70;
  var COPIED_MS = 2000;
  var ENVELOPE_OPEN_MS = 2100;

  var lang = document.documentElement.lang === 'en' ? 'en' : 'tr';
  var LANGUAGES = {
    tr: { da: 'Danca', de: 'Almanca', el: 'Yunanca', en: 'İngilizce', fa: 'Farsça', fr: 'Fransızca', it: 'İtalyanca', la: 'Latince', ru: 'Rusça', zh: 'Çince' },
    en: { da: 'Danish', de: 'German', el: 'Greek', en: 'English', fa: 'Persian', fr: 'French', it: 'Italian', la: 'Latin', ru: 'Russian', zh: 'Chinese' }
  }[lang];

  var motion = 'IntersectionObserver' in window &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (motion) document.documentElement.classList.add('motion');

  function byId(id) { return document.getElementById(id); }

  function clamp(n) { return Math.min(1, Math.max(0, n)); }

  /* ---------- Today's quote ---------- */

  function showDate() {
    byId('date').textContent = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());
  }

  function renderQuote(q) {
    var text = lang === 'en' ? q.content_en : q.content_tr;
    var author = lang === 'en' ? q.author_name_en : q.author_name_tr;
    var source = lang === 'en' ? q.source_en : q.source_tr;
    if (!text || !author) return false;

    var quoteEl = byId('todayQuote');
    quoteEl.textContent = text;
    quoteEl.classList.toggle('is-long', text.length > LONG_QUOTE_CHARS);
    byId('todayAuthor').textContent = author;
    byId('todaySource').textContent = source ? ', ' + source : '';

    // Like the app: show the original unless it is already the reader's language.
    var original = byId('todayOriginal');
    var showOriginal = q.content_original && q.original_language !== lang;
    original.hidden = !showOriginal;
    if (showOriginal) {
      var originalText = byId('originalText');
      originalText.textContent = q.content_original;
      originalText.lang = q.original_language || '';
      originalText.dir = q.original_language === 'fa' ? 'rtl' : 'auto';
      byId('originalLang').textContent = LANGUAGES[q.original_language] || '';
    }
    return true;
  }

  function splitIntoWords(el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach(function (word, i) {
      var span = document.createElement('span');
      span.className = 'word';
      span.style.setProperty('--i', i);
      span.textContent = word;
      el.appendChild(span);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return words.length;
  }

  var revealed = false;

  function reveal() {
    if (revealed) return;
    revealed = true;
    byId('todayFigure').dataset.state = 'ready';
    if (!motion) return;

    var today = document.querySelector('.today');
    var wordCount = splitIntoWords(byId('todayQuote'));
    today.style.setProperty('--after', (wordCount * WORD_STAGGER_MS + 450) + 'ms');
    void today.offsetWidth;
    today.classList.add('play');
  }

  // The markup holds a real fallback quote. If the fetch misses the deadline or
  // fails, it stays, and the label stays generic rather than claiming "today".
  function loadTodayQuote() {
    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
      reveal();
    }, FETCH_TIMEOUT_MS);

    fetch(SUPABASE_URL + '/rest/v1/rpc/quote_of_the_day', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: '{}',
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (rows) {
        var row = Array.isArray(rows) ? rows[0] : rows;
        if (!revealed && row && renderQuote(row)) {
          var label = byId('todayLabel');
          label.textContent = label.dataset.live;
          showDate();
        }
      })
      .catch(function () { /* fallback quote stays */ })
      .finally(function () {
        clearTimeout(timer);
        reveal();
      });
  }

  /* ---------- Philosophical types ---------- */

  function initTypes() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.glyph'));
    var panel = byId('typePanel');
    var big = byId('typeBig');
    var section = byId('typeBig').closest('section');
    var current = 0;
    var touched = false;
    var visible = false;

    function replay(el) {
      el.classList.remove('swap');
      void el.offsetWidth;
      el.classList.add('swap');
    }

    function select(index) {
      current = index;
      var button = buttons[index];
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      byId('typeName').textContent = button.dataset.name;
      byId('typeDesc').textContent = button.dataset.desc;
      big.textContent = button.textContent;
      replay(panel);
      replay(big);
    }

    buttons.forEach(function (button, index) {
      button.addEventListener('click', function () {
        // The reader has taken over: stop cycling and announce changes from here on.
        touched = true;
        panel.setAttribute('aria-live', 'polite');
        select(index);
      });
    });

    if (!motion) return;

    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }, { threshold: 0.35 }).observe(section);

    setInterval(function () {
      if (visible && !touched) select((current + 1) % buttons.length);
    }, TYPE_CYCLE_MS);
  }

  /* ---------- Contact ---------- */

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var field = document.createElement('textarea');
      field.value = text;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      var ok = document.execCommand('copy');
      field.remove();
      if (ok) resolve(); else reject();
    });
  }

  function initContact() {
    var button = byId('copyMail');
    var label = button.textContent;
    var timer = null;
    button.addEventListener('click', function () {
      copyText(button.dataset.mail).then(function () {
        clearTimeout(timer);
        button.textContent = button.dataset.done;
        button.setAttribute('data-copied', '');
        timer = setTimeout(function () {
          button.textContent = label;
          button.removeAttribute('data-copied');
        }, COPIED_MS);
      }, function () {
        // Clipboard refused: leave the address on screen for manual copying.
        window.location.href = 'mailto:' + button.dataset.mail;
      });
    });

    if (!motion) return;
    var envelope = byId('envelope');
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      envelope.classList.add('in');
      io.disconnect();
      // Once it has opened, hover should respond without the opening delay.
      setTimeout(function () { envelope.classList.add('opened'); }, ENVELOPE_OPEN_MS);
    }, { threshold: 0.65 });
    io.observe(envelope);
  }

  /* ---------- Things that play once when they come into view ---------- */

  function maskTitles() {
    document.querySelectorAll('.display').forEach(function (title) {
      var text = title.textContent.trim();
      title.setAttribute('aria-label', text);
      title.textContent = '';
      text.split(/\s+/).forEach(function (word, i, all) {
        var mask = document.createElement('span');
        var inner = document.createElement('span');
        mask.className = 'mask';
        mask.setAttribute('aria-hidden', 'true');
        inner.style.setProperty('--i', i);
        inner.textContent = word;
        mask.appendChild(inner);
        title.appendChild(mask);
        if (i < all.length - 1) title.appendChild(document.createTextNode(' '));
      });
    });
  }

  function countUp(el) {
    var target = Number(el.dataset.to);
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var t = clamp((now - start) / 1600);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(frame);
    }
    el.textContent = '0';
    requestAnimationFrame(frame);
  }

  function initOnView() {
    document.querySelectorAll('.plan').forEach(function (plan) {
      plan.querySelectorAll('li').forEach(function (li, i) { li.style.setProperty('--i', i); });
    });

    var selector = '.display, .lead, .fine, .plans-note, .glyphs, .type-panel, .streak-count, .sheet, .plan, .icons, .closing .badge';
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
        var counter = entry.target.querySelector('[data-to]');
        if (counter) countUp(counter);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll(selector).forEach(function (el) { io.observe(el); });
  }

  /* ---------- Things tied to the scroll position ---------- */

  function initScroll() {
    var risers = Array.prototype.slice.call(document.querySelectorAll('.phone, .sheet')).map(function (el, i) {
      return { el: el, section: el.closest('section'), dir: i % 2 ? -1 : 1 };
    });
    var lines = Array.prototype.slice.call(document.querySelectorAll('.spec-orig')).map(function (el, i) {
      return { el: el, dir: i % 2 ? 1 : -1 };
    });
    var authors = document.querySelector('.authors');
    var names = authors ? Array.prototype.slice.call(authors.children) : [];
    var ticking = false;

    function update() {
      ticking = false;
      var vh = window.innerHeight;

      risers.forEach(function (r) {
        var box = r.section.getBoundingClientRect();
        if (box.bottom < -100 || box.top > vh + 100) return;
        var enter = clamp(1 - box.top / (vh * 0.8));
        var leave = clamp(-box.top / box.height);
        var y = (1 - enter) * 220 - leave * 90;
        var turn = (1 - enter) * 7 * r.dir;
        r.el.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0) rotate(' + turn.toFixed(2) + 'deg)';
      });

      lines.forEach(function (line) {
        var top = line.el.parentElement.getBoundingClientRect().top;
        var p = clamp((vh - top) / (vh * 0.6));
        line.el.style.transform = 'translate3d(' + ((1 - p) * 160 * line.dir).toFixed(1) + 'px,0,0)';
        line.el.style.opacity = (0.1 + p * 0.9).toFixed(2);
      });

      if (authors) {
        var box = authors.getBoundingClientRect();
        var progress = clamp((vh * 0.85 - box.top) / (box.height + vh * 0.15));
        var lit = progress * (names.length + 8);
        names.forEach(function (name, i) {
          name.style.opacity = (0.14 + 0.86 * clamp((lit - i) / 8)).toFixed(2);
        });
      }
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  initTypes();
  initContact();
  loadTodayQuote();

  if (motion) {
    maskTitles();
    initOnView();
    initScroll();
  }
})();
