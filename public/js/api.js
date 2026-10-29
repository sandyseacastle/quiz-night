// Small fetch helpers
async function req(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}
export const api = {
  list: () => req('GET', '/api/quizzes'),
  get: (id) => req('GET', `/api/quizzes/${id}`),
  create: (body) => req('POST', '/api/quizzes', body || {}),
  save: (q) => req('PUT', `/api/quizzes/${q.id}`, q),
  remove: (id) => req('DELETE', `/api/quizzes/${id}`),
  duplicate: (id) => req('POST', `/api/quizzes/${id}/duplicate`),
  cleanup: (id) => req('POST', `/api/quizzes/${id}/cleanup`),
  upload(id, file, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const x = new XMLHttpRequest();
      x.open('POST', `/api/quizzes/${id}/media`);
      x.upload.onprogress = (e) => onProgress && e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(x.responseText || 'Upload failed')));
      x.onerror = () => reject(new Error('Upload failed'));
      x.send(fd);
    });
  },
};

export function toast(msg, ms = 3200) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
