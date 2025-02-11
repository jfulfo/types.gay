fetch('./cgi-bin/stats/view.cgi?page=' + encodeURIComponent(window.location.pathname))
  .then(res => res.json())
  .then(data => {
    const counter = document.getElementById('stats');
    if (counter) {
      counter.textContent = `${data.count} visitor${data.count !== 1 ? 's' : ''}`;
    }
  })
  .catch(err => console.error('Stats error:', err));