const state = {
    decks: [],
    session: null,
};

let interactionLocked = false;
const dragState = {
    active: false,
    startX: 0,
    pointerId: null,
    deltaX: 0,
};
const DRAG_THRESHOLD_RATIO = 0.28;

const elements = {
    deckGrid: document.getElementById('deck-grid'),
    deckEmpty: document.getElementById('deck-empty'),
    deckListView: document.getElementById('deck-list-view'),
    deckSessionView: document.getElementById('deck-session-view'),
    themeToggle: document.getElementById('theme-toggle'),
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

const THEME_STORAGE_KEY = 'theme-preference';

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
    const labels = {
        light: '☀️ Modo claro',
        dark: '🌙 Modo oscuro',
    };
    const label = labels[nextTheme];
    const description = `Cambiar a modo ${nextTheme === 'dark' ? 'oscuro' : 'claro'}`;
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
        let message = `Error ${response.status}`;
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
        const cardCountText = deck.cardCount === 1 ? '1 tarjeta' : `${deck.cardCount} tarjetas`;
        const pendingPoints = typeof deck.pendingPoints === 'number' ? deck.pendingPoints : 0;
        const pendingText = pendingPoints === 1 ? '1 punto pendiente' : `${pendingPoints} puntos pendientes`;
        const card = document.createElement('article');
        card.className = 'deck-card';
        card.innerHTML = `
            <div>
                <h3>${deck.name}</h3>
                <div class="deck-stats">
                    <span>${cardCountText}</span>
                    <span>${pendingText}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="ghost" data-action="view" data-id="${deck.id}">👁️ Ver</button>
                <button class="danger" data-action="delete" data-id="${deck.id}">Eliminar</button>
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

function startSession(deck) {
    const cards = deck.cards.map((card) => ({ ...card, contenido: { ...card.contenido } }));
    const roundCards = shuffle(cards);
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
    const negatives = state.session.cards.filter((card) => card.aciertos < 0).length;
    const roundLabel = negatives > 0 ? `Revisión de negativos (${negatives})` : `Recorrido ${state.session.round}`;
    elements.sessionSubtitle.textContent = roundLabel;
}

function renderCard(card) {
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
    elements.cardScore.textContent = `Aciertos: ${card.aciertos}`;
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
        elements.cardView.classList.add('hidden');
        elements.sessionActions.classList.add('hidden');
        elements.sessionMessage.classList.remove('hidden');
        elements.sessionMessage.textContent = '¡Recorrido completado! No quedan tarjetas pendientes.';
        return;
    }

    elements.sessionMessage.classList.add('hidden');
    elements.cardView.classList.remove('hidden');
    elements.sessionActions.classList.remove('hidden');
    elements.markCorrect.disabled = false;
    elements.markIncorrect.disabled = false;
    elements.cardStep.textContent = `Tarjeta ${session.index + 1} de ${session.roundCards.length}`;
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
        if (!confirm('¿Eliminar este mazo? Esta acción no se puede deshacer.')) return;
        await fetchJSON(`/api/decks/${id}`, { method: 'DELETE' });
        await loadDecks();
    }
}

function advanceSession() {
    const session = state.session;
    if (!session) return;
    session.index += 1;
    if (session.index >= session.roundCards.length) {
        const negatives = session.cards.filter((card) => card.aciertos < 0);
        if (negatives.length === 0) {
            session.finished = true;
            elements.sessionMessage.classList.remove('hidden');
            elements.sessionMessage.textContent = '¡Bien hecho! Todas las tarjetas están en positivo.';
            elements.cardView.classList.add('hidden');
            elements.sessionActions.classList.add('hidden');
            return;
        }
        session.round += 1;
        session.roundCards = shuffle(negatives);
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

    elements.deckForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(elements.deckForm);
        elements.deckFormFeedback.textContent = 'Subiendo mazo...';
        try {
            const data = await fetchJSON('/api/decks', {
                method: 'POST',
                body: formData,
            });
            state.decks.push(data.deck);
            renderDeckList();
            elements.deckFormFeedback.textContent = 'Mazo creado con éxito';
            setTimeout(() => toggleOverlay(false), 800);
        } catch (error) {
            elements.deckFormFeedback.textContent = error.message;
        }
    });
}

function init() {
    initTheme();
    setupEventListeners();
    loadDecks().catch((error) => {
        elements.deckGrid.innerHTML = `<p>Error al cargar mazos: ${error.message}</p>`;
    });
}

init();
