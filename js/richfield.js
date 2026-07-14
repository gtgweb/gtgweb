/**
 * gtgWeb — Module RichField
 *
 * Éditeur à champ unique façon GTG : titre en gras (1re ligne), @tags surlignés.
 * Le texte pur est la vérité ; le style est une projection recalculée sur les
 * temps morts (espace, Entrée, pause de frappe, sortie du champ), jamais sous
 * les doigts. Entrée est entièrement prise en main (aucun pari sur le
 * navigateur). Curseur repéré en (ligne, colonne) pour éviter toute ambiguïté
 * entre fin de ligne N et début de ligne N+1.
 *
 * Transposition directe du taskview GTK4 de GTG (GtkSource.View + TextTag)
 * vers un contenteditable + spans CSS.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */
const RichField = (function () {

  const RE_TAG = /(?<![a-zA-Z0-9._%+\-])@([\wÀ-ÿ][\wÀ-ÿ\-]*)/g;
  const PROCESSING_DELAY = 800; // pause de frappe avant re-stylage (cf. GTG)

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Extraction structure DOM -> lignes de texte pur ----

  function collectInline(root) {
    const out = [];
    (function walk(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) out.push(c);
        else if (c.nodeName === 'BR') out.push(c);
        else walk(c);
      }
    })(root);
    return out;
  }

  function divToLines(div) {
    const nodes = collectInline(div);
    if (nodes.length && nodes[nodes.length - 1].nodeName === 'BR') nodes.pop();
    let s = '';
    for (const n of nodes) s += (n.nodeName === 'BR') ? '\n' : n.textContent;
    return s.split('\n');
  }

  function topChildLineCount(ch) {
    if (ch.nodeName === 'DIV') return divToLines(ch).length;
    if (ch.nodeName === 'BR') return 1;
    if (ch.nodeType === Node.TEXT_NODE) return ch.textContent.split('\n').length - 1;
    return 0;
  }

  function getLines(el) {
    const lines = [];
    let buf = ''; let hasInline = false;
    const flush = () => { if (hasInline) { lines.push(...buf.split('\n')); buf = ''; hasInline = false; } };
    for (const ch of el.childNodes) {
      // Ignorer la zone des sous-taches (elle n'est pas du texte editable).
      if (ch.nodeType === Node.ELEMENT_NODE && ch.classList && ch.classList.contains('rf-subtasks')) continue;
      if (ch.nodeName === 'DIV') { flush(); lines.push(...divToLines(ch)); }
      else if (ch.nodeName === 'BR') { buf += '\n'; hasInline = true; }
      else if (ch.nodeType === Node.TEXT_NODE) { buf += ch.textContent; hasInline = true; }
      else { buf += ch.textContent; hasInline = true; }
    }
    flush();
    if (lines.length === 0) lines.push('');
    return lines;
  }

  // ---- Curseur : (container, offset) DOM <-> (ligne, colonne) ----

  function caretPosFromPoint(el, container, offset) {
    if (container === el) {
      let line = 0;
      const idx = Math.min(offset, el.childNodes.length);
      for (let i = 0; i < idx; i++) line += topChildLineCount(el.childNodes[i]);
      return { line, col: 0 };
    }
    let top = container;
    while (top && top.parentNode !== el) top = top.parentNode;
    if (!top) return null;

    let line = 0;
    for (const ch of el.childNodes) {
      if (ch === top) break;
      line += topChildLineCount(ch);
    }

    const nodes = collectInline(top);
    let col = 0;

    if (container.nodeType === Node.ELEMENT_NODE) {
      const marker = container.childNodes[offset] || null;
      for (const n of nodes) {
        const reached = marker
          ? (n === marker || (marker.nodeType === Node.ELEMENT_NODE && marker.contains(n)))
          : !container.contains(n);
        if (reached) return { line, col };
        if (n.nodeName === 'BR') { line += 1; col = 0; }
        else {
          const parts = n.textContent.split('\n');
          if (parts.length > 1) { line += parts.length - 1; col = parts[parts.length - 1].length; }
          else col += n.textContent.length;
        }
      }
      return { line, col };
    }

    for (const n of nodes) {
      if (n === container) {
        const before = n.textContent.slice(0, offset);
        const parts = before.split('\n');
        if (parts.length > 1) { line += parts.length - 1; col = parts[parts.length - 1].length; }
        else col += before.length;
        return { line, col };
      }
      if (n.nodeName === 'BR') { line += 1; col = 0; }
      else {
        const parts = n.textContent.split('\n');
        if (parts.length > 1) { line += parts.length - 1; col = parts[parts.length - 1].length; }
        else col += n.textContent.length;
      }
    }
    return { line, col };
  }

  function resolveLineCol(el, line, col) {
    let remaining = line;
    for (const ch of el.childNodes) {
      if (ch.nodeName === 'DIV') {
        const L = divToLines(ch);
        if (remaining < L.length) return pointInDiv(ch, remaining, col);
        remaining -= L.length;
      } else if (ch.nodeName === 'BR') {
        if (remaining === 0) return { node: el, offset: [...el.childNodes].indexOf(ch) };
        remaining -= 1;
      } else if (ch.nodeType === Node.TEXT_NODE) {
        const parts = ch.textContent.split('\n');
        if (remaining < parts.length) {
          let off = 0; for (let i = 0; i < remaining; i++) off += parts[i].length + 1;
          return { node: ch, offset: off + Math.min(col, parts[remaining].length) };
        }
        remaining -= parts.length - 1;
      }
    }
    return { node: el, offset: el.childNodes.length };
  }

  function pointInDiv(div, lineInDiv, col) {
    const nodes = collectInline(div);
    let curLine = 0, colLeft = col;
    for (const n of nodes) {
      if (curLine === lineInDiv) {
        if (n.nodeName === 'BR') {
          return { node: n.parentNode, offset: [...n.parentNode.childNodes].indexOf(n) };
        }
        const t = n.textContent;
        const nl = t.indexOf('\n');
        const segLen = nl === -1 ? t.length : nl;
        if (colLeft <= segLen) return { node: n, offset: colLeft };
        if (nl !== -1) return { node: n, offset: segLen };
        colLeft -= t.length;
      } else {
        if (n.nodeName === 'BR') curLine++;
        else {
          const parts = n.textContent.split('\n');
          if (curLine + parts.length - 1 >= lineInDiv) {
            const skip = lineInDiv - curLine;
            let off = 0; for (let i = 0; i < skip; i++) off += parts[i].length + 1;
            return { node: n, offset: off + Math.min(colLeft, parts[skip].length) };
          }
          curLine += parts.length - 1;
        }
      }
    }
    return { node: div, offset: div.childNodes.length };
  }

  // ---- Rendu ----

  function renderLine(line, isFirst, colorFn) {
    let html = '', cursor = 0;
    const re = new RegExp(RE_TAG.source, 'g'); let m;
    while ((m = re.exec(line)) !== null) {
      if (m.index > cursor) html += esc(line.slice(cursor, m.index));
      const color = colorFn ? colorFn(m[1]) : '#FFEA00';
      html += `<span class="rf-tag" style="--rf-c:${color}">@${esc(m[1])}</span>`;
      cursor = m.index + m[0].length;
    }
    if (cursor < line.length) html += esc(line.slice(cursor));
    if (html === '') html = '<br>';
    return `<div class="${isFirst ? 'rf-title' : ''}">${html}</div>`;
  }

  // Rendu de la zone des sous-taches (groupees en bas, non editables).
  function renderSubtasksHtml(subtasks) {
    if (!subtasks || !subtasks.length) return '';
    let html = '<div class="rf-subtasks" contenteditable="false">';
    for (const sub of subtasks) {
      const done = sub.done ? ' rf-subtask--done' : '';
      const checked = sub.done ? 'checked' : '';
      html += `<div class="rf-subtask${done}" data-uid="${esc(sub.uid)}">`
        + `<input type="checkbox" class="rf-subtask-check" ${checked} disabled>`
        + `<span class="rf-subtask-title" data-uid="${esc(sub.uid)}">${esc(sub.title)}</span>`
        + `</div>`;
    }
    html += '</div>';
    return html;
  }

  function splitAt(lines, line, col) {
    const l = lines[line] ?? '';
    return [...lines.slice(0, line), l.slice(0, col), l.slice(col), ...lines.slice(line + 1)];
  }

  // ---- Attache le comportement à un élément contenteditable ----
  // opts: { colorFn(tag)->color, onChange(lines) }
  function attach(el, opts = {}) {
    const colorFn = opts.colorFn || null;
    const onChange = opts.onChange || null;
    let timer = null;

    function currentPos() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      if (!el.contains(r.endContainer)) return null;
      return caretPosFromPoint(el, r.endContainer, r.endOffset);
    }
    let _subtasks = []; // sous-taches courantes (affichage seul, etape A)
    function renderAll(lines) {
      el.innerHTML = lines.map((l, i) => renderLine(l, i === 0, colorFn)).join('')
        + renderSubtasksHtml(_subtasks);
    }
    function placeCaret(line, col) {
      const { node, offset } = resolveLineCol(el, line, col);
      try {
        const range = document.createRange();
        range.setStart(node, offset); range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
      } catch (e) { /* noop */ }
    }
    // Garde composition : sur mobile, le clavier predictif/IME "compose" les
    // mots ; re-rendre le DOM pendant ce temps casse la synchro et duplique les
    // lettres. On bloque process() pendant la composition, on relance apres.
    let composing = false;

    function process() {
      if (composing) return; // ne jamais re-rendre en pleine composition
      const pos = currentPos();
      const lines = getLines(el);
      renderAll(lines);
      if (pos) placeCaret(pos.line, pos.col);
      if (onChange) onChange(lines);
    }

    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const pos = currentPos();
        if (!pos) return;
        const lines = splitAt(getLines(el), pos.line, pos.col);
        renderAll(lines);
        placeCaret(pos.line + 1, 0);
        if (onChange) onChange(lines);
        return;
      }
      if (e.key === ' ' && !composing) { setTimeout(process, 0); }
    });
    el.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(process, PROCESSING_DELAY);
    });
    el.addEventListener('blur', process);

    // Composition clavier (mobile/IME) : suspendre le rendu pendant, reprendre apres.
    el.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
    el.addEventListener('compositionend', () => {
      composing = false;
      clearTimeout(timer);
      timer = setTimeout(process, PROCESSING_DELAY);
    });

    return {
      // API : lire le texte pur (toutes lignes)
      getText() { return getLines(el).join('\n'); },
      // API : lire titre (1re ligne) et corps (reste), pour la sauvegarde
      getTitleAndBody() {
        const lines = getLines(el);
        return { title: (lines[0] || '').trim(), body: lines.slice(1).join('\n') };
      },
      // API : initialiser depuis titre + corps
      setTitleAndBody(title, body) {
        const lines = [title || '', ...String(body || '').split('\n')];
        // si body vide, éviter une 2e ligne vide parasite
        if ((body || '') === '') lines.length = 1;
        renderAll(lines.length ? lines : ['']);
      },
      // API : initialiser depuis titre + corps + sous-taches (etape A, affichage).
      setContent(title, body, subtasks) {
        _subtasks = subtasks || [];
        const lines = [title || '', ...String(body || '').split('\n')];
        if ((body || '') === '') lines.length = 1;
        renderAll(lines.length ? lines : ['']);
      },
      process,
    };
  }

  return { attach, getLines, caretPosFromPoint, resolveLineCol, renderLine, splitAt };

})();

if (typeof module !== 'undefined') module.exports = RichField;
