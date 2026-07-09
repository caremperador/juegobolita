/* =========================================
   1. VARIABLES GLOBALES Y MIGRACIÓN
   ========================================= */
// Ahora las categorías guardan color Y emoji
let colorCategories = []; 
let sounds = [];

const audioPool = {}; 
let activeMusicId = null;

let currentSortMode = localStorage.getItem('gati_sort_v1115') || 'color';
let isCompactSize = localStorage.getItem('gati_size_v1115') === 'true';
let isEmojiMode = localStorage.getItem('gati_view_v1115') === 'emoji';

const DEFAULT_BACKUP_URL = "https://raw.githubusercontent.com/caremperador/audios/main/gatimusic_backup%202.json";

function sortSoundsArray() {
  if (currentSortMode === 'color') {
    sounds.sort((a, b) => {
      let indexA = colorCategories.findIndex(c => c.color === a.color);
      let indexB = colorCategories.findIndex(c => c.color === b.color);
      if(indexA === -1) indexA = 999;
      if(indexB === -1) indexB = 999;
      return indexA - indexB;
    });
  } else if (currentSortMode === 'top') {
    sounds.sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  }
}

function saveData() {
  localStorage.setItem('gati_colors_v1115', JSON.stringify(colorCategories));
  const soundsToSave = sounds.map(s => ({...s, localUrl: undefined}));
  localStorage.setItem('gati_sounds_v1115', JSON.stringify(soundsToSave));
}

// Asegura que las categorías viejas tengan formato nuevo {color, emoji}
function migrateCategories(cats) {
  return cats.map(c => {
    if (typeof c === 'string') return { color: c, emoji: '🎵' };
    return c;
  });
}

/* =========================================
   2. MOTOR DE PRECARGA EN RAM (BLOBS)
   ========================================= */
async function preloadAllAudios() {
  const loadingScreen = document.getElementById('loadingScreen');
  const progressBar = document.getElementById('progressBarFill');
  const progressText = document.getElementById('progressText');
  
  if (sounds.length === 0) { loadingScreen.classList.add('hidden'); return; }

  loadingScreen.classList.remove('hidden');
  let loaded = 0; const total = sounds.length;

  const fetchPromises = sounds.map(async (sound) => {
    try {
      if (!sound.localUrl) {
         const response = await fetch(sound.url, { cache: "force-cache" });
         const blob = await response.blob();
         sound.localUrl = URL.createObjectURL(blob);
      }
      if (!audioPool[sound.id]) {
        const audioEl = new Audio(sound.localUrl);
        audioEl.preload = "auto"; audioEl.load(); 
        audioPool[sound.id] = audioEl;
      }
    } catch (e) {
      sound.localUrl = sound.url; 
      if (!audioPool[sound.id]) audioPool[sound.id] = new Audio(sound.url);
    } finally {
      loaded++;
      const percentage = Math.round((loaded / total) * 100);
      progressBar.style.width = percentage + '%';
      progressText.innerText = percentage + '%';
    }
  });

  await Promise.all(fetchPromises);
  setTimeout(() => { loadingScreen.classList.add('hidden'); }, 500);
}

async function preloadSingleAudio(sound) {
  try {
    const response = await fetch(sound.url);
    const blob = await response.blob();
    sound.localUrl = URL.createObjectURL(blob);
    const audioEl = new Audio(sound.localUrl);
    audioEl.preload = "auto"; audioEl.load();
    audioPool[sound.id] = audioEl;
  } catch (e) {
    sound.localUrl = sound.url;
    audioPool[sound.id] = new Audio(sound.url);
  }
}

/* =========================================
   3. INICIO DE LA APLICACIÓN
   ========================================= */
async function initApp() {
  const savedColors = localStorage.getItem('gati_colors_v1115') || localStorage.getItem('gati_colors_v1114');
  const savedSounds = localStorage.getItem('gati_sounds_v1115') || localStorage.getItem('gati_sounds_v1114');

  if (savedColors && savedSounds) {
    colorCategories = migrateCategories(JSON.parse(savedColors));
    sounds = JSON.parse(savedSounds);
    sounds.forEach(s => { if(!s.type) s.type = 'music'; if(!s.clicks) s.clicks = 0; });
    sortSoundsArray();
    await preloadAllAudios(); 
    applyUIStates();
    renderDeck();
  } else {
    try {
      const response = await fetch(DEFAULT_BACKUP_URL);
      if (response.ok) {
        const data = await response.json();
        if (data.colors && data.sounds) {
          colorCategories = migrateCategories(data.colors);
          sounds = data.sounds;
          sounds.forEach(s => { if(!s.type) s.type = 'music'; if(!s.clicks) s.clicks = 0; });
          sortSoundsArray(); saveData(); 
        }
      }
    } catch (err) {
      colorCategories = [ {color:'#ffffff', emoji:'🤍'}, {color:'#ff3366', emoji:'🔥'} ];
      sounds = [];
    }
    await preloadAllAudios(); 
    applyUIStates();
    renderDeck();
  }
}

/* =========================================
   4. CONTROLES DE INTERFAZ (BOTONES TOP)
   ========================================= */
const sizeModeBtn = document.getElementById('sizeModeBtn');
const sortModeBtn = document.getElementById('sortModeBtn');
const viewModeBtn = document.getElementById('viewModeBtn');

function applyUIStates() {
  // Tamaño
  if (isCompactSize) { document.body.classList.add('compact-mode'); sizeModeBtn.textContent = 'Tamaño: S'; } 
  else { document.body.classList.remove('compact-mode'); sizeModeBtn.textContent = 'Tamaño: L'; }
  // Orden
  sortModeBtn.textContent = currentSortMode === 'top' ? 'Orden: Top' : 'Orden: Color';
  // Vista (Emoji/Texto)
  viewModeBtn.textContent = isEmojiMode ? 'Vista: Emoji' : 'Vista: Texto';
}

sizeModeBtn.addEventListener('click', () => { isCompactSize = !isCompactSize; localStorage.setItem('gati_size_v1115', isCompactSize); applyUIStates(); });
sortModeBtn.addEventListener('click', () => { currentSortMode = currentSortMode === 'color' ? 'top' : 'color'; localStorage.setItem('gati_sort_v1115', currentSortMode); applyUIStates(); sortSoundsArray(); renderDeck(); });
viewModeBtn.addEventListener('click', () => { isEmojiMode = !isEmojiMode; localStorage.setItem('gati_view_v1115', isEmojiMode ? 'emoji' : 'text'); applyUIStates(); renderDeck(); });

/* =========================================
   5. REPRODUCTOR GLOBAL Y EVENTOS
   ========================================= */
let isEditMode = false;
let editingId = null;
let selectedCategoryColor = '#ffffff';
let currentVolume = 1;

let isPlayerMinimized = localStorage.getItem('gati_player_min_v1115') === 'true';
const livePlayer = document.getElementById('livePlayer');
const minimizeBtn = document.getElementById('minimizeBtn');

function applyMinimizedState() { if (isPlayerMinimized) livePlayer.classList.add('minimized'); else livePlayer.classList.remove('minimized'); }
minimizeBtn.addEventListener('click', () => { isPlayerMinimized = !isPlayerMinimized; localStorage.setItem('gati_player_min_v1115', isPlayerMinimized); applyMinimizedState(); });
applyMinimizedState(); 

const sfxGrid = document.getElementById('sfxGrid');
const musicGrid = document.getElementById('musicGrid');
const volContainer = document.getElementById('volumeContainer');
const volFill = document.getElementById('volumeFill');
let isDraggingVol = false;

function applyVolume(newVol) {
  currentVolume = Math.max(0, Math.min(1, newVol));
  volFill.style.width = (currentVolume * 100) + '%';
  Object.values(audioPool).forEach(audio => { audio.volume = currentVolume; });
}

function updateVolumeFromEvent(e) {
  const rect = volContainer.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX; 
  applyVolume((clientX - rect.left) / rect.width);
}

volContainer.addEventListener('mousedown', (e) => { isDraggingVol = true; updateVolumeFromEvent(e); });
document.addEventListener('mousemove', (e) => { if (isDraggingVol) updateVolumeFromEvent(e); });
document.addEventListener('mouseup', () => { isDraggingVol = false; });
volContainer.addEventListener('touchstart', (e) => { isDraggingVol = true; updateVolumeFromEvent(e); }, {passive: false});
volContainer.addEventListener('touchmove', (e) => { if (isDraggingVol) { e.preventDefault(); updateVolumeFromEvent(e); } }, {passive: false});
volContainer.addEventListener('touchend', () => { isDraggingVol = false; });

document.addEventListener('wheel', (e) => {
  const isAnythingPlaying = Object.values(audioPool).some(audio => !audio.paused);
  if (!isAnythingPlaying) return; 
  e.preventDefault(); 
  applyVolume(currentVolume + (e.deltaY < 0 ? 0.05 : -0.05));
}, {passive: false});

function stopAllAudio() {
  Object.values(audioPool).forEach(audio => { audio.pause(); audio.currentTime = 0; });
  activeMusicId = null;
  document.querySelectorAll('.deck-btn').forEach(b => b.classList.remove('playing'));
  livePlayer.classList.remove('visible');
}

document.getElementById('stopBtn').addEventListener('click', stopAllAudio);
document.getElementById('miniStopBtn').addEventListener('click', stopAllAudio);
document.addEventListener('keydown', (e) => { if (e.target.tagName !== 'INPUT' && e.code === 'Space') { e.preventDefault(); stopAllAudio(); } });

/* =========================================
   6. RENDERIZADO (CON NÚMEROS Y EMOJIS)
   ========================================= */
function renderDeck() {
  sfxGrid.innerHTML = '';
  musicGrid.innerHTML = '';

  // Agrupar visualmente por color para obtener el NÚMERO
  // El número de la canción es su posición dentro de su propio color en todo el array.
  let colorCounters = {};

  sounds.forEach((sound) => {
    // Calculamos su número (1, 2, 3...) dentro de su color
    if(!colorCounters[sound.color]) colorCounters[sound.color] = 1;
    let myNumber = colorCounters[sound.color];
    colorCounters[sound.color]++;

    const btn = document.createElement('div');
    btn.className = 'deck-btn';
    btn.style.setProperty('--btn-color', sound.color);
    btn.style.setProperty('--btn-bg', sound.color + '33'); 
    btn.style.setProperty('--btn-glow', sound.color + '66');
    
    if (audioPool[sound.id] && !audioPool[sound.id].paused) btn.classList.add('playing');

    if (isEmojiMode) {
      const catObj = colorCategories.find(c => c.color === sound.color) || { emoji: '🎵' };
      btn.innerHTML = `
        <div class="emoji-wrapper">
          <span class="btn-emoji">${catObj.emoji}</span>
          <span class="btn-number">${myNumber}</span>
        </div>
        <span class="btn-label-micro">${sound.label}</span>
      `;
    } else {
      btn.innerHTML = `<span class="btn-label-normal">${sound.label}</span>`;
    }

    btn.addEventListener('click', () => handleButtonPress(sound, btn));
    
    if (sound.type === 'sfx') sfxGrid.appendChild(btn);
    else musicGrid.appendChild(btn);
  });

  if (isEditMode) {
    const addBtnSfx = document.createElement('div'); addBtnSfx.className = 'deck-btn add-btn'; addBtnSfx.innerHTML = '<span>+</span>';
    addBtnSfx.addEventListener('click', () => { document.getElementById('newType').value = 'sfx'; openEditModal(null); });
    sfxGrid.appendChild(addBtnSfx);

    const addBtnMusic = document.createElement('div'); addBtnMusic.className = 'deck-btn add-btn'; addBtnMusic.innerHTML = '<span>+</span>';
    addBtnMusic.addEventListener('click', () => { document.getElementById('newType').value = 'music'; openEditModal(null); });
    musicGrid.appendChild(addBtnMusic);
  }
}

function handleButtonPress(sound, btnElement) {
  if (isEditMode) { openEditModal(sound); return; }

  sound.clicks = (sound.clicks || 0) + 1;
  saveData(); 

  let player = audioPool[sound.id];
  if (!player) { player = new Audio(sound.localUrl || sound.url); audioPool[sound.id] = player; }

  if (sound.type === 'music') {
    if (activeMusicId && audioPool[activeMusicId] && activeMusicId !== sound.id) {
        audioPool[activeMusicId].pause(); audioPool[activeMusicId].currentTime = 0;
        document.querySelectorAll('#musicGrid .deck-btn').forEach(b => b.classList.remove('playing'));
    }
    player.volume = currentVolume; player.currentTime = 0; 
    player.play().then(() => {
      btnElement.classList.add('playing'); activeMusicId = sound.id;
      document.getElementById('nowPlayingText').textContent = sound.label;
      document.getElementById('nowPlayingText').style.color = sound.color; 
      document.getElementById('playerDot').style.background = sound.color;
      document.getElementById('playerDot').style.boxShadow = `0 0 10px ${sound.color}`;
      volFill.style.backgroundColor = sound.color;
      livePlayer.classList.add('visible');
    }).catch(err => console.log("Bloqueado"));
    player.onended = () => { btnElement.classList.remove('playing'); activeMusicId = null; };
  } 
  else if (sound.type === 'sfx') {
    player.volume = currentVolume; player.currentTime = 0; 
    player.play().then(() => {
      btnElement.classList.add('playing');
      if (!livePlayer.classList.contains('visible')) {
         document.getElementById('nowPlayingText').textContent = "Mixer Maestro Activo";
         document.getElementById('nowPlayingText').style.color = "#ffffff";
         document.getElementById('playerDot').style.background = "#ffffff";
         document.getElementById('playerDot').style.boxShadow = `0 0 10px #ffffff`;
         volFill.style.backgroundColor = "#ffffff";
         livePlayer.classList.add('visible');
      }
    }).catch(err => console.log("Bloqueado"));
    player.onended = () => { btnElement.classList.remove('playing'); };
  }
}

/* =========================================
   7. MODOS Y MODAL DE EDICIÓN
   ========================================= */
const toggleEditBtn = document.getElementById('toggleEditBtn');
toggleEditBtn.addEventListener('click', () => {
  isEditMode = !isEditMode;
  toggleEditBtn.classList.toggle('active');
  toggleEditBtn.textContent = `Edición: ${isEditMode ? 'ON' : 'OFF'}`;
  document.getElementById('openCategoryModalBtn').style.display = isEditMode ? 'block' : 'none';
  document.getElementById('openSortAudiosBtn').style.display = isEditMode ? 'block' : 'none';
  if(isEditMode) stopAllAudio();
  renderDeck();
});

const addModal = document.getElementById('addModal');
function renderPalette() {
  const palette = document.getElementById('colorPalette');
  palette.innerHTML = '';
  colorCategories.forEach(cat => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = cat.color;
    swatch.style.color = cat.color;
    if (cat.color === selectedCategoryColor) swatch.classList.add('selected');
    swatch.addEventListener('click', () => { selectedCategoryColor = cat.color; renderPalette(); });
    palette.appendChild(swatch);
  });
}

function openEditModal(sound) { 
  addModal.classList.remove('hidden'); 
  if (sound) {
    editingId = sound.id;
    document.getElementById('modalTitle').textContent = "Editar Sonido";
    document.getElementById('newType').value = sound.type || 'music';
    document.getElementById('newLabel').value = sound.label;
    document.getElementById('newUrl').value = sound.url;
    selectedCategoryColor = sound.color;
    if(!colorCategories.some(c => c.color === sound.color)) { colorCategories.push({color: sound.color, emoji:'🎵'}); saveData(); }
    document.getElementById('deleteBtn').style.display = "block";
  } else {
    editingId = null;
    document.getElementById('modalTitle').textContent = "Añadir Sonido";
    document.getElementById('newLabel').value = ''; document.getElementById('newUrl').value = '';
    selectedCategoryColor = colorCategories[0]?.color || '#ffffff';
    document.getElementById('deleteBtn').style.display = "none";
  }
  renderPalette();
}

document.getElementById('cancelBtn').addEventListener('click', () => addModal.classList.add('hidden'));

document.getElementById('saveBtn').addEventListener('click', async () => {
  const type = document.getElementById('newType').value;
  const label = document.getElementById('newLabel').value;
  const url = document.getElementById('newUrl').value;
  const color = selectedCategoryColor;
  
  if (label && url) {
    let savedSoundObj;
    if (editingId) {
      let index = sounds.findIndex(s => s.id === editingId);
      if (index !== -1) {
         let clk = sounds[index].clicks || 0;
         sounds[index] = { id: editingId, type, label, url, color, clicks: clk, localUrl: sounds[index].localUrl };
         savedSoundObj = sounds[index];
         if(sounds[index].url !== url) {
            if(audioPool[editingId]) delete audioPool[editingId];
            preloadSingleAudio(savedSoundObj);
         }
      }
    } else {
      savedSoundObj = { id: Date.now(), type, label, url, color, clicks: 0 };
      sounds.push(savedSoundObj);
      preloadSingleAudio(savedSoundObj); 
    }
    addModal.classList.add('hidden');
    sortSoundsArray(); saveData(); renderDeck();
  } else { alert("Llena el nombre y la URL."); }
});

document.getElementById('deleteBtn').addEventListener('click', () => {
  if (editingId && confirm("¿Borrar este sonido?")) {
    sounds = sounds.filter(s => s.id !== editingId);
    if(audioPool[editingId]) { audioPool[editingId].pause(); delete audioPool[editingId]; }
    addModal.classList.add('hidden'); saveData(); renderDeck();
  }
});

/* =========================================
   8. GESTOR DE CATEGORÍAS Y EMOJIS
   ========================================= */
const categoryModal = document.getElementById('categoryModal');
const sortableColorList = document.getElementById('sortableColorList');
let sortableCatInstance = null;

function renderCategoryList() {
  sortableColorList.innerHTML = '';
  colorCategories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'sortable-item';
    item.dataset.color = cat.color;
    item.innerHTML = `
      <div class="drag-handle" title="Arrastrar">☰</div>
      <input type="color" class="color-edit-input" value="${cat.color}" title="Color">
      <input type="text" class="emoji-edit-input" value="${cat.emoji}" maxlength="2" title="Emoji">
      <span style="font-family: monospace; color: white; flex-grow: 1; padding-left:10px;">${cat.color.toUpperCase()}</span>
      <button class="btn-delete-cat" title="Eliminar">✖</button>
    `;

    item.querySelector('.color-edit-input').addEventListener('change', (e) => { updateCategoryColor(cat.color, e.target.value, item.querySelector('.emoji-edit-input').value); });
    item.querySelector('.emoji-edit-input').addEventListener('change', (e) => { updateCategoryColor(cat.color, item.querySelector('.color-edit-input').value, e.target.value); });
    item.querySelector('.btn-delete-cat').addEventListener('click', () => { deleteCategoryColor(cat.color); });
    sortableColorList.appendChild(item);
  });

  if(sortableCatInstance) sortableCatInstance.destroy();
  sortableCatInstance = new Sortable(sortableColorList, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost' });
}

function updateCategoryColor(oldColor, newColor, newEmoji) {
  if (oldColor !== newColor && colorCategories.some(c => c.color === newColor)) { alert("Ese color ya existe."); renderCategoryList(); return; }
  const idx = colorCategories.findIndex(c => c.color === oldColor);
  if (idx !== -1) {
    colorCategories[idx] = { color: newColor, emoji: newEmoji || '🎵' };
    sounds.forEach(s => { if(s.color === oldColor) s.color = newColor; });
    saveData(); renderDeck(); renderCategoryList();
  }
}

function deleteCategoryColor(colorToDelete) {
  if (colorCategories.length <= 1) { alert("Debes tener al menos un color."); return; }
  if (confirm(`¿Borrar este color?`)) {
    colorCategories = colorCategories.filter(c => c.color !== colorToDelete);
    const fallbackColor = colorCategories[0].color; 
    sounds.forEach(s => { if(s.color === colorToDelete) s.color = fallbackColor; });
    saveData(); renderDeck(); renderCategoryList();
  }
}

document.getElementById('openCategoryModalBtn').addEventListener('click', () => { categoryModal.classList.remove('hidden'); renderCategoryList(); });
document.getElementById('addNewColorBtn').addEventListener('click', () => {
  const newCol = document.getElementById('customColorPicker').value;
  const newEmo = document.getElementById('customEmojiPicker').value || '🎵';
  if (!colorCategories.some(c => c.color === newCol)) { colorCategories.push({color: newCol, emoji: newEmo}); renderCategoryList(); saveData(); }
});
document.getElementById('cancelCatBtn').addEventListener('click', () => categoryModal.classList.add('hidden'));
document.getElementById('saveCatBtn').addEventListener('click', () => {
  const newCats = [];
  document.querySelectorAll('#sortableColorList .sortable-item').forEach(item => {
    newCats.push({
      color: item.querySelector('.color-edit-input').value,
      emoji: item.querySelector('.emoji-edit-input').value || '🎵'
    });
  });
  colorCategories = newCats;
  currentSortMode = 'color'; localStorage.setItem('gati_sort_v1115', 'color'); updateSortBtnUI();
  sortSoundsArray(); saveData(); categoryModal.classList.add('hidden'); renderDeck();
});

/* =========================================
   9. ORDENAR AUDIOS INTERNAMENTE (NÚMEROS)
   ========================================= */
const sortAudiosModal = document.getElementById('sortAudiosModal');
const sortAudioColorFilter = document.getElementById('sortAudioColorFilter');
const sortableAudiosList = document.getElementById('sortableAudiosList');
let sortableAudiosInstance = null;

document.getElementById('openSortAudiosBtn').addEventListener('click', () => {
  sortAudiosModal.classList.remove('hidden');
  sortAudioColorFilter.innerHTML = '';
  colorCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.color;
    opt.textContent = `${cat.emoji} ${cat.color.toUpperCase()}`;
    opt.style.background = cat.color;
    opt.style.color = "black";
    sortAudioColorFilter.appendChild(opt);
  });
  renderSortableAudiosList();
});

sortAudioColorFilter.addEventListener('change', renderSortableAudiosList);

function renderSortableAudiosList() {
  const filterColor = sortAudioColorFilter.value;
  sortableAudiosList.innerHTML = '';
  
  const filteredSounds = sounds.filter(s => s.color === filterColor);
  
  filteredSounds.forEach(sound => {
    const item = document.createElement('div');
    item.className = 'sortable-item sortable-audio-item';
    item.dataset.id = sound.id;
    item.innerHTML = `
      <div class="drag-handle" title="Arrastrar">☰</div>
      <span style="flex-grow: 1; padding-left:10px; font-weight:bold; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sound.label}</span>
      <span style="font-size:0.7rem; color: #8e8e9f;">${sound.type.toUpperCase()}</span>
    `;
    sortableAudiosList.appendChild(item);
  });

  if(sortableAudiosInstance) sortableAudiosInstance.destroy();
  sortableAudiosInstance = new Sortable(sortableAudiosList, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost' });
}

document.getElementById('cancelSortAudiosBtn').addEventListener('click', () => sortAudiosModal.classList.add('hidden'));

document.getElementById('saveSortAudiosBtn').addEventListener('click', () => {
  const filterColor = sortAudioColorFilter.value;
  const newOrderIds = Array.from(document.querySelectorAll('.sortable-audio-item')).map(el => Number(el.dataset.id));
  
  // Reordena 'sounds' manteniendo intactos los otros colores, pero ajustando los del color actual
  sounds.sort((a, b) => {
    if (a.color === filterColor && b.color === filterColor) {
      return newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id);
    }
    return 0; 
  });
  
  currentSortMode = 'color'; localStorage.setItem('gati_sort_v1115', 'color'); updateSortBtnUI();
  saveData();
  sortAudiosModal.classList.add('hidden');
  renderDeck();
});


/* =========================================
   10. IMPORTAR / EXPORTAR JSON Y URL
   ========================================= */
const backupModal = document.getElementById('backupModal');
document.getElementById('openBackupModalBtn').addEventListener('click', () => backupModal.classList.remove('hidden'));
document.getElementById('closeBackupBtn').addEventListener('click', () => backupModal.classList.add('hidden'));

document.getElementById('exportJsonBtn').addEventListener('click', () => {
  const soundsToSave = sounds.map(s => ({...s, localUrl: undefined}));
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ colors: colorCategories, sounds: soundsToSave }));
  const a = document.createElement('a'); a.href = dataStr; a.download = "gatimusic_backup_v1.1.15.json"; document.body.appendChild(a); a.click(); a.remove();
});

document.getElementById('importJsonTriggerBtn').addEventListener('click', () => document.getElementById('importJsonInput').click());
document.getElementById('importJsonInput').addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(event) {
    try {
      const data = JSON.parse(event.target.result);
      if (data.colors && data.sounds) {
        colorCategories = migrateCategories(data.colors); sounds = data.sounds;
        sounds.forEach(s => { if(!s.type) s.type = 'music'; if(!s.clicks) s.clicks = 0; s.localUrl = undefined; });
        sortSoundsArray(); saveData(); backupModal.classList.add('hidden');
        await preloadAllAudios(); renderDeck();
        alert("¡Importado con éxito!");
      } else { alert("Formato incorrecto."); }
    } catch (err) { alert("Error leyendo el archivo JSON."); }
  };
  reader.readAsText(file); e.target.value = ''; 
});

document.getElementById('importUrlBtn').addEventListener('click', async () => {
  let url = document.getElementById('jsonUrlInput').value.trim();
  if (!url) { alert("Ingresa un enlace válido."); return; }
  if (url.includes('github.com') && url.includes('/raw/')) {
    url = url.replace('github.com', 'raw.githubusercontent.com').replace('/raw/', '/').replace('/refs/heads/', '/');
  }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Error de red");
    const data = JSON.parse(await response.text());
    if (data.colors && data.sounds) {
      colorCategories = migrateCategories(data.colors); sounds = data.sounds;
      sounds.forEach(s => { if(!s.type) s.type = 'music'; if(!s.clicks) s.clicks = 0; s.localUrl = undefined; });
      sortSoundsArray(); saveData(); document.getElementById('jsonUrlInput').value = ''; backupModal.classList.add('hidden');
      await preloadAllAudios(); renderDeck();
      alert("¡Sincronizado desde URL con éxito!");
    } else { alert("Archivo no válido."); }
  } catch (err) { alert(`Error: ${err.message}`); }
});

initApp();