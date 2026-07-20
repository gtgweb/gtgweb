/**
 * gtgWeb — Module CalDAV
 *
 * Toutes les requêtes réseau CalDAV passent par ce module.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const CalDAV = (() => {

  let _url      = '';
  let _username = '';
  let _password = '';
  let _calPath  = '';   // segment technique du calendrier choisi (ex: 'tches'), '' = racine directe

  function init(url, username, password, calendarPath = '') {
    _url      = url.endsWith('/') ? url : url + '/';
    _username = username;
    _password = password;
    _calPath  = calendarPath ? calendarPath.replace(/^\/+|\/+$/g, '') : '';
  }

  function _authHeader() {
    return 'Basic ' + btoa(_username + ':' + _password);
  }

  const _TIMEOUT_MS = 30000;  // au-dela, la requete est consideree perdue (reseau mobile)

  // fetch avec timeout : un fetch nu pend indefiniment si le reseau se coupe en
  // cours (tunnel, bascule wifi/4G). AbortController transforme ce blocage en
  // erreur, geree comme une erreur reseau par les appelants (ecran Reessayer,
  // editeur preserve). Rejette avec AbortError au-dela de _TIMEOUT_MS.
  async function _fetchWithTimeout(url, config = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), _TIMEOUT_MS);
    try {
      return await fetch(url, { ...config, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // Statuts transitoires : on retente. 401/403/404 (auth, chemin) ne se
  // resolvent jamais en reessayant, on ne les retente pas.
  function _isRetryableStatus(status) {
    return status === 429 || (status >= 500 && status <= 599);
  }

  function _delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Backoff exponentiel + jitter (0.5s, 1s... + part aleatoire) pour ne pas
  // re-taper le serveur en rafale synchronisee.
  function _backoff(attempt) {
    return 500 * Math.pow(2, attempt) + Math.random() * 250;
  }

  // Retente une operation de LECTURE (idempotente) sur erreur transitoire :
  // exception reseau (timeout AbortError, 'failed to fetch') ou statut 429/5xx.
  // JAMAIS applique aux ecritures (PUT/DELETE) : cf. piste "file hors-ligne".
  async function _withRetry(fn, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fn();
        if (_isRetryableStatus(res.status) && i < attempts - 1) {
          await _delay(_backoff(i));
          continue;
        }
        return res;
      } catch (e) {
        lastErr = e;
        if (i < attempts - 1) { await _delay(_backoff(i)); continue; }
        throw e;
      }
    }
    throw lastErr;
  }

  async function _request(method, path = '', options = {}) {
    // Cible = proxy + segment calendrier choisi + fichier .ics
    const prefix = _calPath ? _calPath + '/' : '';
    const url = _url + prefix + path;
    const headers = { 'Authorization': _authHeader(), ...options.headers };
    const config  = { method, headers };
    if (options.body !== undefined) config.body = options.body;
    return _fetchWithTimeout(url, config);
  }

  // ── Liste des calendriers ─────────────────────────────────────────────────

  /**
   * Liste tous les calendriers disponibles via ?action=calendars.
   * @returns {Promise<Array<{name: string, url: string}>>}
   */
  async function listCalendars() {
    // L'URL du proxy sans le slash final + query string
    const proxyBase = _url.endsWith('/') ? _url.slice(0, -1) : _url;
    const url = proxyBase + '?action=calendars';

    const response = await _withRetry(() => _fetchWithTimeout(url, {
      method: 'PROPFIND',
      headers: { 'Authorization': _authHeader() },
    }));

    if (!response.ok && response.status !== 207) {
      throw new Error(`listCalendars échoué : HTTP ${response.status}`);
    }

    const xml = await response.text();
    return _parseCalendarList(xml);
  }

  /**
   * Parse la réponse PROPFIND de la liste des calendriers.
   */
  function _parseCalendarList(xml) {
    const results = [];
    try {
      const parser = new DOMParser();
      const doc    = parser.parseFromString(xml, 'application/xml');
      const NS_DAV    = 'DAV:';
      const NS_CALDAV = 'urn:ietf:params:xml:ns:caldav';

      const responses = doc.getElementsByTagNameNS(NS_DAV, 'response');

      for (const resp of responses) {
        // Vérifier que c'est bien un calendrier (pas une collection générique)
        const compSet = resp.getElementsByTagNameNS(NS_CALDAV, 'comp')[0];
        const resType = resp.getElementsByTagNameNS(NS_DAV, 'resourcetype')[0];
        const isCalendar = resp.getElementsByTagNameNS(NS_CALDAV, 'calendar').length > 0;
        if (!isCalendar) continue;

        const hrefEl = resp.getElementsByTagNameNS(NS_DAV, 'href')[0];
        const nameEl = resp.getElementsByTagNameNS(NS_DAV, 'displayname')[0];

        if (!hrefEl || !nameEl) continue;

        const href = hrefEl.textContent.trim();
        const name = nameEl.textContent.trim();
        if (!name) continue;

        // Ne garder que les calendriers acceptant les VTODO (taches).
        // Un calendrier d'evenements (VEVENT seul) provoquerait un 403 InvalidComponentType.
        const comps = resp.getElementsByTagNameNS(NS_CALDAV, 'comp');
        let acceptsVTODO = false;
        for (const c of comps) {
          if ((c.getAttribute('name') || '').toUpperCase() === 'VTODO') { acceptsVTODO = true; break; }
        }
        if (!acceptsVTODO) continue;

        // Segment technique = dernier morceau du href (ex: '/.../testgtg/tches/' -> 'tches').
        const segment = href.replace(/\/+$/g, '').split('/').pop();

        results.push({ name, href, segment });
      }
    } catch (e) {
      console.error('gtgWeb CalDAV : erreur parsing liste calendriers', e);
    }
    return results;
  }

  // ── Test connexion ────────────────────────────────────────────────────────

  async function testConnection() {
    try {
      const response = await _withRetry(() => _request('PROPFIND', '', {
        headers: { 'Depth': '0', 'Content-Type': 'application/xml; charset=utf-8' },
      }));

      if (response.status === 207 || response.ok) {
        // Extraire le displayname depuis la réponse
        const xml  = await response.text();
        const name = _parseDisplayName(xml);
        return { ok: true, error: null, calendarName: name };
      }
      if (response.status === 401) return { ok: false, error: 'Identifiants incorrects (401).' };
      if (response.status === 404) return { ok: false, error: 'URL CalDAV introuvable (404).' };
      return { ok: false, error: `Erreur serveur (${response.status}).` };

    } catch (e) {
      return { ok: false, error: 'CORS_BLOCKED' };
    }
  }

  function _parseDisplayName(xml) {
    try {
      const doc  = new DOMParser().parseFromString(xml, 'application/xml');
      const el   = doc.getElementsByTagNameNS('DAV:', 'displayname')[0];
      return el ? el.textContent.trim() : '';
    } catch (e) { return ''; }
  }

  // ── Fetch all ────────────────────────────────────────────────────────────

  async function fetchAll() {
    const body = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VTODO"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    const response = await _withRetry(() => _request('REPORT', '', {
      headers: { 'Depth': '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body,
    }));

    if (!response.ok && response.status !== 207) {
      throw new Error(`fetchAll échoué : HTTP ${response.status}`);
    }

    return _parseMultistatus(await response.text());
  }

  async function create(uid, ical, href = '') {
    const response = await _request('PUT', _fileFor(href || uid), {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
      body: ical,
    });
    if (!response.ok) throw new Error(`create(${uid}) échoué : HTTP ${response.status}`);
    return uid;
  }

  // Nom de fichier .ics : href memorise si present, sinon uid.ics.
  function _fileFor(uidOrHref) {
    if (uidOrHref && uidOrHref.includes('.ics')) {
      return uidOrHref.replace(/\/+$/, '').split('/').pop();
    }
    return uidOrHref + '.ics';
  }

  async function update(uid, ical, etag = '', href = '') {
    const headers = { 'Content-Type': 'text/calendar; charset=utf-8' };

    // GET frais pour récupérer l'ETag courant côté serveur.
    // Nécessaire car GTG desktop peut avoir modifié la tâche entre-temps.
    try {
      const getResp = await _request('GET', _fileFor(href || uid));
      if (getResp.ok) {
        const freshEtag = getResp.headers.get('ETag');
        if (freshEtag) headers['If-Match'] = freshEtag;
      }
    } catch (e) {
      // GET échoué — on tente le PUT sans If-Match plutôt que d'abandonner
      console.warn('gtgWeb CalDAV : GET frais échoué, PUT sans If-Match', e);
    }

    const response = await _request('PUT', _fileFor(href || uid), { headers, body: ical });
    if (response.status === 412) return { ok: false, conflict: true };
    if (!response.ok) throw new Error(`update(${uid}) échoué : HTTP ${response.status}`);
    return { ok: true, conflict: false };
  }

  async function remove(uid, etag = '', href = '') {
    const headers = {};

    // GET frais pour récupérer l'ETag courant — même logique que update()
    try {
      const getResp = await _request('GET', _fileFor(href || uid));
      if (getResp.ok) {
        const freshEtag = getResp.headers.get('ETag');
        if (freshEtag) headers['If-Match'] = freshEtag;
      }
    } catch (e) {
      // GET échoué — on tente le DELETE sans If-Match
      console.warn('gtgWeb CalDAV : GET frais échoué, DELETE sans If-Match', e);
      if (etag) headers['If-Match'] = etag;
    }

    // Même fichier cible que le GET/PUT : href réel si connu, sinon uid.ics.
    const response = await _request('DELETE', _fileFor(href || uid), { headers });
    if (!response.ok && response.status !== 204) {
      throw new Error(`remove(${uid}) échoué : HTTP ${response.status}`);
    }
    return true;
  }

  // ── Parsing XML ───────────────────────────────────────────────────────────

  function _parseMultistatus(xml) {
    const results = [];
    try {
      // Extraction via regex sur le XML brut — textContent du DOMParser
      // normalise les espaces et détruit les sauts de ligne iCal.
      const calDataRe = /<[^:>]*:?calendar-data[^>]*>([\s\S]*?)<\/[^:>]*:?calendar-data>/gi;
      const etagRe    = /<[^:>]*:?getetag[^>]*>"?([^"<\s]+)"?<\/[^:>]*:?getetag>/gi;

      // Extraire tous les ETags dans l'ordre
      const etags = [];
      let em;
      while ((em = etagRe.exec(xml)) !== null) {
        etags.push(em[1].replace(/"/g, ''));
      }

      // Href (nom de fichier .ics) dans l'ordre. Le nom de fichier n'est PAS
      // toujours l'uid : GTG desktop le nomme differemment.
      const hrefRe = /<[^:>]*:?href[^>]*>([^<]+\.ics)<\/[^:>]*:?href>/gi;
      const hrefs = [];
      let hm;
      while ((hm = hrefRe.exec(xml)) !== null) { hrefs.push(hm[1].trim()); }

      let m;
      let idx = 0;
      while ((m = calDataRe.exec(xml)) !== null) {
        let ical = m[1]
          .replace(/&amp;/g,  '&')
          .replace(/&lt;/g,   '<')
          .replace(/&gt;/g,   '>')
          .replace(/&quot;/g, '"')
          .replace(/&#13;/g,  '\r')
          .trim();

        if (!ical.includes('VTODO')) { idx++; continue; }

        const uidMatch = ical.match(/^UID:(.+)$/m);
        if (!uidMatch) { idx++; continue; }

        results.push({
          uid:  uidMatch[1].trim(),
          etag: etags[idx] || '',
          href: hrefs[idx] || '',
          ical,
        });
        idx++;
      }
    } catch (e) {
      console.error('gtgWeb CalDAV : erreur parsing XML', e);
    }
    return results;
  }

  return { init, testConnection, listCalendars, fetchAll, create, update, remove };

})();
