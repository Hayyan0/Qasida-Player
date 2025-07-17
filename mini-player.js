document.addEventListener('DOMContentLoaded', () => {
    const miniQasidaName = document.getElementById('mini-qasida-name');
    const miniProgressSlider = document.getElementById('mini-progress-slider');
    const miniCurrentTime = document.getElementById('mini-current-time');
    const miniTotalDuration = document.getElementById('mini-total-duration');
    const miniPlayPauseBtn = document.getElementById('mini-play-pause-btn');
    const miniPrevBtn = document.getElementById('mini-prev-btn');
    const miniNextBtn = document.getElementById('mini-next-btn');
    const miniShuffleBtn = document.getElementById('mini-shuffle-btn');
    const miniRepeatBtn = document.getElementById('mini-repeat-btn');
    const miniPlaylist = document.getElementById('mini-playlist');
    const miniCloseBtn = document.getElementById('mini-close-btn');
    const miniShowMainBtn = document.getElementById('mini-show-main-btn');

    let currentPlaylist = [];
    let currentIndex = -1;
    let isPlaying = false;
    let shuffleActive = false;
    let repeatActive = false;
    let currentTheme = 'light';
    let favoriteQasidas = [];

    function getQasidaKey(q) {
        if (!q) return null;
        return `${q.file_name}|${q.qasida_name}|${q.Reader}`;
    }
    
    function isQasidaFavorited(q) {
        if (!q) return false;
        const key = getQasidaKey(q);
        return favoriteQasidas.some(fav => getQasidaKey(fav) === key);
    }

    function setSliderBackground(slider) {
        const rootStyle = getComputedStyle(document.documentElement);
        const color = rootStyle.getPropertyValue('--primary-color').trim();
        const restColor = rootStyle.getPropertyValue('--primary-color-light').trim();
        const min = slider.min ? Number(slider.min) : 0;
        const max = slider.max ? Number(slider.max) : 100;
        const val = Number(slider.value);
        const percent = max > min ? ((val - min) / (max - min)) * 100 : 0;
        slider.style.background = `linear-gradient(to left, ${color} 0%, ${color} ${percent}%, ${restColor} ${percent}%, ${restColor} 100%)`;
    }

    function getIconPath(iconName, isActive = false) {
        const iconThemeFolder = currentTheme === 'dark' ? 'Dark' : 'White';
        const activePath = isActive ? 'active/' : '';
        const cleanIconName = iconName.replace('.svg', '');
        return `./Assets/Icons/${iconThemeFolder}/${activePath}${cleanIconName}.svg`;
    }

    function updateAllIcons() {
        miniShuffleBtn.querySelector('img').src = getIconPath('randomize', shuffleActive);
        miniPrevBtn.querySelector('img').src = getIconPath('previous');
        miniPlayPauseBtn.querySelector('img').src = isPlaying ? getIconPath('pause') : getIconPath('Start');
        miniNextBtn.querySelector('img').src = getIconPath('next');
        miniRepeatBtn.querySelector('img').src = getIconPath('repeate-one', repeatActive);
        renderMiniPlaylist();
    }

    function applyTheme(theme) {
        currentTheme = theme;
        document.body.classList.toggle('dark-theme', theme === 'dark');
        updateAllIcons();
    }

    function updateMiniPlayer(state) {
        if (state.currentQasida) {
            miniQasidaName.textContent = state.currentQasida.qasida_name;
        }
        
        if (state.currentTime !== undefined) {
            miniCurrentTime.textContent = formatTime(state.currentTime);
        }
        
        if (state.duration !== undefined) {
            miniTotalDuration.textContent = formatTime(state.duration);
            miniProgressSlider.max = state.duration;
        }
        
        if (state.progress !== undefined) {
            miniProgressSlider.value = state.progress;
            setSliderBackground(miniProgressSlider); 
        }
        
        if (state.isPlaying !== undefined) {
            isPlaying = state.isPlaying;
            miniPlayPauseBtn.querySelector('img').src = isPlaying ? getIconPath('pause') : getIconPath('Start');
        }
        
        if (state.shuffleActive !== undefined) {
            shuffleActive = state.shuffleActive;
            miniShuffleBtn.querySelector('img').src = getIconPath('randomize', shuffleActive);
        }
        
        if (state.repeatActive !== undefined) {
            repeatActive = state.repeatActive;
            miniRepeatBtn.querySelector('img').src = getIconPath('repeate-one', repeatActive);
        }
        
        if (state.favorites) {
            favoriteQasidas = state.favorites;
        }

        if (state.playlist) {
            currentPlaylist = state.playlist;
            currentIndex = state.currentIndex !== undefined ? state.currentIndex : currentIndex;
            renderMiniPlaylist();
        }

        if (state.theme !== undefined) {
            applyTheme(state.theme);
        }
    }

    function renderMiniPlaylist() {
        miniPlaylist.innerHTML = '';
        
        if (currentPlaylist.length === 0) {
            miniPlaylist.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 12px;">لا توجد قصائد</div>';
            return;
        }

        currentPlaylist.forEach((qasida, index) => {
            const item = document.createElement('div');
            item.className = 'mini-playlist-item';
            if (index === currentIndex) {
                item.classList.add('playing');
            }
            
            const isFav = isQasidaFavorited(qasida);

            item.innerHTML = `
                <span class="item-number">${index + 1}</span>
                <div class="item-details">
                    <div class="qasida-name">${qasida.qasida_name}</div>
                    <div class="poet-name">${qasida.poet_name}</div>
                </div>
                <button class="fav-btn">
                    <img src="${getIconPath('heart', isFav)}" alt="Favorite">
                </button>
            `;
            
            item.addEventListener('click', (e) => {
                if (e.target.closest('.fav-btn')) return;
                window.api.send('mini-player-action', { action: 'play', index: index });
            });
            
            const favBtn = item.querySelector('.fav-btn');
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.api.send('mini-player-action', { action: 'toggle-favorite', qasida: qasida });
            });

            miniPlaylist.appendChild(item);
        });
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    miniPlayPauseBtn.addEventListener('click', () => window.api.send('mini-player-action', { action: 'play-pause' }));
    miniPrevBtn.addEventListener('click', () => window.api.send('mini-player-action', { action: 'previous' }));
    miniNextBtn.addEventListener('click', () => window.api.send('mini-player-action', { action: 'next' }));
    miniShuffleBtn.addEventListener('click', () => window.api.send('mini-player-action', { action: 'shuffle' }));
    miniRepeatBtn.addEventListener('click', () => window.api.send('mini-player-action', { action: 'repeat' }));
    miniProgressSlider.addEventListener('input', (e) => {
        setSliderBackground(e.target);
        window.api.send('mini-player-action', { action: 'seek', time: e.target.value });
    });
    miniCloseBtn.addEventListener('click', () => window.api.send('mini-player-action', { action: 'hide-window' }));
    miniShowMainBtn.addEventListener('click', () => window.api.send('mini-player-action', { action: 'show-main' }));

    window.api.receive('update-from-main', (state) => {
        updateMiniPlayer(state);
    });

    updateMiniPlayer({
        currentQasida: { qasida_name: 'حدد قصيدة للتشغيل' },
        currentTime: 0,
        duration: 0,
        progress: 0,
        isPlaying: false,
        shuffleActive: false,
        repeatActive: false,
        playlist: [],
        currentIndex: -1,
        theme: 'light',
        favorites: []
    });
    setSliderBackground(miniProgressSlider); 
});
