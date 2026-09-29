const page = window.location.pathname.replace(/index\.html$/, '');

fetch('/cgi-bin/stats/view.cgi?page=' + encodeURIComponent(page))
  .then(res => {
    if (!res.ok) throw new Error(res.status);
    return res.json();
  })
  .then(data => {
    const counter = document.getElementById('stats');
    if (counter) {
      counter.textContent = `${data.count} visitor${data.count !== 1 ? 's' : ''}`;
    }
  })
  .catch(err => console.error('Stats error:', err));