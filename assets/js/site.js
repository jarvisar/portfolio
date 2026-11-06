(function () {
  'use strict';

  // Resolved from this script so project pages one folder down find the same files.
  const root = new URL('../../', document.currentScript.src);

  /* Menu (narrow screens) */

  const menuButton = document.querySelector('button.menu-btn');
  const menu = document.getElementById('menu');

  function setMenu(open) {
    if (!menuButton || !menu) return;
    menuButton.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('open', open);
  }

  if (menuButton && menu) {
    menuButton.addEventListener('click', function (event) {
      event.stopPropagation();
      setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('click', function (event) {
      if (!menu.contains(event.target)) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.classList.contains('open')) {
        setMenu(false);
        menuButton.focus();
      }
    });
  }

  /* Current section in the sidebar */

  const navLinks = Array.from(document.querySelectorAll('.nav-list a[href^="#"]'));
  const sections = navLinks
    .map(function (link) { return document.getElementById(link.hash.slice(1)); })
    .filter(Boolean);

  function updateCurrent() {
    let current = sections[0];
    const line = 90;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) current = section;
    }
    // The last sections can't scroll up to the line, so the bottom of the page selects the last one.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      current = sections[sections.length - 1];
    }
    navLinks.forEach(function (link) {
      if (current && link.hash === '#' + current.id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  if (sections.length) {
    let pending = false;
    window.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        updateCurrent();
      });
    }, { passive: true });
    window.addEventListener('resize', updateCurrent);
    updateCurrent();
  }

  /* Photo gallery: filter buttons, and three rows until expanded */

  document.querySelectorAll('.photos').forEach(function (section) {
    const gallery = section.querySelector('.gallery');
    const items = Array.from(gallery.children);
    const filters = Array.from(section.querySelectorAll('[data-filter]'));
    const notes = Array.from(section.querySelectorAll('[data-note]'));
    let current = 'all';
    let expanded = false;

    const wrap = document.createElement('p');
    wrap.className = 'more';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    wrap.appendChild(button);
    gallery.after(wrap);

    function shown() {
      return items.filter(function (item) {
        return current === 'all' || item.dataset.set === current;
      });
    }

    // 12 cells fill whole rows at 4, 3, and 2 columns. The feature photo takes four of them.
    function limitFor(list) {
      return list.length && list[0].classList.contains('feature') ? 9 : 12;
    }

    function update() {
      const list = shown();
      const limit = limitFor(list);
      const collapse = !expanded && list.length > limit;
      items.forEach(function (item) {
        const n = list.indexOf(item);
        item.hidden = n < 0;
        item.classList.toggle('over', collapse && n >= limit);
      });
      button.textContent = 'Show all ' + list.length + ' photos';
      wrap.hidden = !collapse;
    }

    filters.forEach(function (filter) {
      filter.addEventListener('click', function () {
        current = filter.dataset.filter;
        filters.forEach(function (other) {
          other.setAttribute('aria-pressed', String(other === filter));
        });
        notes.forEach(function (note) {
          note.hidden = note.dataset.note !== current;
        });
        update();
      });
    });

    button.addEventListener('click', function () {
      const list = shown();
      expanded = true;
      update();
      list[limitFor(list)].querySelector('a').focus();
    });

    update();
  });

  /* Lightbox */

  const icons = {
    close: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    prev: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5L5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 2.5L11 8l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  let box = null;
  let items = [];
  let index = 0;
  let returnFocus = null;

  function buildBox() {
    box = document.createElement('div');
    box.className = 'lightbox';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Image viewer');
    box.innerHTML =
      '<figure><div class="lb-media"></div><figcaption><span class="lb-caption"></span><span class="lb-count"></span></figcaption></figure>' +
      '<button type="button" class="lb-btn lb-prev" aria-label="Previous image">' + icons.prev + '</button>' +
      '<button type="button" class="lb-btn lb-next" aria-label="Next image">' + icons.next + '</button>' +
      '<button type="button" class="lb-btn lb-close" aria-label="Close">' + icons.close + '</button>';
    document.body.appendChild(box);

    box.querySelector('.lb-close').addEventListener('click', close);
    box.querySelector('.lb-prev').addEventListener('click', function () { show(index - 1); });
    box.querySelector('.lb-next').addEventListener('click', function () { show(index + 1); });
    box.addEventListener('click', function (event) {
      if (event.target === box) close();
    });

    let startX = null;
    box.addEventListener('touchstart', function (event) {
      startX = event.touches.length === 1 ? event.touches[0].clientX : null;
    }, { passive: true });
    box.addEventListener('touchend', function (event) {
      if (startX === null || items.length < 2) return;
      const dx = event.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      startX = null;
    });

    document.addEventListener('keydown', function (event) {
      if (box.hidden) return;
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowLeft' && items.length > 1) show(index - 1);
      else if (event.key === 'ArrowRight' && items.length > 1) show(index + 1);
      else if (event.key === 'Tab') {
        // Keep focus inside the viewer.
        const focusable = Array.from(box.querySelectorAll('button, iframe')).filter(function (el) {
          return !el.hidden;
        });
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function show(i) {
    index = (i + items.length) % items.length;
    const item = items[index];
    const media = box.querySelector('.lb-media');
    media.textContent = '';
    box.querySelector('figure').classList.toggle('is-frame', Boolean(item.frame));
    if (item.frame) {
      const frame = document.createElement('iframe');
      frame.src = item.frame;
      frame.title = item.caption;
      media.appendChild(frame);
      frame.addEventListener('load', function () {
        // Keys pressed inside the frame never reach this page, so Escape is caught there too.
        frame.contentWindow.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') close();
        });
        frame.focus();
      });
    } else {
      const img = document.createElement('img');
      img.src = item.src;
      img.alt = item.alt;
      media.appendChild(img);
    }
    box.querySelector('.lb-caption').textContent = item.caption;
    box.querySelector('.lb-count').textContent = items.length > 1 ? 'Image ' + (index + 1) + ' of ' + items.length : '';
    box.querySelector('.lb-prev').hidden = items.length < 2;
    box.querySelector('.lb-next').hidden = items.length < 2;
    // Load the neighbors so moving through a set doesn't wait on the network.
    if (items.length > 1) {
      [index + 1, index - 1].forEach(function (n) {
        const near = items[(n + items.length) % items.length];
        if (near.src) new Image().src = near.src;
      });
    }
  }

  function open(list, start) {
    if (!box) buildBox();
    items = list;
    returnFocus = document.activeElement;
    box.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    show(start);
    box.querySelector('.lb-close').focus();
  }

  function close() {
    box.hidden = true;
    box.querySelector('.lb-media').textContent = '';
    document.documentElement.style.overflow = '';
    if (returnFocus) returnFocus.focus();
  }

  function itemFrom(link) {
    const img = link.querySelector('img');
    const alt = img ? img.alt : '';
    return { src: link.href, alt: alt, caption: link.dataset.caption || alt };
  }

  document.addEventListener('click', function (event) {
    const link = event.target.closest('a[data-gallery]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    const group = Array.from(document.querySelectorAll('a[data-gallery="' + link.dataset.gallery + '"]')).filter(function (a) {
      return !a.closest('[hidden]');
    });
    open(group.map(itemFrom), group.indexOf(link));
  });

  /* Screenshot viewer on project pages */

  document.querySelectorAll('.viewer').forEach(function (viewer) {
    const main = viewer.querySelector('.viewer-main');
    const mainImg = main.querySelector('img');
    const caption = viewer.querySelector('.viewer-caption');
    const buttons = Array.from(viewer.querySelectorAll('.strip button'));
    let current = 0;

    const list = buttons.length ? buttons.map(function (button) {
      return { src: button.dataset.full, alt: button.querySelector('img').alt, caption: button.dataset.caption };
    }) : [{ src: main.href, alt: mainImg.alt, caption: caption ? caption.textContent : mainImg.alt }];

    function select(i) {
      current = i;
      const item = list[i];
      mainImg.src = item.src;
      mainImg.alt = item.alt;
      main.href = item.src;
      if (caption) caption.textContent = item.caption;
      buttons.forEach(function (button, n) {
        if (n === i) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
    }

    buttons.forEach(function (button, i) {
      button.addEventListener('click', function () { select(i); });
    });

    main.addEventListener('click', function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      open(list, current);
    });
  });

  /* Contact form */

  const form = document.getElementById('contact-form');
  if (form) {
    const status = form.querySelector('.form-status');
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      status.className = 'form-status';
      status.textContent = 'Sending...';
      button.disabled = true;
      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      }).then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        form.reset();
        status.className = 'form-status ok';
        status.textContent = 'Message sent.';
      }).catch(function () {
        status.className = 'form-status error';
        status.innerHTML = 'The message could not be sent. Email <a href="mailto:adamjarvis04@gmail.com">adamjarvis04@gmail.com</a> instead.';
      }).finally(function () {
        button.disabled = false;
      });
    });
  }

  /* Konami Code */

  const code = 'ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight KeyB KeyA';
  let recent = [];
  document.addEventListener('keydown', function (event) {
    if (box && !box.hidden) return;
    // Compare the last ten keys, so an extra press before the code still counts.
    recent = recent.concat(event.code).slice(-10);
    if (recent.join(' ') === code) {
      recent = [];
      open([{ frame: new URL('tetris.html', root).href, caption: 'Tetris' }], 0);
    }
  });
})();
