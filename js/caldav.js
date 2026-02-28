/**
 * gtgWeb — Module CalDAV
 *
 * Toutes les requêtes réseau CalDAV passent par ce module.
 * Le reste du code ne fait jamais de fetch() directement.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

'use strict';

const CalDAV = (() => {

  // ── Configuration ───────────────────────────────────────────────────────────

  let _url      = '';   // URL CalDAV (directe ou proxy)
  let _username = '';
  let _password = '';

  /**
   * Initialise le module avec les credentials.
   * @param {string} url      URL du calendrier CalDAV
   * @param {string} username Identifiant
   * @param {string} password Mot de passe (de préférence mot de passe d'application)
   */
  function init(url, username, password) {
    _url      = url.endsWith('/') ? url : url + '/';
    _username = username;
    _password = password;
  }

  // ── Header d'authentification ───────────────────────────────────────────────

  function _authHeader() {
    return 'Basic ' + btoa(_username + ':' + _password);
  }

  // ── Requête générique ───────────────────────────────────────────────────────

  /**
   * Envoie une requête CalDAV.
   * @param {string} method  Verbe HTTP (GET, PUT, DELETE, REPORT, PROPFIND...)
   * @param {string} path    Chemin relatif à l'URL de base (ex: 'uid.ics')
   * @param {Object} options headers, body
   * @returns {Promise<Response>}
   */
  async function _request(method, path = '', options = {}) {
    const url = _url + path;

    const headers = {
      'Authorization': _authHeader(),
      ...options.headers,
    };

    const config = {
      method,
      headers,
    };

    if (options.body !== undefined) {
      config.body = options.body;
    }

    const response = await fetch(url, config);
    return response;
  }

  // ── API publique ────────────────────────────────────────────────────────────

  /**
   * Teste la connexion au serveur CalDAV.
   * @returns {Promise<{ok: boolean, error: string|null}>}
   */
  async function testConnection() {
    try {
      const response = await _request('PROPFIND', '', {
        headers: {
          'Depth': '0',
          'Content-Type': 'application/xml; charset=utf-8',
        },
      });

      if (response.status === 207 || response.ok) {
        return { ok: true, error: null };
      }
      if (response.status === 401) {
        return { ok: false, error: 'Identifiants incorrects (401).' };
      }
      if (response.status === 404) {
        return { ok: false, error: 'URL CalDAV introuvable (404). Vérifiez l\'URL.' };
      }
      return { ok: false, error: `Erreur serveur (${response.status}).` };

    } catch (e) {
      // Échec réseau — probablement CORS
      return {
        ok: false,
        error: 'CORS_BLOCKED',
      };
    }
  }

  /**
   * Charge tous les VTODO du calendrier.
   * @returns {Promise<Array<{uid: string, etag: string, ical: string}>>}
   */
  async function fetchAll() {
    const body = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VTODO"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

    const response = await _request('REPORT', '', {
      headers: {
        'Depth': '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body,
    });

    if (!response.ok && response.status !== 207) {
      throw new Error(`fetchAll échoué : HTTP ${response.status}`);
    }

    const xml  = await response.text();
    return _parseMultistatus(xml);
  }

  /**
   * Charge un VTODO unique par son UID.
   * @param {string} uid
   * @returns {Promise<{uid: string, etag: string, ical: string}>}
   */
  async function get(uid) {
    const response = await _request('GET', uid + '.ics', {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
      },
    });

    if (!response.ok) {
      throw new Error(`get(${uid}) échoué : HTTP ${response.status}`);
    }

    const etag = response.headers.get('ETag') || '';
    const ical = await response.text();
    return { uid, etag, ical };
  }

  /**
   * Crée un nouveau VTODO.
   * @param {string} uid  UID de la tâche
   * @param {string} ical Contenu iCal complet
   * @returns {Promise<string>} UID créé
   */
  async function create(uid, ical) {
    const response = await _request('PUT', uid + '.ics', {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',

      },
      body: ical,
    });

    if (!response.ok) {
      throw new Error(`create(${uid}) échoué : HTTP ${response.status}`);
    }

    return uid;
  }

  /**
   * Met à jour un VTODO existant.
   * @param {string} uid  UID de la tâche
   * @param {string} ical Contenu iCal complet mis à jour
   * @param {string} etag ETag de la version connue (détection de conflits)
   * @returns {Promise<{ok: boolean, conflict: boolean}>}
   */
  async function update(uid, ical, etag = '') {
    const headers = {
      'Content-Type': 'text/calendar; charset=utf-8',
    };

    if (etag) {
      headers['If-Match'] = etag;
    }

    const response = await _request('PUT', uid + '.ics', { headers, body: ical });

    if (response.status === 412) {
      // Conflit — quelqu'un d'autre a modifié la tâche entre-temps
      return { ok: false, conflict: true };
    }

    if (!response.ok) {
      throw new Error(`update(${uid}) échoué : HTTP ${response.status}`);
    }

    return { ok: true, conflict: false };
  }

  /**
   * Supprime un VTODO.
   * @param {string} uid  UID de la tâche
   * @param {string} etag ETag optionnel pour sécuriser la suppression
   * @returns {Promise<boolean>}
   */
  async function remove(uid, etag = '') {
    const headers = {};
    if (etag) headers['If-Match'] = etag;

    const response = await _request('DELETE', uid + '.ics', { headers });

    if (!response.ok && response.status !== 204) {
      throw new Error(`remove(${uid}) échoué : HTTP ${response.status}`);
    }

    return true;
  }

  // ── Parsing XML multistatus ─────────────────────────────────────────────────

  /**
   * Parse une réponse XML DAV:multistatus.
   * Extrait uid, etag et données iCal de chaque réponse.
   * @param {string} xml
   * @returns {Array<{uid: string, etag: string, ical: string}>}
   */
  function _parseMultistatus(xml) {
    const results = [];

    try {
      const parser = new DOMParser();
      const doc    = parser.parseFromString(xml, 'application/xml');

      // Espaces de noms CalDAV
      const NS_DAV    = 'DAV:';
      const NS_CALDAV = 'urn:ietf:params:xml:ns:caldav';

      const responses = doc.getElementsByTagNameNS(NS_DAV, 'response');

      for (const response of responses) {
        // ETag
        const etagEl = response.getElementsByTagNameNS(NS_DAV, 'getetag')[0];
        const etag   = etagEl ? etagEl.textContent.replace(/"/g, '') : '';

        // Données iCal
        const calDataEl = response.getElementsByTagNameNS(NS_CALDAV, 'calendar-data')[0];
        if (!calDataEl) continue;

        const ical = calDataEl.textContent;
        if (!ical.includes('VTODO')) continue;

        // UID extrait du contenu iCal
        const uidMatch = ical.match(/^UID:(.+)$/m);
        if (!uidMatch) continue;
        const uid = uidMatch[1].trim();

        results.push({ uid, etag, ical });
      }
    } catch (e) {
      console.error('gtgWeb CalDAV : erreur parsing XML', e);
    }

    return results;
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  return {
    init,
    testConnection,
    fetchAll,
    get,
    create,
    update,
    remove,
  };

})();
