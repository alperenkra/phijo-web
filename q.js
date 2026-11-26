// One shared quote: q.html?id=<uuid>. The app's "send as link" points here.
// With PhiJo installed the reader jumps to phijo://quote/<id>; without it they
// read the quote and get the store link.
(function () {
  var SUPABASE_URL = 'https://dtwpdqtsigyjzcsqkvgl.supabase.co';
  // Publishable key (same one that ships in the app). shared_quote is a narrow
  // read-only RPC (migration #63); the quotes table itself stays closed to anon.
  var SUPABASE_KEY = 'sb_publishable_bWwOmivykMW0N7krn6m-ZA_HlvSC-Lc';
  var FETCH_TIMEOUT_MS = 6000;
  var LONG_QUOTE_CHARS = 60;
  var UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // The reader's language, not the sender's: the quote carries both.
  var lang = (navigator.language || '').toLowerCase().indexOf('tr') === 0 ? 'tr' : 'en';

  var COPY = {
    tr: {
      label: 'Bir söz',
      open: 'Uygulamada aç',
      lede: 'PhiJo her gün tek bir söz gösteren ücretsiz bir iPhone uygulaması.',
      badgeAlt: "App Store'dan indir",
      store: 'https://apps.apple.com/tr/app/id6774734669',
      missingLabel: 'Söz bulunamadı',
      missing: 'Bu bağlantıdaki söz artık yok ya da bağlantı eksik kopyalanmış.',
      failed: 'Söz yüklenemedi. Bağlantını kontrol edip sayfayı yenile.',
      privacy: 'Gizlilik',
      privacyHref: 'privacy.html',
      homeHref: './',
      title: "PhiJo'dan bir söz"
    },
    en: {
      label: 'A quote',
      open: 'Open in PhiJo',
      lede: 'PhiJo is a free iPhone app that shows you one quote a day.',
      badgeAlt: 'Download on the App Store',
      store: 'https://apps.apple.com/app/id6774734669',
      missingLabel: 'Quote not found',
      missing: 'The quote in this link no longer exists, or the link was cut off when copied.',
      failed: "Couldn't load the quote. Check your connection and refresh.",
      privacy: 'Privacy',
      privacyHref: 'privacy-en.html',
      homeHref: 'index-en.html',
      title: 'A quote from PhiJo'
    }
  }[lang];

  var LANGUAGES = {
    tr: { da: 'Danca', de: 'Almanca', el: 'Yunanca', en: 'İngilizce', fa: 'Farsça', fr: 'Fransızca', it: 'İtalyanca', la: 'Latince', ru: 'Rusça', zh: 'Çince', ar: 'Arapça', he: 'İbranice' },
    en: { da: 'Danish', de: 'German', el: 'Greek', en: 'English', fa: 'Persian', fr: 'French', it: 'Italian', la: 'Latin', ru: 'Russian', zh: 'Chinese', ar: 'Arabic', he: 'Hebrew' }
  }[lang];

  function byId(id) { return document.getElementById(id); }

  function show() { byId('figure').dataset.state = 'ready'; }

  function applyChrome() {
    document.documentElement.lang = lang;
    document.title = COPY.title;
    byId('label').textContent = COPY.label;
    byId('lede').textContent = COPY.lede;
    var badge = byId('badge');
    badge.href = COPY.store;
    badge.querySelector('img').alt = COPY.badgeAlt;
    byId('homeLink').href = COPY.homeHref;
    var privacy = byId('privacyLink');
    privacy.textContent = COPY.privacy;
    privacy.href = COPY.privacyHref;
  }

  function showMessage(label, text) {
    byId('label').textContent = label;
    byId('quote').textContent = text;
    byId('quote').classList.add('is-long');
    // .mark sets display:block, which beats the hidden attribute.
    document.querySelector('.mark').style.display = 'none';
    show();
  }

  function render(q, id) {
    var text = lang === 'en' ? q.content_en || q.content_tr : q.content_tr || q.content_en;
    var author = lang === 'en' ? q.author_name_en || q.author_name_tr : q.author_name_tr || q.author_name_en;
    var source = lang === 'en' ? q.source_en : q.source_tr;
    if (!text) return false;

    var quoteEl = byId('quote');
    quoteEl.textContent = text;
    quoteEl.classList.toggle('is-long', text.length > LONG_QUOTE_CHARS);
    byId('author').textContent = author || '';
    byId('source').textContent = source ? (author ? ', ' : '') + source : '';

    // Like the app: the original sits under the quote unless it is already
    // the reader's language.
    var showOriginal = q.content_original && q.original_language !== lang;
    byId('original').hidden = !showOriginal;
    if (showOriginal) {
      var originalText = byId('originalText');
      originalText.textContent = q.content_original;
      originalText.lang = q.original_language || '';
      originalText.dir = q.original_language === 'fa' || q.original_language === 'ar' || q.original_language === 'he' ? 'rtl' : 'auto';
      byId('originalLang').textContent = LANGUAGES[q.original_language] || '';
    }

    document.title = (author ? author + ': ' : '') + text;

    var open = byId('openApp');
    open.textContent = COPY.open;
    open.href = 'phijo://quote/' + id + '?from=link';
    open.hidden = false;
    show();
    return true;
  }

  applyChrome();

  var match = /[?&]id=([^&#]+)/.exec(location.search);
  var id = match ? decodeURIComponent(match[1]).toLowerCase() : '';
  if (!UUID_RX.test(id)) {
    showMessage(COPY.missingLabel, COPY.missing);
    return;
  }

  var controller = 'AbortController' in window ? new AbortController() : null;
  var timer = setTimeout(function () { if (controller) controller.abort(); }, FETCH_TIMEOUT_MS);

  fetch(SUPABASE_URL + '/rest/v1/rpc/shared_quote', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_id: id }),
    signal: controller ? controller.signal : undefined
  })
    .then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    })
    .then(function (rows) {
      var row = Array.isArray(rows) ? rows[0] : rows;
      if (!row || !render(row, id)) showMessage(COPY.missingLabel, COPY.missing);
    })
    .catch(function () { showMessage(COPY.label, COPY.failed); })
    .finally(function () { clearTimeout(timer); });
})();
