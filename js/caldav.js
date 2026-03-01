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

  function init(url, username, password) {
    _url      = url.endsWith('/') ? url : url + '/';
    _username = username;
    _password = password;
  }

  function _authHeader() {
    return 'Basic ' + btoa(_username + ':' + _password);
  }

  async function _request(method, path = '', options = {}) {
    const url = _url + path;
    const headers = { 'Authorization': _authHeader(), ...options.headers };
    const config  = { method, headers };
    if (options.body !== undefined) config.body = options.body;
    return fetch(url, config);
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

    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: { 'Authorization': _authHeader() },
    });

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

        // Reconstruire l'URL absolue
        const proxyBase = _url.endsWith('/') ? _url.slice(0, -1) : _url;
        // L'URL du calendrier sera proxy.php + PATH mais on stocke le nom
        // et l'utilisateur choisit — le proxy-config.php gère l'URL réelle
        results.push({ name, href });
      }
    } catch (e) {
      console.error('gtgWeb CalDAV : erreur parsing liste calendriers', e);
    }
    return results;
  }

  // ── Test connexion ────────────────────────────────────────────────────────

  async function testConnection() {
    try {
      const response = await _request('PROPFIND', '', {
        headers: { 'Depth': '0', 'Content-Type': 'application/xml; charset=utf-8' },
      });

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

    const response = await _request('REPORT', '', {
      headers: { 'Depth': '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body,
    });

    if (!response.ok && response.status !== 207) {
      throw new Error(`fetchAll échoué : HTTP ${response.status}`);
    }

    return _parseMultistatus(await response.text());
  }

  async function get(uid) {
    const response = await _request('GET', uid + '.ics');
    if (!response.ok) throw new Error(`get(${uid}) échoué : HTTP ${response.status}`);
    return { uid, etag: response.headers.get('ETag') || '', ical: await response.text() };
  }

  async function create(uid, ical) {
    const response = await _request('PUT', uid + '.ics', {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
      body: ical,
    });
    if (!response.ok) throw new Error(`create(${uid}) échoué : HTTP ${response.status}`);
    return uid;
  }

  async function update(uid, ical, etag = '') {
    const headers = { 'Content-Type': 'text/calendar; charset=utf-8' };

    // GET frais pour récupérer l'ETag courant côté serveur.
    // Nécessaire car GTG desktop peut avoir modifié la tâche entre-temps.
    try {
      const getResp = await _request('GET', uid + '.ics');
      if (getResp.ok) {
        const freshEtag = getResp.headers.get('ETag');
        if (freshEtag) headers['If-Match'] = freshEtag;
      }
    } catch (e) {
      // GET échoué — on tente le PUT sans If-Match plutôt que d'abandonner
      console.warn('gtgWeb CalDAV : GET frais échoué, PUT sans If-Match', e);
    }

    const response = await _request('PUT', uid + '.ics', { headers, body: ical });
    if (response.status === 412) return { ok: false, conflict: true };
    if (!response.ok) throw new Error(`update(${uid}) échoué : HTTP ${response.status}`);
    return { ok: true, conflict: false };
  }

  async function remove(uid, etag = '') {
    const headers = {};

    // GET frais pour récupérer l'ETag courant — même logique que update()
    try {
      const getResp = await _request('GET', uid + '.ics');
      if (getResp.ok) {
        const freshEtag = getResp.headers.get('ETag');
        if (freshEtag) headers['If-Match'] = freshEtag;
      }
    } catch (e) {
      // GET échoué — on tente le DELETE sans If-Match
      console.warn('gtgWeb CalDAV : GET frais échoué, DELETE sans If-Match', e);
      if (etag) headers['If-Match'] = etag;
    }

    const response = await _request('DELETE', uid + '.ics', { headers });
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
          ical,
        });
        idx++;
      }
    } catch (e) {
      console.error('gtgWeb CalDAV : erreur parsing XML', e);
    }
    return results;
  }

  return { init, testConnection, listCalendars, fetchAll, get, create, update, remove };

})();
