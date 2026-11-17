'use strict';

/**
 * wordUtils.js — chuan hoa + kiem tra tu/cum tu nguoi dung nhap de tra
 * tu dien hoac luu vao Tu cua toi. Dung chung cho routes/dictionary.js
 * va routes/userWords.js.
 */

/** Chuan hoa: chu thuong, bo dau cau 2 dau, bo so huu cach 's. */
function normalizeWordInput(raw) {
  if (typeof raw !== 'string') return '';
  let w = raw.trim().toLowerCase();
  w = w.replace(/^[^a-z]+|[^a-z]+$/g, '');
  w = w.replace(/['’]s$/, '');
  w = w.replace(/\s+/g, ' ');
  return w;
}

/** Hop le: 1-3 tu, moi tu chi gom chu cai + dau ' noi (vd: don't, well-known). */
function isValidWordInput(word) {
  if (!word || typeof word !== 'string') return false;
  if (word.length > 40) return false;
  const tokens = word.split(/[\s-]+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 3) return false;
  return tokens.every((t) => /^[a-z]+('[a-z]+)?$/.test(t));
}

module.exports = { normalizeWordInput, isValidWordInput };
