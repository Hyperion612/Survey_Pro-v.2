/* ============================================================
   SurveyPro v4.2 — со скрытием данных админа от обычных пользователей
   ============================================================ */
(() => {
  'use strict';

  // ==================== Утилиты ====================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const formatDate = (ts) => new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const hashPassword = (pwd) => {
    let h = 0;
    for (let i = 0; i < pwd.length; i++) {
      h = ((h << 5) - h) + pwd.charCodeAt(i);
      h |= 0;
    }
    return 'h' + Math.abs(h).toString(36) + '_' + pwd.length;
  };

  // ==================== Хранилище ====================
  const Storage = {
    KEY: 'surveypro_v4',
    load() {
      try {
        const raw = localStorage.getItem(this.KEY);
        const def = { users: [], surveys: [], responses: [], session: null };
        if (!raw) return def;
        return { ...def, ...JSON.parse(raw) };
      } catch { return { users: [], surveys: [], responses: [], session: null }; }
    },
    save(data) {
      try { localStorage.setItem(this.KEY, JSON.stringify(data)); }
      catch { Toast.show('Ошибка сохранения', 'error'); }
    }
  };

  // ==================== Toast ====================
  const Toast = {
    show(msg, type = '') {
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.textContent = msg;
      $('#toastContainer').appendChild(el);
      setTimeout(() => {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(40px)';
        setTimeout(() => el.remove(), 300);
      }, 2800);
    }
  };

  // ==================== Модальное окно ====================
  const Modal = {
    _resolve: null,
    confirm(title, text, confirmText = 'Удалить') {
      return new Promise((resolve) => {
        this._resolve = resolve;
        $('#modalTitle').textContent = title;
        $('#modalText').textContent = text;
        $('#modalConfirm').textContent = confirmText;
        $('#modalBackdrop').hidden = false;
      });
    },
    _close(r) {
      $('#modalBackdrop').hidden = true;
      if (this._resolve) { this._resolve(r); this._resolve = null; }
    },
    init() {
      $('#modalCancel').addEventListener('click', () => this._close(false));
      $('#modalConfirm').addEventListener('click', () => this._close(true));
      $('#modalBackdrop').addEventListener('click', (e) => {
        if (e.target.id === 'modalBackdrop') this._close(false);
      });
    }
  };

  // ==================== Модель данных ====================
  const Data = {
    _state: Storage.load(),
    _persist() { Storage.save(this._state); },

    register(name, email, password) {
      email = email.toLowerCase().trim();
      if (this._state.users.some((u) => u.email === email)) {
        throw new Error('Пользователь с таким email уже существует');
      }
      const user = {
        id: uid(), name: name.trim(), email,
        passwordHash: hashPassword(password),
        role: 'user',
        createdAt: Date.now()
      };
      this._state.users.push(user);
      this._state.session = user.id;
      this._persist();
      return user;
    },
    login(email, password) {
      email = email.toLowerCase().trim();
      const user = this._state.users.find((u) => u.email === email);
      if (!user) throw new Error('Пользователь не найден');
      if (user.passwordHash !== hashPassword(password)) throw new Error('Неверный пароль');
      this._state.session = user.id;
      this._persist();
      return user;
    },
    logout() { this._state.session = null; this._persist(); },
    currentUser() {
      if (!this._state.session) return null;
      return this._state.users.find((u) => u.id === this._state.session) || null;
    },
    getAllUsers() { return this._state.users; },
    deleteUser(userId) {
      this._state.users = this._state.users.filter((u) => u.id !== userId);
      const removedSurveys = this._state.surveys.filter((s) => s.ownerId === userId).map((s) => s.id);
      this._state.surveys = this._state.surveys.filter((s) => s.ownerId !== userId);
      const removedSet = new Set(removedSurveys);
      this._state.responses = this._state.responses.filter((r) => !removedSet.has(r.surveyId));
      this._persist();
    },

    getSurveysByUser(userId) {
      return this._state.surveys.filter((s) => s.ownerId === userId);
    },
    getAllSurveys() { return this._state.surveys; },
    getSurvey(id) { return this._state.surveys.find((s) => s.id === id); },
    createSurvey(data, ownerId) {
      const survey = {
        id: uid(), ownerId,
        title: data.title, description: data.description,
        questions: data.questions,
        isPublic: data.isPublic !== false,
        published: data.published !== false,
        createdAt: Date.now(), updatedAt: Date.now()
      };
      this._state.surveys.unshift(survey);
      this._persist();
      return survey;
    },
    updateSurvey(id, data) {
      const s = this.getSurvey(id);
      if (!s) return null;
      Object.assign(s, {
        title: data.title, description: data.description,
        questions: data.questions,
        isPublic: data.isPublic !== false,
        published: data.published !== false,
        updatedAt: Date.now()
      });
      this._persist();
      return s;
    },
    togglePublish(id) {
      const s = this.getSurvey(id);
      if (!s) return null;
      s.published = !s.published;
      s.updatedAt = Date.now();
      this._persist();
      return s;
    },
    deleteSurvey(id) {
      this._state.surveys = this._state.surveys.filter((s) => s.id !== id);
      this._state.responses = this._state.responses.filter((r) => r.surveyId !== id);
      this._persist();
    },
    addResponse(surveyId, answers, meta = {}) {
      const response = {
        id: uid(), surveyId, answers,
        userId: meta.userId || null,
        guest: meta.guest || null,
        createdAt: Date.now()
      };
      this._state.responses.push(response);
      this._persist();
      return response;
    },
    getResponses(surveyId) {
      return this._state.responses.filter((r) => r.surveyId === surveyId);
    },
    getAllResponses() { return this._state.responses; },
    getSurveyStats(surveyId) {
      const survey = this.getSurvey(surveyId);
      if (!survey) return null;
      const responses = this.getResponses(surveyId);
      const total = responses.length;

      const questionsStats = survey.questions.map((q) => {
        if (q.type === 'text') {
          const texts = responses
            .map((r) => r.answers[q.id])
            .filter((v) => typeof v === 'string' && v.trim());
          return { question: q, total, texts };
        }
        if (q.type === 'rating') {
          const ratings = responses
            .map((r) => r.answers[q.id])
            .filter((v) => typeof v === 'number' && v >= 1 && v <= 5);
          const counts = [0, 0, 0, 0, 0];
          ratings.forEach((r) => counts[r - 1]++);
          const percents = counts.map((c) => total ? Math.round((c / total) * 100) : 0);
          const average = ratings.length
            ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)
            : '0.00';
          return { question: q, total, counts, percents, average, ratingsCount: ratings.length };
        }
        const counts = new Array(q.options.length).fill(0);
        responses.forEach((r) => {
          const a = r.answers[q.id];
          if (typeof a === 'number' && a >= 0 && a < counts.length) counts[a]++;
        });
        const percents = counts.map((c) => total ? Math.round((c / total) * 100) : 0);
        return { question: q, total, counts, percents };
      });
      return { survey, total, questionsStats, responses };
    }
  };

  // ==================== Графики ====================
  const Charts = { instances: [], destroyAll() { this.instances.forEach((c) => { try { c.destroy(); } catch {} }); this.instances = []; } };

  // ==================== Роутер ====================
  const Router = {
    render() {
      Charts.destroyAll();
      const hash = location.hash.slice(1) || '/';
      const parts = hash.split('/').filter(Boolean);

      if (parts[0] === 'survey' && parts[1]) {
        const survey = Data.getSurvey(parts[1]);
        if (!survey || !survey.isPublic || !survey.published) {
          renderShell('public-error');
          return;
        }
        renderShell('public-run', { id: parts[1] });
        return;
      }

      const user = Data.currentUser();
      if (!user) { renderShell('auth'); return; }

      const route = parts[0] || (user.role === 'admin' ? 'admin' : 'home');
      const param = parts[1];

      const map = {
        'admin': 'admin',
        'home': 'home',
        'builder': 'builder',
        'edit': 'builder',
        'run': 'run',
        'results': 'results',
        'stats': 'stats'
      };
      const view = map[route] || (user.role === 'admin' ? 'admin' : 'home');
      renderShell(view, { id: param });
    },
    go(path) {
      if (location.hash === path) return;
      location.hash = path;
    }
  };

  // ==================== Оболочка ====================
  let rendering = false;

  function renderShell(viewName, params = {}) {
    if (rendering) return;
    rendering = true;

    const user = Data.currentUser();
    const navBar = $('#navBar');
    const userArea = $('#userArea');

    if (user) {
      const isAdmin = user.role === 'admin';
      navBar.innerHTML = `
        ${isAdmin ? `<button class="nav-btn" data-nav="#/admin">🛡️ Админ-панель</button>` : ''}
        <button class="nav-btn" data-nav="#/home">📝 Опросы</button>
        <button class="nav-btn" data-nav="#/stats">📈 Моя статистика</button>
      `;
      userArea.innerHTML = `
        <div class="user-badge">
          <div class="user-avatar ${isAdmin ? 'admin' : ''}">${escapeHtml(user.name.charAt(0).toUpperCase())}</div>
          <span>${escapeHtml(user.name)}</span>
          ${isAdmin ? `<span class="role-tag">admin</span>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" id="logoutBtn">Выйти</button>
      `;
      $('#logoutBtn').onclick = () => {
        Data.logout();
        Toast.show('Вы вышли', 'success');
        Router.go('/');
      };
      const hash = location.hash.slice(1) || '/';
      const currentRoute = hash.replace('/', '').split('/')[0] || (isAdmin ? 'admin' : 'home');
      $$('.nav-btn').forEach((b) => {
        const route = b.dataset.nav.replace('#/', '');
        b.classList.toggle('active', route === currentRoute);
      });
    } else {
      navBar.innerHTML = '';
      userArea.innerHTML = '';
    }

    const views = {
      admin: Views.admin,
      home: Views.home,
      builder: Views.builder,
      run: Views.run,
      results: Views.results,
      stats: Views.stats,
      auth: Views.auth,
      'public-run': Views.publicRun,
      'public-error': Views.publicError
    };

    let viewFn = views[viewName] || Views.home;

    // Защита: обычный пользователь не может попасть в админку
    if (viewName === 'admin' && (!user || user.role !== 'admin')) {
      viewFn = Views.noAccess;
    }

    // Защита: обычный пользователь не может редактировать опросы админов
    if (viewName === 'builder' && params.id && user && user.role !== 'admin') {
      const s = Data.getSurvey(params.id);
      const owner = s ? Data.getAllUsers().find((u) => u.id === s.ownerId) : null;
      if (s && owner?.role === 'admin' && s.ownerId !== user.id) {
        viewFn = Views.noAccess;
      }
    }

    const root = $('#app');

    const doRender = () => {
      root.classList.remove('page-exit');
      root.innerHTML = '';
      viewFn(root, params);
      void root.offsetWidth;
      root.classList.add('page-enter');
      setTimeout(() => {
        root.classList.remove('page-enter');
        rendering = false;
      }, 340);
    };

    if (root.innerHTML.trim()) {
      root.classList.add('page-exit');
      setTimeout(doRender, 160);
    } else {
      doRender();
    }
  }

  // ==================== Views ====================
  const Views = {

    noAccess(root) {
      root.innerHTML = `
        <div class="auth-wrap">
          <div class="card" style="text-align:center;">
            <div style="font-size:3rem;margin-bottom:12px;">⛔</div>
            <h1 class="page-title">Доступ запрещён</h1>
            <p class="page-subtitle">Эта страница доступна только администраторам</p>
            <button class="btn btn-primary" data-nav="#/home" style="margin-top:12px;">← На главную</button>
          </div>
        </div>`;
    },

    admin(root) {
      const user = Data.currentUser();
      if (!user || user.role !== 'admin') { Views.noAccess(root); return; }

      const allSurveys = Data.getAllSurveys();
      const allUsers = Data.getAllUsers();
      const totalResponses = Data.getAllResponses().length;
      const published = allSurveys.filter((s) => s.published).length;

      let tab = 'surveys';

      function renderTabContent() {
        if (tab === 'surveys') {
          if (!allSurveys.length) return T.emptyState('📭', 'Пока нет опросов', 'Создайте первый опрос');
          return `
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Название</th><th>Владелец</th><th>Вопросов</th><th>Ответов</th>
                    <th>Статус</th><th>Обновлён</th><th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  ${allSurveys.map((s) => {
                    const owner = allUsers.find((u) => u.id === s.ownerId);
                    const count = Data.getResponses(s.id).length;
                    return `
                      <tr>
                        <td><strong>${escapeHtml(s.title)}</strong></td>
                        <td>${owner ? escapeHtml(owner.name) : '—'}</td>
                        <td class="cell-num">${s.questions.length}</td>
                        <td class="cell-num">${count}</td>
                        <td>
                          <span class="badge ${s.published ? 'public' : 'private'}">
                            ${s.published ? '🌐 Опубликован' : '⏸ Черновик'}
                          </span>
                        </td>
                        <td class="cell-num">${formatDate(s.updatedAt || s.createdAt)}</td>
                        <td>
                          <div class="actions">
                            <button class="btn btn-ghost btn-sm" data-act="results" data-id="${s.id}" title="Результаты">📊</button>
                            <button class="btn ${s.published ? 'btn-ghost' : 'btn-success'} btn-sm" data-act="publish" data-id="${s.id}">
                              ${s.published ? '⏸' : '▶'}
                            </button>
                            <button class="btn btn-ghost btn-sm" data-act="delete" data-id="${s.id}" title="Удалить">🗑</button>
                          </div>
                        </td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`;
        }
        if (tab === 'users') {
          if (!allUsers.length) return T.emptyState('👥', 'Нет пользователей', '');
          return `
            <div style="overflow-x:auto;">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Имя</th><th>Email</th><th>Роль</th><th>Опросов</th><th>Регистрация</th><th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  ${allUsers.map((u) => {
                    const surveysCount = Data.getSurveysByUser(u.id).length;
                    const isMe = u.id === user.id;
                    return `
                      <tr>
                        <td><strong>${escapeHtml(u.name)}</strong>${isMe ? ' <span class="badge role-user" style="margin-left:6px;">это вы</span>' : ''}</td>
                        <td>${escapeHtml(u.email)}</td>
                        <td>
                          <span class="badge ${u.role === 'admin' ? 'role-admin' : 'role-user'}">
                            ${u.role === 'admin' ? '🛡️ Админ' : '👤 Пользователь'}
                          </span>
                        </td>
                        <td class="cell-num">${surveysCount}</td>
                        <td class="cell-num">${formatDate(u.createdAt)}</td>
                        <td>
                          ${!isMe ? `<button class="btn btn-ghost btn-sm" data-act="del-user" data-id="${u.id}" title="Удалить пользователя">🗑</button>` : '—'}
                        </td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>`;
        }
        return '';
      }

      function renderAll() {
        root.innerHTML = `
          <div class="builder-header">
            <div>
              <h1 class="page-title">🛡️ Админ-панель</h1>
              <p class="page-subtitle">Полный доступ к опросам и пользователям</p>
            </div>
            <button class="btn btn-primary" data-nav="#/builder">➕ Создать опрос</button>
          </div>

          <div class="stats-grid">
            <div class="stat-card"><div class="value">${allUsers.length}</div><div class="label">Пользователей</div></div>
            <div class="stat-card"><div class="value">${allSurveys.length}</div><div class="label">Опросов</div></div>
            <div class="stat-card"><div class="value">${published}</div><div class="label">Опубликовано</div></div>
            <div class="stat-card"><div class="value">${totalResponses}</div><div class="label">Ответов</div></div>
          </div>

          <div class="admin-tabs">
            <button class="admin-tab ${tab === 'surveys' ? 'active' : ''}" data-tab="surveys">📊 Опросы</button>
            <button class="admin-tab ${tab === 'users' ? 'active' : ''}" data-tab="users">👥 Пользователи</button>
          </div>

          <div id="adminContent">${renderTabContent()}</div>
        `;

        $$('.admin-tab').forEach((t) => t.addEventListener('click', () => {
          tab = t.dataset.tab;
          renderAll();
        }));

        $('#adminContent').addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-act]');
          if (!btn) return;
          const { act, id } = btn.dataset;
          if (act === 'results') Router.go(`/results/${id}`);
          if (act === 'publish') {
            const s = Data.togglePublish(id);
            Toast.show(s.published ? 'Опубликован' : 'Снят с публикации', 'success');
            Router.render();
          }
          if (act === 'delete') {
            const ok = await Modal.confirm('Удалить опрос?', 'Все ответы также будут удалены.');
            if (ok) { Data.deleteSurvey(id); Toast.show('Удалено', 'success'); Router.render(); }
          }
          if (act === 'del-user') {
            const u = Data.getAllUsers().find((x) => x.id === id);
            const ok = await Modal.confirm(
              'Удалить пользователя?',
              `Пользователь «${u?.name}» и все его опросы будут удалены безвозвратно.`
            );
            if (ok) { Data.deleteUser(id); Toast.show('Пользователь удалён', 'success'); Router.render(); }
          }
        });
      }

      renderAll();
    },

    home(root) {
      const user = Data.currentUser();
      const isAdmin = user.role === 'admin';

      const allUsers = Data.getAllUsers();
      const adminIds = new Set(allUsers.filter((u) => u.role === 'admin').map((u) => u.id));

      // Обычный пользователь НЕ видит опросы админов.
      // Админ видит все опубликованные.
      const visible = isAdmin
        ? Data.getAllSurveys().filter((s) => s.published)
        : Data.getAllSurveys().filter((s) =>
            s.published &&
            !adminIds.has(s.ownerId) &&
            (s.ownerId === user.id || s.isPublic)
          );

      root.innerHTML = `
        <div class="builder-header">
          <div>
            <h1 class="page-title">📝 Доступные опросы</h1>
            <p class="page-subtitle">Опубликованные опросы для прохождения</p>
          </div>
          <button class="btn btn-primary" data-nav="#/builder">➕ Создать опрос</button>
        </div>
        <div id="surveysList"></div>
      `;

      const list = $('#surveysList');
      if (!visible.length) {
        list.innerHTML = T.emptyState('📭', 'Нет доступных опросов', 'Создайте опрос и опубликуйте его');
        return;
      }

      const grid = document.createElement('div');
      grid.className = 'surveys-grid stagger';
      visible.forEach((s) => {
        const count = Data.getResponses(s.id).length;
        const owner = allUsers.find((u) => u.id === s.ownerId);
        const isMine = s.ownerId === user.id;
        const card = document.createElement('div');
        card.className = 'survey-card';
        card.innerHTML = `
          <div class="survey-badges">
            <span class="badge public">🌐 Опубликован</span>
            ${isMine ? `<span class="badge">✎ Мой</span>` : ''}
            ${!isMine && owner && isAdmin ? `<span class="badge">👤 ${escapeHtml(owner.name)}</span>` : ''}
          </div>
          <h3>${escapeHtml(s.title)}</h3>
          <p class="desc">${escapeHtml(s.description || 'Без описания')}</p>
          <div class="survey-meta">
            <span>📝 ${s.questions.length} вопр.</span>
            <span>👥 ${count} ответов</span>
          </div>
          <div class="survey-actions">
            <button class="btn btn-primary btn-sm" data-act="run" data-id="${s.id}">Пройти</button>
            ${isMine ? `
              <button class="btn btn-ghost btn-sm" data-act="results" data-id="${s.id}">📊 Результаты</button>
              <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${s.id}">✎</button>
            ` : ''}
            ${s.isPublic ? `<button class="btn btn-ghost btn-sm" data-act="copy" data-id="${s.id}" title="Публичная ссылка">🔗</button>` : ''}
          </div>
        `;
        grid.appendChild(card);
      });
      list.appendChild(grid);

      list.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const { act, id } = btn.dataset;
        if (act === 'run') Router.go(`/run/${id}`);
        if (act === 'results') Router.go(`/results/${id}`);
        if (act === 'edit') Router.go(`/edit/${id}`);
        if (act === 'copy') {
          const url = `${location.origin}${location.pathname}#/survey/${id}`;
          try { await navigator.clipboard.writeText(url); Toast.show('Ссылка скопирована', 'success'); }
          catch { prompt('Скопируйте ссылку:', url); }
        }
      });
    },

    builder(root, { id } = {}) {
      const user = Data.currentUser();
      const editing = !!id;
      const existing = editing ? Data.getSurvey(id) : null;

      if (editing && (!existing || (existing.ownerId !== user.id && user.role !== 'admin'))) {
        root.innerHTML = T.emptyState('❌', 'Опрос не найден', 'Или у вас нет прав на его редактирование');
        return;
      }

      const backPath = user.role === 'admin' ? '#/admin' : '#/home';

      root.innerHTML = `
        <div class="builder-header">
          <div>
            <h1 class="page-title">${editing ? '✎ Редактирование' : '➕ Новый опрос'}</h1>
            <p class="page-subtitle">${editing ? 'Изменения появятся сразу после сохранения' : 'Создайте вопросы и опубликуйте опрос'}</p>
          </div>
          <button class="btn btn-ghost" data-nav="${backPath}">← Назад</button>
        </div>

        <div class="card">
          <div class="field">
            <label for="surveyTitle">Название *</label>
            <input class="input" id="surveyTitle" maxlength="120"
              value="${editing ? escapeHtml(existing.title) : ''}" placeholder="Например: Удовлетворённость продуктом" />
          </div>
          <div class="field">
            <label for="surveyDesc">Описание</label>
            <textarea class="textarea" id="surveyDesc" maxlength="300"
              placeholder="Краткое описание">${editing ? escapeHtml(existing.description || '') : ''}</textarea>
          </div>
          <div style="display:flex;gap:20px;flex-wrap:wrap;">
            <label class="checkbox-row">
              <input type="checkbox" id="surveyPublic" ${!editing || existing.isPublic ? 'checked' : ''} />
              <span>Публичная ссылка (доступна без входа)</span>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" id="surveyPublished" ${!editing || existing.published ? 'checked' : ''} />
              <span>Опубликовать</span>
            </label>
          </div>
        </div>

        <h2 style="margin:28px 0 16px;font-size:1.2rem;">Вопросы</h2>
        <div id="questionsWrap"></div>

        <div style="margin-top:16px;">
          <button class="btn btn-ghost" id="addQuestionBtn">➕ Добавить вопрос</button>
        </div>

        <div style="display:flex;gap:12px;margin-top:28px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="saveSurveyBtn">
            ${editing ? '💾 Сохранить изменения' : '💾 Создать опрос'}
          </button>
          <button class="btn btn-ghost" data-nav="${backPath}">Отмена</button>
        </div>
      `;

      const questionsWrap = $('#questionsWrap');
      let questions = editing
        ? existing.questions.map((q) => ({ ...q, options: [...q.options] }))
        : [{ id: uid(), type: 'single', text: '', options: ['', ''], required: true }];

      function renderQuestions() {
        questionsWrap.innerHTML = '';
        questions.forEach((q, qi) => {
          const block = document.createElement('div');
          block.className = 'question-block';
          block.dataset.qi = qi;

          const typeSelector = `
            <div class="type-selector">
              <button class="type-btn ${q.type === 'single' ? 'active' : ''}" data-type="single" data-qi="${qi}">Один вариант</button>
              <button class="type-btn ${q.type === 'text' ? 'active' : ''}" data-type="text" data-qi="${qi}">Открытый</button>
              <button class="type-btn ${q.type === 'rating' ? 'active' : ''}" data-type="rating" data-qi="${qi}">Оценка 1–5</button>
            </div>
          `;

          let optionsHtml = '';
          if (q.type === 'single') {
            optionsHtml = `
              <div class="field" style="margin-bottom:8px;"><label>Варианты ответов * (2–8)</label></div>
              <div data-options="${qi}">
                ${q.options.map((opt, oi) => `
                  <div class="option-row">
                    <input class="input" data-opt-text="${qi}-${oi}" value="${escapeHtml(opt)}"
                      placeholder="Вариант ${oi + 1}" maxlength="120" />
                    <button class="btn-icon" data-remove-opt="${qi}-${oi}" title="Удалить">✕</button>
                  </div>
                `).join('')}
              </div>
              <button class="btn btn-ghost btn-sm" data-add-opt="${qi}" style="margin-top:8px;">➕ Добавить вариант</button>
            `;
          } else if (q.type === 'text') {
            optionsHtml = `<div class="field-hint" style="padding:10px 0;">Респондент введёт ответ в свободной форме.</div>`;
          } else {
            optionsHtml = `
              <div class="field-hint" style="padding:6px 0;">Респондент выставит оценку от 1 до 5 звёзд.</div>
              <div style="display:flex;gap:6px;font-size:1.8rem;color:var(--star);">${'★'.repeat(5)}</div>
            `;
          }

          block.innerHTML = `
            <div class="question-block-header">
              <span class="question-num">Вопрос ${qi + 1}</span>
              <div class="q-controls">
                ${typeSelector}
                <button class="btn-icon" data-remove-q="${qi}" title="Удалить вопрос">✕</button>
              </div>
            </div>
            <div class="field">
              <label>Текст вопроса *</label>
              <input class="input" data-q-text="${qi}" value="${escapeHtml(q.text)}"
                placeholder="Введите вопрос" maxlength="200" />
            </div>
            ${optionsHtml}
            <label class="checkbox-row" style="margin-top:12px;">
              <input type="checkbox" data-q-required="${qi}" ${q.required ? 'checked' : ''} />
              <span>Обязательный вопрос</span>
            </label>
          `;
          questionsWrap.appendChild(block);
        });
        bindQuestionEvents();
      }

      function bindQuestionEvents() {
        questionsWrap.querySelectorAll('[data-remove-q]').forEach((b) =>
          b.addEventListener('click', () => {
            if (questions.length === 1) { Toast.show('Минимум 1 вопрос', 'error'); return; }
            questions.splice(+b.dataset.removeQ, 1);
            renderQuestions();
          })
        );
        questionsWrap.querySelectorAll('[data-type]').forEach((b) =>
          b.addEventListener('click', () => {
            const qi = +b.dataset.qi;
            questions[qi].type = b.dataset.type;
            if (b.dataset.type === 'single' && questions[qi].options.length < 2) {
              questions[qi].options = ['', ''];
            }
            renderQuestions();
          })
        );
        questionsWrap.querySelectorAll('[data-add-opt]').forEach((b) =>
          b.addEventListener('click', () => {
            const qi = +b.dataset.addOpt;
            if (questions[qi].options.length >= 8) { Toast.show('Максимум 8 вариантов', 'error'); return; }
            questions[qi].options.push('');
            renderQuestions();
          })
        );
        questionsWrap.querySelectorAll('[data-remove-opt]').forEach((b) =>
          b.addEventListener('click', () => {
            const [qi, oi] = b.dataset.removeOpt.split('-').map(Number);
            if (questions[qi].options.length <= 2) { Toast.show('Минимум 2 варианта', 'error'); return; }
            questions[qi].options.splice(oi, 1);
            renderQuestions();
          })
        );
        questionsWrap.querySelectorAll('[data-q-text]').forEach((inp) =>
          inp.addEventListener('input', () => { questions[+inp.dataset.qText].text = inp.value; })
        );
        questionsWrap.querySelectorAll('[data-opt-text]').forEach((inp) =>
          inp.addEventListener('input', () => {
            const [qi, oi] = inp.dataset.optText.split('-').map(Number);
            questions[qi].options[oi] = inp.value;
          })
        );
        questionsWrap.querySelectorAll('[data-q-required]').forEach((chk) =>
          chk.addEventListener('change', () => { questions[+chk.dataset.qRequired].required = chk.checked; })
        );
      }

      $('#addQuestionBtn').addEventListener('click', () => {
        if (questions.length >= 30) { Toast.show('Максимум 30 вопросов', 'error'); return; }
        questions.push({ id: uid(), type: 'single', text: '', options: ['', ''], required: true });
        renderQuestions();
      });

      $('#saveSurveyBtn').addEventListener('click', () => {
        const title = $('#surveyTitle').value.trim();
        const description = $('#surveyDesc').value.trim();
        const isPublic = $('#surveyPublic').checked;
        const published = $('#surveyPublished').checked;

        if (!title) { Toast.show('Введите название', 'error'); return; }
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (!q.text.trim()) { Toast.show(`Вопрос ${i + 1}: введите текст`, 'error'); return; }
          if (q.type === 'single' && q.options.filter((o) => o.trim()).length < 2) {
            Toast.show(`Вопрос ${i + 1}: минимум 2 варианта`, 'error'); return;
          }
        }

        const cleaned = questions.map((q) => ({
          id: q.id || uid(),
          type: q.type,
          text: q.text.trim(),
          required: !!q.required,
          options: q.type === 'single' ? q.options.map((o) => o.trim()).filter(Boolean) : []
        }));

        if (editing) {
          Data.updateSurvey(id, { title, description, questions: cleaned, isPublic, published });
          Toast.show('Сохранено', 'success');
        } else {
          Data.createSurvey({ title, description, questions: cleaned, isPublic, published }, user.id);
          Toast.show('Опрос создан', 'success');
        }
        Router.go(user.role === 'admin' ? '/admin' : '/home');
      });

      renderQuestions();
    },

    run(root, { id }) {
      const user = Data.currentUser();
      const survey = Data.getSurvey(id);
      if (!survey) { root.innerHTML = T.emptyState('❌', 'Опрос не найден', ''); return; }
      renderRun(root, survey, { userId: user.id });
    },
    publicRun(root, { id }) {
      const survey = Data.getSurvey(id);
      if (!survey || !survey.isPublic || !survey.published) { Views.publicError(root); return; }
      renderRun(root, survey, { guest: true });
    },
    publicError(root) {
      root.innerHTML = `
        <div class="auth-wrap">
          <div class="card" style="text-align:center;">
            <div style="font-size:3rem;margin-bottom:12px;">🔒</div>
            <h1 class="page-title">Опрос недоступен</h1>
            <p class="page-subtitle">Ссылка недействительна или опрос не опубликован</p>
            <a href="#/" class="btn btn-primary" style="margin-top:12px;">На главную</a>
          </div>
        </div>`;
    },

    results(root, { id }) {
      const user = Data.currentUser();
      const stats = Data.getSurveyStats(id);
      if (!stats) { root.innerHTML = T.emptyState('❌', 'Опрос не найден', ''); return; }
      const { survey, total, questionsStats } = stats;

      const owner = Data.getAllUsers().find((u) => u.id === survey.ownerId);
      const ownerIsAdmin = owner?.role === 'admin';

      if (survey.ownerId !== user.id && user.role !== 'admin') {
        root.innerHTML = T.emptyState('🔒', 'Нет доступа', 'Это чужой опрос');
        return;
      }
      if (user.role !== 'admin' && ownerIsAdmin && survey.ownerId !== user.id) {
        root.innerHTML = T.emptyState('🔒', 'Нет доступа', 'Это чужой опрос');
        return;
      }

      const publicUrl = `${location.origin}${location.pathname}#/survey/${survey.id}`;
      const backPath = user.role === 'admin' ? '#/admin' : '#/home';

      root.innerHTML = `
        <div class="builder-header">
          <div>
            <h1 class="page-title">${escapeHtml(survey.title)}</h1>
            <p class="page-subtitle">Всего ответов: ${total}</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-ghost" data-nav="${backPath}">← Назад</button>
            <button class="btn btn-ghost" id="csvBtn">⬇ CSV</button>
            <button class="btn btn-ghost" id="jsonBtn">⬇ JSON</button>
          </div>
        </div>

        ${survey.isPublic ? `
          <div class="card" style="margin-bottom:20px;">
            <label style="font-weight:600;font-size:.9rem;">Публичная ссылка</label>
            <div class="public-link-box">
              <code>${escapeHtml(publicUrl)}</code>
              <button class="btn btn-primary btn-sm" id="copyLinkBtn">Копировать</button>
            </div>
          </div>` : ''}

        <div class="summary-card">
          <p style="color:var(--text-muted);">Всего ответов</p>
          <div class="big">${total}</div>
        </div>

        <h2 style="margin:0 0 16px;font-size:1.15rem;">📊 Аналитика по вопросам</h2>
        ${questionsStats.map((qs, idx) => renderQuestionStats(qs, idx, total)).join('')}

        <h2 style="margin:28px 0 16px;font-size:1.15rem;">📋 Таблица всех ответов</h2>
        <div id="responsesTableWrap"></div>
      `;

      renderResponsesTable($('#responsesTableWrap'), survey, stats.responses);
      setTimeout(() => renderCharts(survey, questionsStats), 60);

      $('#copyLinkBtn')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(publicUrl); Toast.show('Ссылка скопирована', 'success'); }
        catch { prompt('Скопируйте ссылку:', publicUrl); }
      });
      $('#csvBtn')?.addEventListener('click', () => exportCSV(survey));
      $('#jsonBtn')?.addEventListener('click', () => exportJSON(survey));
    },

    stats(root) {
      const user = Data.currentUser();
      const mySurveys = Data.getSurveysByUser(user.id);
      const ids = new Set(mySurveys.map((s) => s.id));
      const myResponses = Data.getAllResponses().filter((r) => ids.has(r.surveyId));

      root.innerHTML = `
        <h1 class="page-title">📈 Моя статистика</h1>
        <p class="page-subtitle">Общая картина по вашим опросам</p>

        <div class="stats-grid">
          <div class="stat-card"><div class="value">${mySurveys.length}</div><div class="label">Опросов</div></div>
          <div class="stat-card"><div class="value">${mySurveys.filter(s=>s.published).length}</div><div class="label">Опубликовано</div></div>
          <div class="stat-card"><div class="value">${myResponses.length}</div><div class="label">Ответов</div></div>
          <div class="stat-card"><div class="value">${mySurveys.reduce((a,s)=>a+s.questions.length,0)}</div><div class="label">Вопросов</div></div>
        </div>

        <div id="statsList"></div>
      `;

      const list = $('#statsList');
      if (!mySurveys.length) {
        list.innerHTML = T.emptyState('📊', 'Нет данных', 'Создайте первый опрос');
        return;
      }
      const wrap = document.createElement('div');
      mySurveys.forEach((s) => {
        const count = Data.getResponses(s.id).length;
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;';
        card.innerHTML = `
          <div>
            <div style="font-weight:700;">${escapeHtml(s.title)}</div>
            <div style="color:var(--text-muted);font-size:.85rem;margin-top:4px;">
              ${s.questions.length} вопросов · ${count} ответов · ${s.published ? '🌐 опубликован' : '⏸ черновик'}
            </div>
          </div>
          <button class="btn btn-primary btn-sm" data-view="${s.id}">Открыть</button>
        `;
        wrap.appendChild(card);
      });
      list.appendChild(wrap);
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-view]');
        if (btn) Router.go(`/results/${btn.dataset.view}`);
      });
    },

    auth(root) {
      let mode = 'login';

      function renderForm() {
        root.innerHTML = `
          <div class="auth-wrap">
            <div class="card">
              <h1 class="page-title" style="text-align:center;font-size:1.6rem;">SurveyPro</h1>
              <p class="page-subtitle" style="text-align:center;">Войдите, чтобы продолжить</p>

              <div class="demo-hint">
                <strong>🔑 Демо-доступ</strong>
                <div>Пользователь: <code>user@survey.pro</code> / <code>user123</code></div>
              </div>

              <div class="auth-tabs">
                <button class="auth-tab ${mode === 'login' ? 'active' : ''}" data-mode="login">Вход</button>
                <button class="auth-tab ${mode === 'register' ? 'active' : ''}" data-mode="register">Регистрация</button>
              </div>

              <form id="authForm">
                ${mode === 'register' ? `
                  <div class="field">
                    <label for="authName">Имя</label>
                    <input class="input" id="authName" placeholder="Ваше имя" required minlength="2" maxlength="40" />
                  </div>` : ''}
                <div class="field">
                  <label for="authEmail">Email</label>
                  <input class="input" id="authEmail" type="email" placeholder="you@example.com" required />
                </div>
                <div class="field">
                  <label for="authPassword">Пароль</label>
                  <input class="input" id="authPassword" type="password" placeholder="Минимум 6 символов" required minlength="6" />
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%;">
                  ${mode === 'login' ? 'Войти' : 'Создать аккаунт'}
                </button>
              </form>
            </div>
          </div>
        `;

        $$('.auth-tab').forEach((t) => t.addEventListener('click', () => {
          mode = t.dataset.mode;
          renderForm();
        }));

        $('#authForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const email = $('#authEmail').value.trim();
          const password = $('#authPassword').value;
          try {
            let u;
            if (mode === 'register') {
              const name = $('#authName').value.trim();
              if (!name) throw new Error('Введите имя');
              u = Data.register(name, email, password);
              Toast.show('Добро пожаловать!', 'success');
            } else {
              u = Data.login(email, password);
              Toast.show('С возвращением!', 'success');
            }
            Router.go(u.role === 'admin' ? '/admin' : '/home');
          } catch (err) { Toast.show(err.message, 'error'); }
        });
      }
      renderForm();
    }
  };

  // ==================== Прохождение ====================
  function renderRun(root, survey, meta) {
    let current = 0;
    const answers = {};
    const total = survey.questions.length;

    function isAnswered(q) {
      const v = answers[q.id];
      if (q.type === 'text') return typeof v === 'string' && v.trim().length > 0;
      if (q.type === 'rating') return typeof v === 'number' && v >= 1 && v <= 5;
      return typeof v === 'number' && v >= 0;
    }
    function allRequiredAnswered() {
      return survey.questions.every((q) => !q.required || isAnswered(q));
    }

    root.innerHTML = `<div class="survey-run" id="surveyRunRoot"></div>`;
    const runRoot = $('#surveyRunRoot');

    function render() {
      const answeredCount = Object.keys(answers).length;
      const progress = Math.round((answeredCount / total) * 100);
      const q = survey.questions[current];
      const selected = answers[q.id];

      let answerHtml = '';
      if (q.type === 'single') {
        answerHtml = q.options.map((opt, i) => `
          <button class="option-btn ${selected === i ? 'selected' : ''}" data-opt="${i}">
            <span class="option-radio"></span><span>${escapeHtml(opt)}</span>
          </button>
        `).join('');
      } else if (q.type === 'text') {
        answerHtml = `
          <textarea class="textarea" id="textAnswer" placeholder="Введите ваш ответ..." maxlength="1000">${escapeHtml(selected || '')}</textarea>
          <div class="field-hint" id="textCounter">${(selected || '').length} / 1000</div>
        `;
      } else {
        const labels = ['', 'Ужасно', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];
        answerHtml = `
          <div class="stars-row">
            ${[1,2,3,4,5].map((n) => `
              <button class="star-btn ${selected >= n ? 'active' : ''}" data-star="${n}" title="${labels[n]}">★</button>
            `).join('')}
          </div>
          <div class="stars-label">${selected ? `${selected} из 5 — ${labels[selected]}` : 'Нажмите на звезду'}</div>
        `;
      }

      const isLast = current === total - 1;
      const canProceed = !q.required || isAnswered(q);
      const canFinish = allRequiredAnswered();

      runRoot.innerHTML = `
        <div class="builder-header">
          <div>
            <h1 class="page-title">${escapeHtml(survey.title)}</h1>
            ${survey.description ? `<p class="page-subtitle">${escapeHtml(survey.description)}</p>` : ''}
          </div>
          ${meta.guest ? '' : `<button class="btn btn-ghost" data-nav="#/home">← Выйти</button>`}
        </div>

        <div class="progress-wrap">
          <span class="progress-text">${answeredCount} / ${total}</span>
          <div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>
        </div>

        <div class="card question-run">
          <div class="q-text">
            <span class="q-num">${current + 1}</span>
            <span>${escapeHtml(q.text)}${q.required ? '<span class="required-mark">*</span>' : ''}</span>
          </div>
          <div>${answerHtml}</div>
        </div>

        <div class="run-nav">
          <button class="btn btn-ghost" id="prevBtn" ${current === 0 ? 'disabled' : ''}>← Назад</button>
          ${isLast
            ? `<button class="btn btn-primary" id="finishBtn" ${!canFinish ? 'disabled' : ''}>Завершить ✓</button>`
            : `<button class="btn btn-primary" id="nextBtn" ${!canProceed ? 'disabled' : ''}>Далее →</button>`}
        </div>
      `;

      if (q.type === 'single') {
        runRoot.querySelectorAll('[data-opt]').forEach((b) =>
          b.addEventListener('click', () => { answers[q.id] = +b.dataset.opt; render(); })
        );
      } else if (q.type === 'text') {
        const ta = $('#textAnswer');
        ta.addEventListener('input', () => {
          answers[q.id] = ta.value;
          $('#textCounter').textContent = `${ta.value.length} / 1000`;
          const btn = $('#nextBtn') || $('#finishBtn');
          if (btn) btn.disabled = isLast ? !allRequiredAnswered() : (q.required && !isAnswered(q));
        });
      } else {
        runRoot.querySelectorAll('[data-star]').forEach((b) =>
          b.addEventListener('click', () => { answers[q.id] = +b.dataset.star; render(); })
        );
      }

      $('#prevBtn')?.addEventListener('click', () => { current--; render(); });
      $('#nextBtn')?.addEventListener('click', () => { current++; render(); });
      $('#finishBtn')?.addEventListener('click', () => {
        if (!allRequiredAnswered()) { Toast.show('Ответьте на обязательные вопросы', 'error'); return; }
        Data.addResponse(survey.id, { ...answers }, meta);
        Toast.show('Спасибо! Ответы сохранены', 'success');
        if (meta.guest) {
          root.innerHTML = `
            <div class="auth-wrap">
              <div class="card" style="text-align:center;">
                <div style="font-size:3rem;margin-bottom:12px;">🎉</div>
                <h1 class="page-title">Спасибо!</h1>
                <p class="page-subtitle">Ваши ответы записаны</p>
                <a href="#/" class="btn btn-primary" style="margin-top:12px;">На главную</a>
              </div>
            </div>`;
        } else {
          Router.go(`/results/${survey.id}`);
        }
      });
    }
    render();
  }

  // ==================== Статистика вопроса ====================
  function renderQuestionStats(qs, idx, total) {
    const { question, percents, counts, texts, average } = qs;

    if (question.type === 'text') {
      const nonEmpty = texts || [];
      return `
        <div class="result-question">
          <div class="result-q-text">
            <span class="q-num">${idx + 1}</span>
            ${escapeHtml(question.text)}
            <span class="badge type">Открытый ответ</span>
          </div>
          ${nonEmpty.length
            ? `<div class="text-answers-list">
                ${nonEmpty.slice(0, 30).map((t) => `<div class="text-answer">${escapeHtml(t)}</div>`).join('')}
              </div>
              ${nonEmpty.length > 30 ? `<div style="margin-top:8px;color:var(--text-muted);font-size:.82rem;">…и ещё ${nonEmpty.length - 30}</div>` : ''}`
            : `<div style="color:var(--text-muted);font-size:.9rem;">Пока нет ответов</div>`}
        </div>`;
    }

    if (question.type === 'rating') {
      const labels = ['1 ★', '2 ★', '3 ★', '4 ★', '5 ★'];
      const rows = labels.map((label, i) => {
        const p = percents[i];
        return `
          <div class="stat-row">
            <span class="stat-label">${label}</span>
            <div class="stat-track"><div class="stat-fill" data-fill="${idx}-${i}" style="width:0%;">${p > 12 ? p + '%' : ''}</div></div>
            <span class="stat-percent">${p}% <span style="color:var(--text-muted);font-weight:400;">(${counts[i]})</span></span>
          </div>`;
      }).join('');
      setTimeout(() => labels.forEach((_, i) => {
        const el = document.querySelector(`[data-fill="${idx}-${i}"]`);
        if (el) el.style.width = percents[i] + '%';
      }), 30);
      return `
        <div class="result-question">
          <div class="result-q-text">
            <span class="q-num">${idx + 1}</span>
            ${escapeHtml(question.text)}
            <span class="badge type">Средняя: ${average} ★</span>
          </div>
          <div class="result-block">
            <div>
              ${rows}
              <div style="margin-top:12px;color:var(--text-muted);font-size:.82rem;">Оценили: ${qs.ratingsCount} из ${total}</div>
            </div>
            <div class="chart-wrap"><canvas id="chart-q-${idx}"></canvas></div>
          </div>
        </div>`;
    }

    const rows = question.options.map((opt, i) => {
      const p = percents[i];
      return `
        <div class="stat-row">
          <span class="stat-label" title="${escapeHtml(opt)}">${escapeHtml(opt)}</span>
          <div class="stat-track"><div class="stat-fill" data-fill="${idx}-${i}" style="width:0%;">${p > 12 ? p + '%' : ''}</div></div>
          <span class="stat-percent">${p}% <span style="color:var(--text-muted);font-weight:400;">(${counts[i]})</span></span>
        </div>`;
    }).join('');
    setTimeout(() => question.options.forEach((_, i) => {
      const el = document.querySelector(`[data-fill="${idx}-${i}"]`);
      if (el) el.style.width = percents[i] + '%';
    }), 30);

    return `
      <div class="result-question">
        <div class="result-q-text">
          <span class="q-num">${idx + 1}</span>
          ${escapeHtml(question.text)}
          <span class="badge type">Один вариант</span>
        </div>
        <div class="result-block">
          <div>
            ${rows}
            <div style="margin-top:12px;color:var(--text-muted);font-size:.82rem;">Ответили: ${total}</div>
          </div>
          <div class="chart-wrap"><canvas id="chart-q-${idx}"></canvas></div>
        </div>
      </div>`;
  }

  // ==================== Chart.js ====================
  function renderCharts(survey, questionsStats) {
    if (typeof Chart === 'undefined') return;
    const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#84cc16'];
    questionsStats.forEach((qs, idx) => {
      const canvas = document.getElementById(`chart-q-${idx}`);
      if (!canvas) return;
      const { question } = qs;
      if (question.type === 'single') {
        Charts.instances.push(new Chart(canvas, {
          type: 'doughnut',
          data: {
            labels: question.options,
            datasets: [{
              data: qs.counts,
              backgroundColor: question.options.map((_, i) => palette[i % palette.length]),
              borderWidth: 2, borderColor: '#fff'
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 700, easing: 'easeOutQuart' },
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
            }
          }
        }));
      } else if (question.type === 'rating') {
        Charts.instances.push(new Chart(canvas, {
          type: 'bar',
          data: {
            labels: ['1 ★', '2 ★', '3 ★', '4 ★', '5 ★'],
            datasets: [{
              label: 'Количество',
              data: qs.counts,
              backgroundColor: ['#ef4444', '#f59e0b', '#eab308', '#84cc16', '#10b981'],
              borderRadius: 8
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 700, easing: 'easeOutQuart' },
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
          }
        }));
      }
    });
  }

  // ==================== Таблица ответов ====================
  function renderResponsesTable(wrap, survey, responses) {
    if (!responses.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="icon">📋</div><h3>Ответов пока нет</h3></div>`;
      return;
    }
    const sorted = [...responses].sort((a, b) => b.createdAt - a.createdAt);

    const thead = `
      <tr>
        <th style="width:40px;">#</th>
        <th style="width:130px;">Дата</th>
        <th style="width:100px;">Источник</th>
        ${survey.questions.map((q, i) => `<th>В${i + 1}. ${escapeHtml(q.text.slice(0, 40))}${q.text.length > 40 ? '…' : ''}</th>`).join('')}
      </tr>
    `;
    const rows = sorted.map((r, idx) => {
      const cells = survey.questions.map((q) => {
        const v = r.answers[q.id];
        let display = '—';
        if (v !== undefined && v !== null && v !== '') {
          if (q.type === 'single') display = q.options[v] ?? '—';
          else if (q.type === 'rating') display = v + ' ★';
          else display = String(v);
        }
        return `<td>${escapeHtml(display)}</td>`;
      }).join('');
      const source = r.guest ? '🔗 Гость' : (r.userId ? '👤 Пользователь' : '—');
      return `<tr><td class="cell-num">${idx + 1}</td><td class="cell-num">${formatDate(r.createdAt)}</td><td>${source}</td>${cells}</tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="responses-table-wrap">
        <table class="responses-table">
          <thead>${thead}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p style="margin-top:10px;color:var(--text-muted);font-size:.82rem;">
        Показаны все ${responses.length} ответов. Новые — сверху.
      </p>
    `;
  }

  // ==================== CSV / JSON ====================
  function exportCSV(survey) {
    const responses = Data.getResponses(survey.id);
    if (!responses.length) { Toast.show('Нет ответов', 'error'); return; }
    const headers = ['ID', 'Дата', 'Источник'];
    survey.questions.forEach((q, i) => headers.push(`В${i + 1}: ${q.text.replace(/\s+/g, ' ').slice(0, 80)}`));
    const sorted = [...responses].sort((a, b) => a.createdAt - b.createdAt);
    const rows = sorted.map((r) => {
      const source = r.guest ? 'Гость' : 'Пользователь';
      const row = [r.id, formatDate(r.createdAt), source];
      survey.questions.forEach((q) => {
        const v = r.answers[q.id];
        if (v === undefined || v === null || v === '') row.push('');
        else if (q.type === 'single') row.push(q.options[v] || '');
        else if (q.type === 'rating') row.push(v + ' из 5');
        else row.push(String(v).replace(/\r?\n/g, ' '));
      });
      return row;
    });
    const escapeCsv = (val) => {
      const s = String(val ?? '');
      if (/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${sanitizeFilename(survey.title)}-answers-${Date.now()}.csv`);
    Toast.show('CSV экспортирован', 'success');
  }
  function exportJSON(survey) {
    const responses = Data.getResponses(survey.id);
    const data = {
      survey: { id: survey.id, title: survey.title, description: survey.description, questions: survey.questions },
      responses: responses.map((r) => ({
        id: r.id, createdAt: new Date(r.createdAt).toISOString(),
        source: r.guest ? 'guest' : 'user', answers: r.answers
      })),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${sanitizeFilename(survey.title)}-${Date.now()}.json`);
    Toast.show('JSON экспортирован', 'success');
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function sanitizeFilename(name) {
    return String(name).replace(/[^\wа-яА-ЯёЁ\-]+/gi, '_').slice(0, 60) || 'survey';
  }

  // ==================== Шаблоны ====================
  const T = {
    emptyState(icon, title, text) {
      return `<div class="empty-state"><div class="icon">${icon}</div>
        <h3>${escapeHtml(title)}</h3>
        <p style="margin-top:8px;">${escapeHtml(text)}</p></div>`;
    }
  };

  // ==================== Демо-данные ====================
  function seedDemo() {
    const state = Storage.load();
    if (state.users.length) return;

    const admin = {
      id: uid(), name: 'Администратор', email: 'admin@survey.pro',
      passwordHash: hashPassword('admin123'),
      role: 'admin', createdAt: Date.now()
    };
    const user1 = {
      id: uid(), name: 'Иван', email: 'user@survey.pro',
      passwordHash: hashPassword('user123'),
      role: 'user', createdAt: Date.now()
    };
    state.users.push(admin, user1);

    const q1 = { id: uid(), type: 'single', text: 'Как часто вы пользуетесь продуктом?', required: true, options: ['Ежедневно', 'Несколько раз в неделю', 'Раз в неделю', 'Реже'] };
    const q2 = { id: uid(), type: 'rating', text: 'Оцените продукт по 5-балльной шкале', required: true, options: [] };
    const q3 = { id: uid(), type: 'single', text: 'Порекомендуете нас друзьям?', required: false, options: ['Обязательно', 'Скорее да', 'Не уверен', 'Скорее нет', 'Нет'] };
    const q4 = { id: uid(), type: 'text', text: 'Что бы вы улучшили?', required: false, options: [] };
    const surveyAdmin = {
      id: uid(), ownerId: admin.id,
      title: 'Удовлетворённость продуктом',
      description: 'Помогите нам стать лучше — 4 коротких вопроса',
      isPublic: true, published: true,
      questions: [q1, q2, q3, q4],
      createdAt: Date.now(), updatedAt: Date.now()
    };
    state.surveys.push(surveyAdmin);

    const uq1 = { id: uid(), type: 'single', text: 'Любимый язык программирования?', required: true, options: ['JavaScript', 'Python', 'Java', 'C#'] };
    const uq2 = { id: uid(), type: 'rating', text: 'Оцените удобство нашего сайта', required: true, options: [] };
    const surveyUser = {
      id: uid(), ownerId: user1.id,
      title: 'Опрос разработчика',
      description: 'Короткий опрос про предпочтения в программировании',
      isPublic: false, published: true,
      questions: [uq1, uq2],
      createdAt: Date.now(), updatedAt: Date.now()
    };
    state.surveys.push(surveyUser);

    const demoAnswers = [
      { [q1.id]: 0, [q2.id]: 5, [q3.id]: 0, [q4.id]: 'Всё отлично, спасибо!' },
      { [q1.id]: 1, [q2.id]: 4, [q3.id]: 1, [q4.id]: 'Добавьте тёмную тему' },
      { [q1.id]: 0, [q2.id]: 5, [q3.id]: 0, [q4.id]: '' },
      { [q1.id]: 2, [q2.id]: 3, [q3.id]: 2, [q4.id]: 'Больше интеграций' },
      { [q1.id]: 3, [q2.id]: 2, [q3.id]: 3, [q4.id]: 'Улучшить документацию' },
      { [q1.id]: 0, [q2.id]: 5, [q3.id]: 0, [q4.id]: 'Отличная работа!' },
      { [q1.id]: 1, [q2.id]: 4, [q3.id]: 1, [q4.id]: 'Хочу экспорт в PDF' },
      { [q1.id]: 0, [q2.id]: 5, [q3.id]: 0, [q4.id]: 'Всё нравится' }
    ];
    demoAnswers.forEach((ans) => {
      state.responses.push({
        id: uid(), surveyId: surveyAdmin.id, answers: ans,
        userId: admin.id,
        createdAt: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000
      });
    });
    state.responses.push({
      id: uid(), surveyId: surveyUser.id,
      answers: { [uq1.id]: 0, [uq2.id]: 5 },
      userId: user1.id, createdAt: Date.now()
    });

    Storage.save(state);
    Data._state = state;
  }

  // ==================== Инициализация ====================
  function init() {
    seedDemo();
    Modal.init();
    window.addEventListener('hashchange', () => Router.render());
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-nav]');
      if (btn) { e.preventDefault(); Router.go(btn.dataset.nav); }
    });
    Router.render();
    if (!location.hash) location.hash = '#/';
  }

  document.addEventListener('DOMContentLoaded', init);
})();