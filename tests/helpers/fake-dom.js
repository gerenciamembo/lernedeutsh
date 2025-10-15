class FakeClassList {
  constructor(initial = []) {
    this._set = new Set(initial);
  }

  add(...classes) {
    classes.filter(Boolean).forEach((cls) => this._set.add(cls));
  }

  remove(...classes) {
    classes.forEach((cls) => this._set.delete(cls));
  }

  toggle(cls, force) {
    if (force === true) {
      this._set.add(cls);
      return true;
    }
    if (force === false) {
      this._set.delete(cls);
      return false;
    }
    if (this._set.has(cls)) {
      this._set.delete(cls);
      return false;
    }
    this._set.add(cls);
    return true;
  }

  contains(cls) {
    return this._set.has(cls);
  }

  values() {
    return Array.from(this._set);
  }
}

function toDatasetKey(attributeName) {
  return attributeName
    .split('-')
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

class FakeElement {
  constructor({ id = null, tagName = 'div', classNames = [], textContent = '', innerHTML = '' } = {}) {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.textContent = textContent;
    this.innerHTML = innerHTML;
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList(classNames);
    this._attributes = new Map();
    this._listeners = new Map();
    this.disabled = false;
  }

  setAttribute(name, value) {
    this._attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      const dataKey = toDatasetKey(name.slice(5));
      this.dataset[dataKey] = String(value);
    }
    if (this._notifyDocumentAboutAttribute) {
      this._notifyDocumentAboutAttribute(name);
    }
  }

  getAttribute(name) {
    if (this._attributes.has(name)) {
      return this._attributes.get(name);
    }
    if (name.startsWith('data-')) {
      const dataKey = toDatasetKey(name.slice(5));
      if (dataKey in this.dataset) {
        return this.dataset[dataKey];
      }
    }
    return null;
  }

  getAttributeNames() {
    return Array.from(this._attributes.keys());
  }

  removeAttribute(name) {
    this._attributes.delete(name);
    if (name.startsWith('data-')) {
      const dataKey = toDatasetKey(name.slice(5));
      delete this.dataset[dataKey];
    }
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  addEventListener(type, handler) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    this._listeners.get(type).push(handler);
  }

  reset() {
    this.textContent = '';
  }

  focus() {}

  setPointerCapture() {}

  releasePointerCapture() {}
}

class FakeDocument {
  constructor() {
    this.documentElement = { lang: 'es', dataset: { theme: 'dark' } };
    this.title = 'Entrenador de Mazos';
    this.body = new FakeElement({ tagName: 'body' });
    this.head = new FakeElement({ tagName: 'head' });
    this._elementsById = new Map();
    this._elementsByClass = new Map();
    this._dataI18nElements = new Set();
    this._dataI18nAttrElements = new Set();
  }

  registerElement(element) {
    element.ownerDocument = this;
    if (element.id) {
      this._elementsById.set(element.id, element);
    }
    element.classList.values().forEach((cls) => {
      if (!this._elementsByClass.has(cls)) {
        this._elementsByClass.set(cls, new Set());
      }
      this._elementsByClass.get(cls).add(element);
    });
    this._refreshAttributeCaches(element);
    element._notifyDocumentAboutAttribute = (name) => {
      if (name === 'data-i18n') {
        this._dataI18nElements.add(element);
      }
      if (name.startsWith('data-i18n-attr-')) {
        this._dataI18nAttrElements.add(element);
      }
    };
    this.body.appendChild(element);
    return element;
  }

  _refreshAttributeCaches(element) {
    if (element.dataset && element.dataset.i18n) {
      this._dataI18nElements.add(element);
    }
    if (element
      .getAttributeNames()
      .some((name) => name.startsWith('data-i18n-attr-'))
    ) {
      this._dataI18nAttrElements.add(element);
    }
  }

  getElementById(id) {
    return this._elementsById.get(id) || null;
  }

  querySelector(selector) {
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      const set = this._elementsByClass.get(className);
      if (!set) return null;
      return set.values().next().value || null;
    }
    return null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-i18n]') {
      return Array.from(this._dataI18nElements);
    }
    if (selector === '[data-i18n-attr-aria-label],[data-i18n-attr-title],[data-i18n-attr-placeholder]') {
      return Array.from(this._dataI18nAttrElements);
    }
    return [];
  }

  createElement(tagName) {
    const element = new FakeElement({ tagName });
    return this.registerElement(element);
  }
}

class FakeStorage {
  constructor() {
    this._store = new Map();
  }

  getItem(key) {
    const value = this._store.get(String(key));
    return value === undefined ? null : value;
  }

  setItem(key, value) {
    this._store.set(String(key), String(value));
  }

  removeItem(key) {
    this._store.delete(String(key));
  }

  clear() {
    this._store.clear();
  }

  key(index) {
    return Array.from(this._store.keys())[index] ?? null;
  }

  get length() {
    return this._store.size;
  }
}

function createElement(document, options = {}) {
  const { id = null, tagName = 'div', classNames = [], textContent = '', innerHTML = '', attributes = {} } = options;
  const element = new FakeElement({ id, tagName, classNames, textContent, innerHTML });
  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, value);
  });
  document.registerElement(element);
  return element;
}

export function setupTestEnvironment() {
  const document = new FakeDocument();

  const deckGrid = createElement(document, { id: 'deck-grid', classNames: ['deck-grid'] });
  const deckEmpty = createElement(document, { id: 'deck-empty', classNames: ['empty-state', 'hidden'] });
  createElement(document, { id: 'deck-list-view', classNames: ['panel', 'active'] });
  createElement(document, { id: 'deck-session-view', classNames: ['panel'] });

  const languageToggle = createElement(document, {
    id: 'language-toggle',
    classNames: ['ghost'],
    textContent: '🇪🇸',
    attributes: { 'aria-label': 'Cambiar idioma', title: 'Cambiar idioma' }
  });

  const themeToggle = createElement(document, {
    id: 'theme-toggle',
    classNames: ['ghost'],
    textContent: 'Modo oscuro',
    attributes: { 'aria-label': 'Cambiar tema', title: 'Cambiar tema' }
  });

  const openDeckForm = createElement(document, {
    id: 'open-deck-form',
    classNames: ['primary'],
    textContent: 'Agregar mazo',
    attributes: { 'data-i18n': 'actions.addDeck' }
  });

  const deckFormOverlay = createElement(document, { id: 'deck-form-overlay', classNames: ['overlay', 'hidden'] });
  const deckForm = createElement(document, { id: 'deck-form', classNames: ['form'] });
  deckForm.reset = function reset() {
    this._wasReset = true;
  };
  const deckFormFeedback = createElement(document, { id: 'deck-form-feedback', classNames: ['form-feedback'] });

  const closeDeckForm = createElement(document, {
    id: 'close-deck-form',
    classNames: ['ghost'],
    textContent: '✕',
    attributes: {
      'data-i18n-attr-aria-label': 'deckForm.close',
      'aria-label': 'Cerrar'
    }
  });

  const cancelDeckForm = createElement(document, {
    id: 'cancel-deck-form',
    classNames: ['ghost'],
    textContent: 'Cancelar',
    attributes: { 'data-i18n': 'deckForm.cancel' }
  });

  const deckFormSubmit = createElement(document, {
    id: 'deck-form-submit',
    classNames: ['primary'],
    textContent: 'Guardar mazo',
    attributes: { 'data-i18n': 'deckForm.submit' }
  });

  const nameInput = createElement(document, {
    id: 'deck-form-name',
    tagName: 'input',
    attributes: {
      name: 'name',
      placeholder: 'Ej. Vocabulario básico',
      'data-i18n-attr-placeholder': 'deckForm.namePlaceholder'
    }
  });

  const exitSession = createElement(document, {
    id: 'exit-session',
    classNames: ['ghost'],
    textContent: '← Volver',
    attributes: { 'data-i18n': 'session.exit' }
  });

  const sessionTitle = createElement(document, { id: 'session-title', tagName: 'h2', textContent: 'Mazo' });
  const sessionSubtitle = createElement(document, { id: 'session-subtitle', tagName: 'p', textContent: '' });
  const sessionBody = createElement(document, { id: 'session-body', classNames: ['session-body'] });
  const sessionMessage = createElement(document, { id: 'session-message', classNames: ['session-message', 'hidden'] });
  const sessionActions = createElement(document, { classNames: ['session-actions'] });
  const cardView = createElement(document, { id: 'card-view', classNames: ['card'] });
  const cardContent = createElement(document, { id: 'card-content', classNames: ['card-content'] });
  const cardStep = createElement(document, { id: 'card-step' });
  const cardScore = createElement(document, { id: 'card-score' });

  const markIncorrect = createElement(document, {
    id: 'mark-incorrect',
    classNames: ['danger'],
    textContent: '✕ No entendí',
    attributes: { 'data-i18n': 'session.markIncorrect' }
  });

  const markCorrect = createElement(document, {
    id: 'mark-correct',
    classNames: ['success'],
    textContent: '✓ Comprendido',
    attributes: { 'data-i18n': 'session.markCorrect' }
  });

  const appTitle = createElement(document, {
    id: 'app-title',
    tagName: 'h1',
    textContent: 'Entrenador de Mazos',
    attributes: { 'data-i18n': 'app.title' }
  });

  const appTagline = createElement(document, {
    id: 'app-tagline',
    tagName: 'p',
    textContent: 'Organiza tus tarjetas y repásalas con un flujo inteligente',
    attributes: { 'data-i18n': 'app.tagline' }
  });

  const deckListTitle = createElement(document, {
    id: 'deck-list-title',
    tagName: 'h2',
    textContent: 'Tus mazos',
    attributes: { 'data-i18n': 'deck.listTitle' }
  });

  const deckUploadHint = createElement(document, {
    id: 'deck-upload-hint',
    tagName: 'p',
    textContent:
      'Sube un archivo JSON o Excel (.xlsx) donde cada fila represente una tarjeta con pares clave/valor.',
    attributes: { 'data-i18n': 'deck.uploadHint' }
  });

  const deckEmptyTitle = createElement(document, {
    id: 'deck-empty-title',
    tagName: 'h3',
    textContent: 'No hay mazos todavía',
    attributes: { 'data-i18n': 'deck.emptyTitle' }
  });

  const deckEmptyDescription = createElement(document, {
    id: 'deck-empty-description',
    tagName: 'p',
    textContent: 'Comienza creando uno nuevo con el botón “Agregar mazo”.',
    attributes: { 'data-i18n': 'deck.emptyDescription' }
  });

  const deckFormTitle = createElement(document, {
    id: 'deck-form-title',
    tagName: 'h2',
    textContent: 'Nuevo mazo',
    attributes: { 'data-i18n': 'deckForm.title' }
  });

  const deckFormNameLabel = createElement(document, {
    id: 'deck-form-name-label',
    tagName: 'span',
    textContent: 'Nombre del mazo',
    attributes: { 'data-i18n': 'deckForm.nameLabel' }
  });

  const deckFormFileLabel = createElement(document, {
    id: 'deck-form-file-label',
    tagName: 'span',
    textContent: 'Archivo de tarjetas (JSON o Excel)',
    attributes: { 'data-i18n': 'deckForm.fileLabel' }
  });

  const deckFormFileHelp = createElement(document, {
    id: 'deck-form-file-help',
    tagName: 'small',
    textContent:
      'Sube un archivo JSON con un arreglo de objetos o un Excel (.xlsx) con encabezados en la primera fila.',
    attributes: { 'data-i18n': 'deckForm.fileHelp' }
  });

  const window = {
    document,
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {}
    }),
    requestAnimationFrame: (callback) => callback(),
    alert: () => {},
    __LERNDEUTSH_TEST__: true
  };

  document.defaultView = window;

  const localStorage = new FakeStorage();

  return {
    document,
    window,
    localStorage,
    elements: {
      deckGrid,
      deckEmpty,
      languageToggle,
      themeToggle,
      openDeckForm,
      deckFormOverlay,
      deckForm,
      deckFormFeedback,
      closeDeckForm,
      cancelDeckForm,
      deckFormSubmit,
      nameInput,
      exitSession,
      sessionTitle,
      sessionSubtitle,
      sessionBody,
      sessionMessage,
      sessionActions,
      cardView,
      cardContent,
      cardStep,
      cardScore,
      markIncorrect,
      markCorrect
    }
  };
}

export { FakeStorage };
