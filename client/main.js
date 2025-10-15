const state = {
    decks: [],
    session: null,
    language: 'es',
};

let interactionLocked = false;
const dragState = {
    active: false,
    startX: 0,
    pointerId: null,
    deltaX: 0,
};
const DRAG_THRESHOLD_RATIO = 0.28;
let lastRenderedCardId = null;

const elements = {
    deckGrid: document.getElementById('deck-grid'),
    deckEmpty: document.getElementById('deck-empty'),
    deckListView: document.getElementById('deck-list-view'),
    deckSessionView: document.getElementById('deck-session-view'),
    themeToggle: document.getElementById('theme-toggle'),
    languageToggle: document.getElementById('language-toggle'),
    deckFormOverlay: document.getElementById('deck-form-overlay'),
    deckForm: document.getElementById('deck-form'),
    deckFormFeedback: document.getElementById('deck-form-feedback'),
    openDeckForm: document.getElementById('open-deck-form'),
    closeDeckForm: document.getElementById('close-deck-form'),
    cancelDeckForm: document.getElementById('cancel-deck-form'),
    exitSession: document.getElementById('exit-session'),
    sessionTitle: document.getElementById('session-title'),
    sessionSubtitle: document.getElementById('session-subtitle'),
    sessionBody: document.getElementById('session-body'),
    sessionMessage: document.getElementById('session-message'),
    sessionActions: document.querySelector('.session-actions'),
    cardView: document.getElementById('card-view'),
    cardContent: document.getElementById('card-content'),
    cardStep: document.getElementById('card-step'),
    cardScore: document.getElementById('card-score'),
    markCorrect: document.getElementById('mark-correct'),
    markIncorrect: document.getElementById('mark-incorrect'),
};

if (elements.cardView) {
    elements.cardView.addEventListener('animationend', (event) => {
        if (event.animationName === 'card-flash') {
            elements.cardView.classList.remove('card-flash');
        }
    });
}

const translations = {
    es: {
        app: {
            title: 'Entrenador de Mazos',
            tagline: 'Organiza tus tarjetas y repásalas con un flujo inteligente',
        },
        actions: {
            addDeck: 'Agregar mazo',
        },
        deck: {
            listTitle: 'Tus mazos',
            uploadHint:
                'Sube un archivo JSON o Excel (.xlsx) donde cada fila represente una tarjeta con pares clave/valor.',
            emptyTitle: 'No hay mazos todavía',
            emptyDescription: 'Comienza creando uno nuevo con el botón “Agregar mazo”.',
            cardCount: ({ count }) => (count === 1 ? '1 tarjeta' : `${count} tarjetas`),
            pendingPoints: ({ count }) => (count === 1 ? '1 punto pendiente' : `${count} puntos pendientes`),
            progressSummary: ({ total, reviewed, success, toReview }) =>
                `De ${total} cartas has revisado ${reviewed}, con ${success} exitosas y ${toReview} por repasar`,
            loadError: ({ message }) => `Error al cargar mazos: ${message}`,
            actions: {
                view: '👁️ Ver',
                delete: 'Eliminar',
                confirmDelete: '¿Eliminar este mazo? Esta acción no se puede deshacer.',
            },
        },
        session: {
            exit: '← Volver',
            negativeReview: ({ count }) => `Revisión de negativos (${count})`,
            roundLabel: ({ round }) => `Recorrido ${round}`,
            completed: '¡Recorrido completado! No quedan tarjetas pendientes.',
            allPositive: '¡Bien hecho! Todas las tarjetas están en positivo.',
            step: ({ index, total }) => `Tarjeta ${index} de ${total}`,
            score: ({ score }) => `Aciertos: ${score}`,
            markIncorrect: '✕ No entendí',
            markCorrect: '✓ Comprendido',
        },
        deckForm: {
            title: 'Nuevo mazo',
            close: 'Cerrar',
            nameLabel: 'Nombre del mazo',
            namePlaceholder: 'Ej. Vocabulario básico',
            fileLabel: 'Archivo de tarjetas (JSON o Excel)',
            fileHelp:
                'Sube un archivo JSON con un arreglo de objetos o un Excel (.xlsx) con encabezados en la primera fila.',
            cancel: 'Cancelar',
            submit: 'Guardar mazo',
            uploading: 'Subiendo mazo...',
            success: 'Mazo creado con éxito',
        },
        theme: {
            toggle: {
                light: '☀️ Modo claro',
                dark: '🌙 Modo oscuro',
            },
            description: {
                light: 'Cambiar a modo claro',
                dark: 'Cambiar a modo oscuro',
            },
        },
        errors: {
            httpStatus: ({ status }) => `Error ${status}`,
        },
        language: {
            flag: {
                es: '🇪🇸',
                en: '🇺🇸',
            },
            name: {
                es: 'español',
                en: 'inglés',
            },
            switch: ({ language }) => `Cambiar idioma a ${language}`,
        },
    },
    en: {
        app: {
            title: 'Deck Trainer',
            tagline: 'Organize your cards and review them with a smart flow',
        },
        actions: {
            addDeck: 'Add deck',
        },
        deck: {
            listTitle: 'Your decks',
            uploadHint:
                'Upload a JSON or Excel (.xlsx) file where each row represents a card with key/value pairs.',
            emptyTitle: 'No decks yet',
            emptyDescription: 'Create a new one using the “Add deck” button.',
            cardCount: ({ count }) => (count === 1 ? '1 card' : `${count} cards`),
            pendingPoints: ({ count }) => (count === 1 ? '1 pending point' : `${count} pending points`),
            progressSummary: ({ total, reviewed, success, toReview }) =>
                `Out of ${total} cards you have reviewed ${reviewed}, with ${success} successes and ${toReview} to review`,
            loadError: ({ message }) => `Error loading decks: ${message}`,
            actions: {
                view: '👁️ View',
                delete: 'Delete',
                confirmDelete: 'Delete this deck? This action cannot be undone.',
            },
        },
        session: {
            exit: '← Back',
            negativeReview: ({ count }) => `Negative review (${count})`,
            roundLabel: ({ round }) => `Round ${round}`,
            completed: 'Run completed! No cards pending.',
            allPositive: 'Great job! All cards are positive.',
            step: ({ index, total }) => `Card ${index} of ${total}`,
            score: ({ score }) => `Correct answers: ${score}`,
            markIncorrect: '✕ Didn’t get it',
            markCorrect: '✓ Got it',
        },
        deckForm: {
            title: 'New deck',
            close: 'Close',
            nameLabel: 'Deck name',
            namePlaceholder: 'E.g. Basic vocabulary',
            fileLabel: 'Card file (JSON or Excel)',
            fileHelp: 'Upload a JSON array of objects or an Excel (.xlsx) with headers in the first row.',
            cancel: 'Cancel',
            submit: 'Save deck',
            uploading: 'Uploading deck...',
            success: 'Deck created successfully',
        },
        theme: {
            toggle: {
                light: '☀️ Light mode',
                dark: '🌙 Dark mode',
            },
            description: {
                light: 'Switch to light mode',
                dark: 'Switch to dark mode',
            },
        },
        errors: {
            httpStatus: ({ status }) => `Error ${status}`,
        },
        language: {
            flag: {
                es: '🇪🇸',
                en: '🇺🇸',
            },
            name: {
                es: 'Spanish',
                en: 'English',
            },
            switch: ({ language }) => `Switch language to ${language}`,
        },
    },
};

const LANGUAGE_STORAGE_KEY = 'language-preference';
const THEME_STORAGE_KEY = 'theme-preference';

function getStoredLanguage() {
    try {
        const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        return stored === 'es' || stored === 'en' ? stored : null;
    } catch (error) {
        return null;
    }
}

function storeLanguage(language) {
    try {
        const normalized = language === 'en' ? 'en' : 'es';
        localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    } catch (error) {
        // ignore storage errors
    }
}

function normaliseScore(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function getTranslationValue(language, pathParts) {
    const source = translations[language];
    if (!source) return undefined;
    return pathParts.reduce((current, part) => {
        if (current && typeof current === 'object' && part in current) {
            return current[part];
        }
        return undefined;
    }, source);
}

function formatString(template, params = {}) {
    return template.replace(/\{(.*?)\}/g, (match, key) => {
        const trimmed = key.trim();
        if (Object.prototype.hasOwnProperty.call(params, trimmed)) {
            return params[trimmed];
        }
        return match;
    });
}

function translate(key, params = {}) {
    const path = key.split('.');
    let value = getTranslationValue(state.language, path);
    if (value === undefined) {
        value = getTranslationValue('es', path);
    }
    if (value === undefined) {
        return key;
    }
    if (typeof value === 'function') {
        return value(params || {});
    }
    if (typeof value === 'string') {
        return formatString(value, params || {});
    }
    return value;
}

function applyI18nAttributes(element) {
    Object.entries(element.dataset).forEach(([name, key]) => {
        if (!name.startsWith('i18nAttr')) return;
        const attributeName = name.slice('i18nAttr'.length);
        if (!attributeName) return;
        const normalized = `${attributeName[0].toLowerCase()}${attributeName
            .slice(1)
            .replace(/([A-Z])/g, '-$1')
            .toLowerCase()}`;
        const translation = translate(key);
        if (translation !== undefined) {
            element.setAttribute(normalized, translation);
        }
    });
}

function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
        const key = element.dataset.i18n;
        if (!key) return;
        const translation = translate(key);
        if (translation === undefined) return;
        if (element.dataset.i18nType === 'html') {
            element.innerHTML = translation;
        } else {
            element.textContent = translation;
        }
        applyI18nAttributes(element);
    });

    document
        .querySelectorAll('[data-i18n-attr-aria-label],[data-i18n-attr-title],[data-i18n-attr-placeholder]')
        .forEach((element) => {
            applyI18nAttributes(element);
        });
}

function updateLanguageToggle() {
    if (!elements.languageToggle) return;
    const currentLanguage = state.language === 'en' ? 'en' : 'es';
    const nextLanguage = currentLanguage === 'es' ? 'en' : 'es';
    const flag = translate(`language.flag.${currentLanguage}`);
    const nextName = translate(`language.name.${nextLanguage}`);
    const description = translate('language.switch', { language: nextName });
    elements.languageToggle.textContent = flag;
    elements.languageToggle.setAttribute('aria-label', description);
    elements.languageToggle.setAttribute('title', description);
}

function applyLanguage(language) {
    const normalized = translations[language] ? language : 'es';
    state.language = normalized;
    storeLanguage(normalized);
    document.documentElement.lang = normalized;
    document.title = translate('app.title');
    applyStaticTranslations();
    updateLanguageToggle();
    const currentTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    updateThemeToggle(currentTheme);
    renderDeckList();
    if (state.session) {
        renderSession();
    } else {
        updateSessionSubtitle();
    }
}

function getStoredTheme() {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return stored === 'light' || stored === 'dark' ? stored : null;
    } catch (error) {
        return null;
    }
}

function storeTheme(theme) {
    try {
        const normalized = theme === 'light' ? 'light' : 'dark';
        localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch (error) {
        // ignore storage errors
    }
}

function updateThemeToggle(theme) {
    if (!elements.themeToggle) return;
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const label = translate(`theme.toggle.${nextTheme}`);
    const description = translate(`theme.description.${nextTheme}`);
    elements.themeToggle.textContent = label;
    elements.themeToggle.setAttribute('aria-label', description);
    elements.themeToggle.setAttribute('title', description);
}

function applyTheme(theme) {
    const normalized = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = normalized;
    updateThemeToggle(normalized);
}

function initTheme() {
    const stored = getStoredTheme();
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
    const theme = stored || (systemPreference.matches ? 'dark' : 'light');
    applyTheme(theme);

    if (!stored) {
        const handleChange = (event) => {
            if (!getStoredTheme()) {
                applyTheme(event.matches ? 'dark' : 'light');
            }
        };
        if (typeof systemPreference.addEventListener === 'function') {
            systemPreference.addEventListener('change', handleChange);
        } else if (typeof systemPreference.addListener === 'function') {
            systemPreference.addListener(handleChange);
        }
    }
}

function toggleOverlay(open) {
    elements.deckFormOverlay.classList.toggle('hidden', !open);
    if (open) {
        elements.deckForm.reset();
        elements.deckFormFeedback.textContent = '';
    }
}

function switchView(view) {
    const showList = view === 'list';
    elements.deckListView.classList.toggle('active', showList);
    elements.deckSessionView.classList.toggle('active', !showList);
}

async function fetchJSON(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        let message = translate('errors.httpStatus', { status: response.status });
        try {
            const data = await response.json();
            if (data.error) message = data.error;
        } catch (_) {
            // ignore
        }
        throw new Error(message);
    }
    return response.json();
}

async function loadDecks() {
    const data = await fetchJSON('/api/decks');
    state.decks = data.decks;
    renderDeckList();
}

function renderDeckList() {
    if (state.decks.length === 0) {
        elements.deckEmpty.classList.remove('hidden');
        elements.deckGrid.innerHTML = '';
        return;
    }
    elements.deckEmpty.classList.add('hidden');
    elements.deckGrid.innerHTML = '';

    state.decks.forEach((deck) => {
        const totals = {
            total: typeof deck.cardCount === 'number' ? deck.cardCount : 0,
            reviewed: typeof deck.reviewedCount === 'number' ? deck.reviewedCount : 0,
            success: typeof deck.successCount === 'number' ? deck.successCount : 0,
            toReview: typeof deck.toReviewCount === 'number' ? deck.toReviewCount : 0,
        };
        const progressText = translate('deck.progressSummary', totals);
        const pendingPoints = typeof deck.pendingPoints === 'number' ? deck.pendingPoints : 0;
        const pendingText = translate('deck.pendingPoints', { count: pendingPoints });
        const viewLabel = translate('deck.actions.view');
        const deleteLabel = translate('deck.actions.delete');
        const card = document.createElement('article');
        card.className = 'deck-card';
        card.innerHTML = `
            <div>
                <h3>${deck.name}</h3>
                <div class="deck-stats">
                    <span>${progressText}</span>
                    <span>${pendingText}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="ghost" data-action="view" data-id="${deck.id}">${viewLabel}</button>
                <button class="danger" data-action="delete" data-id="${deck.id}">${deleteLabel}</button>
            </div>
        `;
        elements.deckGrid.appendChild(card);
    });
}

function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function buildRoundCards(cards, { prioritizeNegative = false } = {}) {
    const shuffled = shuffle(cards);
    if (!prioritizeNegative) return shuffled;
    const negativeIndex = shuffled.findIndex((card) => normaliseScore(card.aciertos) < 0);
    if (negativeIndex > 0) {
        const [negativeCard] = shuffled.splice(negativeIndex, 1);
        shuffled.unshift(negativeCard);
    }
    return shuffled;
}

function startSession(deck) {
    const cards = deck.cards.map((card) => ({ ...card, contenido: { ...card.contenido } }));
    const roundCards = buildRoundCards(cards, { prioritizeNegative: true });
    lastRenderedCardId = null;
    state.session = {
        deckId: deck.id,
        deckName: deck.name,
        cards,
        roundCards,
        index: 0,
        finished: roundCards.length === 0,
        round: 1,
    };
    switchView('session');
    renderSession();
}

function currentCard() {
    if (!state.session || state.session.finished) return null;
    return state.session.roundCards[state.session.index] || null;
}

function updateSessionSubtitle() {
    if (!state.session) return;
    const negatives = state.session.cards.filter((card) => normaliseScore(card.aciertos) < 0).length;
    const roundLabel =
        negatives > 0
            ? translate('session.negativeReview', { count: negatives })
            : translate('session.roundLabel', { round: state.session.round });
    elements.sessionSubtitle.textContent = roundLabel;
}

function renderCard(card) {
    const cardElement = elements.cardView;
    elements.cardContent.innerHTML = '';
    Object.entries(card.contenido).forEach(([key, value]) => {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
        const field = document.createElement('div');
        field.className = 'card-field';
        field.innerHTML = `
            <span class="label">${key}</span>
            <span class="value">${displayValue}</span>
        `;
        elements.cardContent.appendChild(field);
    });
    elements.cardScore.textContent = translate('session.score', { score: card.aciertos });
    if (cardElement && lastRenderedCardId !== card.id) {
        cardElement.classList.remove('card-flash');
        // Force reflow so the animation restarts when the class is added again
        void cardElement.offsetWidth; // eslint-disable-line no-void
        cardElement.classList.add('card-flash');
        lastRenderedCardId = card.id;
    }
}

function renderSession() {
    const session = state.session;
    if (!session) return;

    elements.sessionTitle.textContent = session.deckName;
    updateSessionSubtitle();
    resetCardPosition(true);

    const card = currentCard();
    if (!card) {
        session.finished = true;
        lastRenderedCardId = null;
        elements.cardView.classList.add('hidden');
        elements.sessionActions.classList.add('hidden');
        elements.sessionMessage.classList.remove('hidden');
        elements.sessionMessage.textContent = translate('session.completed');
        return;
    }

    elements.sessionMessage.classList.add('hidden');
    elements.cardView.classList.remove('hidden');
    elements.sessionActions.classList.remove('hidden');
    elements.markCorrect.disabled = false;
    elements.markIncorrect.disabled = false;
    elements.cardStep.textContent = translate('session.step', {
        index: session.index + 1,
        total: session.roundCards.length,
    });
    renderCard(card);
}

async function handleDeckAction(event) {
    const target = event.target.closest('button[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;
    if (action === 'view') {
        const deck = await fetchJSON(`/api/decks/${id}`);
        startSession(deck);
    } else if (action === 'delete') {
        if (!confirm(translate('deck.actions.confirmDelete'))) return;
        await fetchJSON(`/api/decks/${id}`, { method: 'DELETE' });
        await loadDecks();
    }
}

function advanceSession() {
    const session = state.session;
    if (!session) return;
    session.index += 1;
    if (session.index >= session.roundCards.length) {
        const negatives = session.cards.filter((card) => normaliseScore(card.aciertos) < 0);
        if (negatives.length === 0) {
            session.finished = true;
            elements.sessionMessage.classList.remove('hidden');
            elements.sessionMessage.textContent = translate('session.allPositive');
            elements.cardView.classList.add('hidden');
            elements.sessionActions.classList.add('hidden');
            return;
        }
        session.round += 1;
        session.roundCards = buildRoundCards(negatives, { prioritizeNegative: true });
        session.index = 0;
    }
    renderSession();
}

async function registerAnswer(delta) {
    const session = state.session;
    const card = currentCard();
    if (!session || !card) return;
    elements.markCorrect.disabled = true;
    elements.markIncorrect.disabled = true;
    interactionLocked = true;
    try {
        const data = await fetchJSON(`/api/decks/${session.deckId}/cards/${card.id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ delta }),
        });
        const updated = data.card;
        const replace = (collection) => {
            const idx = collection.findIndex((c) => c.id === updated.id);
            if (idx >= 0) collection[idx] = { ...collection[idx], ...updated };
        };
        replace(session.cards);
        replace(session.roundCards);
        if (data.deck) {
            const deckIndex = state.decks.findIndex((d) => d.id === data.deck.id);
            if (deckIndex >= 0) {
                state.decks[deckIndex] = { ...state.decks[deckIndex], ...data.deck };
            }
            renderDeckList();
        }
        advanceSession();
        interactionLocked = false;
    } catch (error) {
        alert(error.message);
        elements.markCorrect.disabled = false;
        elements.markIncorrect.disabled = false;
        interactionLocked = false;
        resetCardPosition(true);
    }
}

function exitSession() {
    resetCardPosition(true);
    interactionLocked = false;
    dragState.active = false;
    dragState.pointerId = null;
    lastRenderedCardId = null;
    state.session = null;
    switchView('list');
    loadDecks();
}

function resetCardPosition(immediate = false) {
    const cardElement = elements.cardView;
    if (!cardElement) return;
    const applyReset = () => {
        cardElement.style.transform = '';
    };

    if (immediate) {
        cardElement.style.transition = 'none';
        applyReset();
        requestAnimationFrame(() => {
            cardElement.style.transition = '';
        });
    } else {
        cardElement.style.transition = 'transform 0.2s ease';
        applyReset();
        setTimeout(() => {
            cardElement.style.transition = '';
        }, 200);
    }

    cardElement.classList.remove('dragging', 'drag-left', 'drag-right');
    dragState.deltaX = 0;
}

function triggerSwipe(direction) {
    if (interactionLocked) return;
    const cardElement = elements.cardView;
    if (!cardElement || cardElement.classList.contains('hidden')) return;
    if (!state.session || state.session.finished || !currentCard()) return;

    interactionLocked = true;
    const offset = cardElement.offsetWidth || 0;
    const translateX = direction === 'right' ? offset : -offset;
    const rotation = direction === 'right' ? 14 : -14;
    cardElement.style.transition = 'transform 0.2s ease';
    cardElement.classList.add(direction === 'right' ? 'drag-right' : 'drag-left');
    cardElement.style.transform = `translateX(${translateX}px) rotate(${rotation}deg)`;

    const delta = direction === 'right' ? 1 : -1;
    dragState.deltaX = 0;
    setTimeout(() => {
        registerAnswer(delta);
    }, 120);
}

function handleDragStart(event) {
    if (interactionLocked || !currentCard()) return;
    const cardElement = elements.cardView;
    if (!cardElement) return;
    dragState.active = true;
    dragState.startX = event.clientX;
    dragState.pointerId = event.pointerId;
    dragState.deltaX = 0;
    cardElement.classList.add('dragging');
    cardElement.classList.remove('drag-left', 'drag-right');
    cardElement.style.transition = 'none';
    if (typeof cardElement.setPointerCapture === 'function') {
        try {
            cardElement.setPointerCapture(event.pointerId);
        } catch (error) {
            // ignore capture errors
        }
    }
    event.preventDefault();
}

function handleDragMove(event) {
    if (!dragState.active || event.pointerId !== dragState.pointerId) return;
    const cardElement = elements.cardView;
    if (!cardElement) return;
    dragState.deltaX = event.clientX - dragState.startX;
    const rotate = Math.max(-18, Math.min(18, dragState.deltaX / 12));
    cardElement.style.transform = `translateX(${dragState.deltaX}px) rotate(${rotate}deg)`;
    const threshold = (cardElement.offsetWidth || 0) * DRAG_THRESHOLD_RATIO;
    if (dragState.deltaX > threshold) {
        cardElement.classList.add('drag-right');
        cardElement.classList.remove('drag-left');
    } else if (dragState.deltaX < -threshold) {
        cardElement.classList.add('drag-left');
        cardElement.classList.remove('drag-right');
    } else {
        cardElement.classList.remove('drag-left', 'drag-right');
    }
}

function handleDragEnd(event) {
    if (!dragState.active || (event && event.pointerId !== dragState.pointerId)) return;
    const cardElement = elements.cardView;
    if (!cardElement) return;
    if (typeof cardElement.releasePointerCapture === 'function' && dragState.pointerId !== null) {
        try {
            cardElement.releasePointerCapture(dragState.pointerId);
        } catch (error) {
            // ignore release errors
        }
    }
    cardElement.classList.remove('dragging');
    const threshold = (cardElement.offsetWidth || 0) * DRAG_THRESHOLD_RATIO;
    const deltaX = dragState.deltaX;
    dragState.active = false;
    dragState.pointerId = null;

    if (interactionLocked) {
        resetCardPosition();
        return;
    }

    if (deltaX > threshold) {
        triggerSwipe('right');
        return;
    }
    if (deltaX < -threshold) {
        triggerSwipe('left');
        return;
    }
    resetCardPosition();
}

function setupCardDrag() {
    const cardElement = elements.cardView;
    if (!cardElement) return;
    cardElement.addEventListener('pointerdown', handleDragStart);
    cardElement.addEventListener('pointermove', handleDragMove);
    cardElement.addEventListener('pointerup', handleDragEnd);
    cardElement.addEventListener('pointercancel', handleDragEnd);
    cardElement.addEventListener('pointerleave', handleDragEnd);
    cardElement.addEventListener('dragstart', (event) => event.preventDefault());
}

function setupEventListeners() {
    setupCardDrag();
    elements.openDeckForm.addEventListener('click', () => toggleOverlay(true));
    elements.closeDeckForm.addEventListener('click', () => toggleOverlay(false));
    elements.cancelDeckForm.addEventListener('click', () => toggleOverlay(false));
    elements.deckGrid.addEventListener('click', handleDeckAction);
    elements.exitSession.addEventListener('click', exitSession);
    elements.markCorrect.addEventListener('click', () => {
        if (!interactionLocked) triggerSwipe('right');
    });
    elements.markIncorrect.addEventListener('click', () => {
        if (!interactionLocked) triggerSwipe('left');
    });

    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', () => {
            const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            storeTheme(next);
        });
    }

    if (elements.languageToggle) {
        elements.languageToggle.addEventListener('click', () => {
            const next = state.language === 'es' ? 'en' : 'es';
            applyLanguage(next);
        });
    }

    elements.deckForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(elements.deckForm);
        elements.deckFormFeedback.textContent = translate('deckForm.uploading');
        try {
            const data = await fetchJSON('/api/decks', {
                method: 'POST',
                body: formData,
            });
            state.decks.push(data.deck);
            renderDeckList();
            elements.deckFormFeedback.textContent = translate('deckForm.success');
            setTimeout(() => toggleOverlay(false), 800);
        } catch (error) {
            elements.deckFormFeedback.textContent = error.message;
        }
    });
}

function init() {
    const storedLanguage = getStoredLanguage();
    const initialLanguage = storedLanguage || document.documentElement.lang || 'es';
    applyLanguage(initialLanguage);
    initTheme();
    setupEventListeners();
    loadDecks().catch((error) => {
        const message = translate('deck.loadError', { message: error.message });
        elements.deckGrid.textContent = message;
        elements.deckEmpty.classList.add('hidden');
    });
}

init();
