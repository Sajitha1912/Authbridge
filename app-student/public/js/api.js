/* UI helpers for app-student. Same-origin calls only. */
(function (global) {
  'use strict';

  const TOKEN_KEY = 'app-student.token';
  const USER_KEY = 'app-student.user';
  const LOGIN_PAGE = '/login.html';

  class ApiError extends Error {
    constructor(status, code, message, details) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  function readUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (err) {
      return null;
    }
  }

  const api = {
    getToken() {
      return localStorage.getItem(TOKEN_KEY);
    },
    getUser() {
      return readUser();
    },
    setSession(session) {
      localStorage.setItem(TOKEN_KEY, session.token);
      this.setUser(session.user);
    },
    setUser(user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clearSession() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
    logout() {
      this.clearSession();
      global.location.href = LOGIN_PAGE;
    },
    /** Redirects to the login page when there is no token at all. */
    requireSession() {
      if (this.getToken()) return true;
      global.location.href = LOGIN_PAGE;
      return false;
    },

    async request(path, options) {
      const opts = options || {};
      const headers = {};
      const token = this.getToken();

      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = 'Bearer ' + token;

      const response = await fetch(path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });

      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (err) {
          payload = null;
        }
      }

      if (response.status === 401) {
        // Token missing, expired or rejected by the auth service.
        this.clearSession();
        global.location.href = LOGIN_PAGE;
        throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
      }

      if (!response.ok) {
        const error = (payload && payload.error) || {};
        throw new ApiError(
          response.status,
          error.code || 'ERROR',
          error.message || ('Request failed with ' + response.status),
          error.details,
        );
      }

      return payload;
    },
  };

  function describeError(err) {
    if (err && err.details && err.details.length) {
      return err.details.map((d) => d.field + ' ' + d.issue).join('; ');
    }
    return (err && err.message) || 'Something went wrong';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function showNotice(element, message, kind) {
    if (!element) return;
    element.textContent = message;
    element.className = 'notice ' + (kind || 'error');
  }

  function hideNotice(element) {
    if (!element) return;
    element.className = 'notice';
    element.textContent = '';
  }

  /** Renders the top navigation bar and wires up "log out". */
  function renderNav(active) {
    const nav = document.getElementById('nav');
    if (!nav) return;

    const links = [
      ['/dashboard.html', 'Dashboard'],
      ['/courses.html', 'Courses'],
      ['/profile.html', 'Profile'],
    ];
    const user = readUser();
    const who = user ? escapeHtml(user.name + ' (' + user.email + ')') : '';

    nav.innerHTML =
      links
        .map(([href, label]) => {
          const isActive = href === active ? ' class="active"' : '';
          return '<a href="' + href + '"' + isActive + '>' + label + '</a>';
        })
        .join('') +
      '<span class="who" style="margin-left:auto">' + who + '</span>' +
      '<a href="#" id="logout">Log out</a>';

    const logout = document.getElementById('logout');
    if (logout) {
      logout.addEventListener('click', (event) => {
        event.preventDefault();
        api.logout();
      });
    }
  }

  global.api = api;
  global.ApiError = ApiError;
  global.ui = { describeError, escapeHtml, showNotice, hideNotice, renderNav };
})(window);
