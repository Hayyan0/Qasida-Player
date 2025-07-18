document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let allQasidas = [];
    let currentPlaylist = [];
    let currentlyPlayingQasida = null; 
    let activeTags = [];
    let currentIndex = -1;
    let groupBy = 'Reader';
    let currentPage = 'home'; 
    let favoriteQasidas = [];
    let allUniqueTags = [];
    let settings = { onClose: 'exit' };

    // --- DOM Elements ---
    const audioPlayer = document.getElementById('audio-player');
    const qasidaListContainer = document.querySelector('.qasida-list-container');
    const searchBox = document.getElementById('search-box');
    const tagFilterContainer = document.querySelector('.tag-filter-container');
    const tagSearchInput = document.getElementById('tag-search-input');
    const tagSearchDropdown = document.getElementById('tag-search-dropdown');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    const progressSlider = document.getElementById('progress-slider');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeIcon = document.querySelector('.volume-container img');
    const filterDropdownInput = document.getElementById('filter-dropdown-input');
    const filterDropdownList = document.getElementById('filter-dropdown-list');
    const filterDropdownWrapper = document.querySelector('.filter-dropdown-wrapper'); 
    const navItems = document.querySelectorAll('.nav-item');
    const playerFavBtn = document.getElementById('player-fav-btn');
    const settingsPage = document.querySelector('.settings-page');
    const themeDropdownWrapper = document.getElementById('theme-dropdown-wrapper');
    const closeBehaviorDropdownWrapper = document.getElementById('close-behavior-dropdown-wrapper');
    const closeBehaviorDropdownInput = document.getElementById('close-behavior-dropdown-input');
    
    // --- New UI Elements ---
    const statusOverlay = document.getElementById('status-overlay');
    const statusMessage = document.getElementById('status-message');
    const downloadPoetsBtn = document.getElementById('download-poets-btn');
    const downloadStatusContainer = document.getElementById('download-status-container');
    const updateNotification = document.getElementById('update-notification');
    const checkUpdateBtn = document.getElementById('check-update-btn');
    const updateStatusContainer = document.getElementById('update-status-container');

    // --- Utility Functions ---
    function getQasidaKey(q) {
        return `${q.file_name}|${q.qasida_name}|${q.Reader}`;
    }

    // --- Initialization ---
    async function initializeApp() {
        await loadAndApplyTheme(); 
        await loadSettings(); 
        setSliderBackground(progressSlider);
        setSliderBackground(volumeSlider);
    }

    async function initializeQasidas() {
        allQasidas = await window.api.getQasidas();
        if (!allQasidas || allQasidas.length === 0) {
            showStatusMessage(`مجلد الشعراء فارغ. حاول إعادة تنزيله من <a href="#" id="go-to-settings-link-2">صفحة الإعدادات</a>.`);
            document.getElementById('go-to-settings-link-2')?.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelector('.nav-item[data-page="settings"]').click();
            });
            return;
        }
        allUniqueTags = [...new Set(allQasidas.flatMap(q => q.tagsArray || []))].sort();
        await loadFavorites(); 
        renderPage();
        syncPlayerState(true);
    }


    function showStatusMessage(html) {
        qasidaListContainer.style.display = 'none';
        document.querySelector('.static-controls').style.display = 'none';
        statusOverlay.style.display = 'flex';
        statusMessage.innerHTML = html;
    }

    window.api.receive('poets-folder-missing', () => {
        showStatusMessage(`ليس هناك مجلد قصائد. <br> يمكنك تنزيله من <a href="#" id="go-to-settings-link">صفحة الإعدادات</a>.`);
        document.getElementById('go-to-settings-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelector('.nav-item[data-page="settings"]').click();
            statusOverlay.style.display = 'none';
        });
    });

    window.api.receive('poets-folder-found', () => {
        statusOverlay.style.display = 'none';
        document.querySelector('.static-controls').style.display = 'flex';
        qasidaListContainer.style.display = 'flex';
        initializeQasidas();
    });
    
    window.api.receive('show-download-ui', () => {
        document.querySelector('.nav-item[data-page="settings"]').click();
        downloadStatusContainer.textContent = "تحديث جديد متوفر! اضغط على الزر أعلاه للبدء.";
    });

    if (downloadPoetsBtn) {
        downloadPoetsBtn.addEventListener('click', async () => {
            downloadPoetsBtn.disabled = true;
            downloadStatusContainer.innerHTML = 'بدء التنزيل...';
            const result = await window.api.downloadPoets();
            if (result.success) {
                downloadStatusContainer.innerHTML = 'اكتمل التنزيل بنجاح! سيتم تحديث القائمة.';
                await initializeQasidas();
                document.querySelector('.nav-item[data-page="home"]').click();
            } else {
                downloadStatusContainer.innerHTML = `حدث خطأ: ${result.error}`;
            }
            downloadPoetsBtn.disabled = false;
        });
    }

    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', async () => {
            checkUpdateBtn.disabled = true;
            updateStatusContainer.innerHTML = 'جار التحقق من وجود تحديثات...';
            window.api.checkForUpdates();
            setTimeout(() => {
                checkUpdateBtn.disabled = false;
                updateStatusContainer.innerHTML = 'تم التحثث من التحديثات.';
            }, 5000);
        });
    }

    window.api.receive('download-progress', ({ percent }) => {
        downloadStatusContainer.innerHTML = `جاري التنزيل... ${percent.toFixed(1)}%`;
    });
    
    window.api.receive('unpacking-start', () => {
        downloadStatusContainer.innerHTML = 'اكتمل التنزيل. جاري فك الضغط...';
    });

    window.api.receive('update-available', (info) => {
        console.log('Received update-available event:', info);
        updateNotification.style.display = 'flex';
        document.querySelector('.app-container').classList.add('has-notification');
        updateNotification.innerHTML = `
            <span>يتوفر تحديث جديد (${info.version}).</span>
            <button id="download-update-btn">تنزيل التحديث</button>
            <button id="dismiss-update-btn" class="dismiss-btn">
                <img src="${getIconPath('close')}" alt="إغلاق" style="width: 14px; height: 14px;">
            </button>
        `;
        document.getElementById('download-update-btn').addEventListener('click', () => {
            console.log('Download update button clicked');
            updateNotification.innerHTML = `
                <span>جاري تنزيل التحديث...</span>
                <button id="dismiss-update-btn" class="dismiss-btn">
                    <img src="${getIconPath('close')}" alt="إغلاق" style="width: 14px; height: 14px;">
                </button>
            `;
            window.api.downloadUpdate();
        });
        document.getElementById('dismiss-update-btn').addEventListener('click', () => {
            console.log('Dismiss update button clicked');
            updateNotification.style.display = 'none';
            document.querySelector('.app-container').classList.remove('has-notification');
        });
    });

    window.api.receive('update-downloaded', () => {
        console.log('Received update-downloaded event');
        updateNotification.style.display = 'flex';
        document.querySelector('.app-container').classList.add('has-notification');
        updateNotification.innerHTML = `
            <span>تم تنزيل التحديث.</span>
            <button id="restart-app-btn">إعادة التشغيل للتثبيت</button>
            <button id="dismiss-update-btn" class="dismiss-btn">
                <img src="${getIconPath('close')}" alt="إغلاق" style="width: 14px; height: 14px;">
            </button>
        `;
        document.getElementById('restart-app-btn').addEventListener('click', () => {
            console.log('Restart app button clicked');
            window.api.restartApp();
        });
        document.getElementById('dismiss-update-btn').addEventListener('click', () => {
            console.log('Dismiss update button clicked');
            updateNotification.style.display = 'none';
            document.querySelector('.app-container').classList.remove('has-notification');
        });
    });
    
    window.api.receive('update-error', (errorMessage) => {
        console.log('Received update-error event:', errorMessage);
        updateNotification.style.display = 'flex';
        document.querySelector('.app-container').classList.add('has-notification');
        updateNotification.innerHTML = `
            <span>خطأ في التحديث: ${errorMessage}</span>
            <button id="dismiss-update-btn" class="dismiss-btn">
                <img src="${getIconPath('close')}" alt="إغلاق" style="width: 14px; height: 14px;">
            </button>
        `;
        document.getElementById('dismiss-update-btn').addEventListener('click', () => {
            console.log('Dismiss update button clicked');
            updateNotification.style.display = 'none';
            document.querySelector('.app-container').classList.remove('has-notification');
        });
    });

    window.api.receive('update-download-progress', (data) => {
        console.log('Received update-download-progress event:', data);
        if (updateNotification.style.display === 'flex') {
            updateNotification.innerHTML = `
                <span>جاري تنزيل التحديث... ${data.percent ? data.percent.toFixed(1) + '%' : ''}</span>
                <button id="dismiss-update-btn" class="dismiss-btn">
                    <img src="${getIconPath('close')}" alt="إغلاق" style="width: 14px; height: 14px;">
                </button>
            `;
            document.getElementById('dismiss-update-btn').addEventListener('click', () => {
                console.log('Dismiss update button clicked');
                updateNotification.style.display = 'none';
                document.querySelector('.app-container').classList.remove('has-notification');
            });
        }
    });


    function renderPage() {
        const staticControls = document.querySelector('.static-controls');
        const filterDropdown = document.querySelector('.filter-dropdown-wrapper');
        const mainContent = document.querySelector('.main-content');

        if (currentPage === 'home' || currentPage === 'favorites') {
            staticControls.style.display = 'flex';
            qasidaListContainer.style.display = 'flex';
            settingsPage.style.display = 'none';
            mainContent.style.overflow = 'hidden';
            if(allQasidas.length > 0) {
                statusOverlay.style.display = 'none';
            }

            if (currentPage === 'home') {
                filterDropdown.style.display = 'flex';
                renderUI();
            } else { 
                filterDropdown.style.display = 'none';
                renderFavoritesUI();
            }
        } else if (currentPage === 'settings') {
            staticControls.style.display = 'none';
            qasidaListContainer.style.display = 'none';
            statusOverlay.style.display = 'none';
            settingsPage.style.display = 'block';
            mainContent.style.overflow = 'auto';
        }
        syncPlayerState(true);
    }
    
    // --- Player Logic ---
    function loadTrack(index) {
        if (index < 0 || index >= currentPlaylist.length) return;
        const qasida = currentPlaylist[index];
        currentlyPlayingQasida = qasida;

        audioPlayer.src = `file:///${qasida.directory}/${qasida.file_name}`;
        
        document.getElementById('player-qasida-name').textContent = qasida.qasida_name;
        document.getElementById('player-poet-name').textContent = qasida.poet_name;

        document.querySelectorAll('.qasida-item.playing').forEach(el => el.classList.remove('playing'));
        const key = getQasidaKey(qasida);
        const targetItem = document.querySelector(`.qasida-item[data-qasida-key="${key}"]`);
        if (targetItem) targetItem.classList.add('playing');

        updatePlayerFavIcon();
        audioPlayer.load();
        audioPlayer.play().catch(e => console.error("Audio play failed:", e));
        syncPlayerState(true);
    }
    
    function createQasidaItem(qasida, versions, index, forceActiveHeart = false) {
        const itemEl = document.createElement('div');
        itemEl.className = 'qasida-item';
        itemEl.dataset.qasidaName = qasida.qasida_name;
        itemEl.dataset.qasidaKey = getQasidaKey(qasida); 
        const subName = groupBy === 'Reader' ? qasida.poet_name : qasida.Reader;
        let versionHTML = '';
        if (versions.length > 1) {
            versionHTML = '<div class="item-versions">';
            versions.forEach((v, i) => {
                versionHTML += `<div class="version-box ${i === 0 ? 'selected' : ''}" data-version-index="${i}">${v.version}</div>`;
            });
            versionHTML += '</div>';
        }

        const isFav = forceActiveHeart || isQasidaFavorited(qasida);

        itemEl.innerHTML = `
            <span class="item-number">${index + 1}</span>
            <button class="fav-btn"><img src="${getIconPath('heart', isFav)}"></button>
            <div class="item-details">
                <p class="qasida-name">${qasida.qasida_name}</p>
                <p class="sub-name">${subName}</p>
            </div>
            ${versionHTML}
            <span class="item-duration">--:--</span>
        `;
        itemEl.addEventListener('click', (e) => {
            if (e.target.closest('.version-box')) {
                const versionIndex = parseInt(e.target.dataset.versionIndex, 10);
                itemEl.querySelectorAll('.version-box').forEach(box => box.classList.remove('selected'));
                e.target.classList.add('selected');
                playTrackByData(versions[versionIndex]);
            } else if (!e.target.closest('.fav-btn')) {
                const selectedVersionBox = itemEl.querySelector('.version-box.selected');
                const versionIndex = selectedVersionBox ? parseInt(selectedVersionBox.dataset.versionIndex, 10) : 0;
                playTrackByData(versions[versionIndex]);
            }
        });

        const tempAudio = new Audio();
        tempAudio.src = `file:///${qasida.directory}/${qasida.file_name}`;
        tempAudio.addEventListener('loadedmetadata', () => {
            itemEl.querySelector('.item-duration').textContent = formatTime(tempAudio.duration);
        });

        const favBtn = itemEl.querySelector('.fav-btn');
        favBtn.onclick = (e) => {
            e.stopPropagation();
            const favImg = e.currentTarget.querySelector('img');
            if (favImg) {
                favImg.classList.add('icon-popping');
                favImg.addEventListener('animationend', () => favImg.classList.remove('icon-popping'), { once: true });
            }
            toggleFavorite(qasida);
        };
        return itemEl;
    }

    // --- Event Listeners ---
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.getAttribute('data-page');
            if (page !== currentPage) {
                navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                currentPage = page;
                renderPage();
            }
        });
    });

    document.querySelector('.window-close')?.addEventListener('click', () => window.api.send('window-action', 'close'));
    document.querySelector('.window-minimize')?.addEventListener('click', () => window.api.send('window-action', 'minimize'));
    document.querySelector('.window-maximize')?.addEventListener('click', () => window.api.send('window-action', 'maximize'));

    window.api.receive('control-from-mini', (data) => {
        switch (data.action) {
            case 'play-pause': togglePlayPause(); break;
            case 'previous': playPrev(); break;
            case 'next': playNext(); break;
            case 'shuffle': document.getElementById('shuffle-btn').click(); break;
            case 'repeat': document.getElementById('repeat-btn').click(); break;
            case 'seek': audioPlayer.currentTime = data.time; break;
            case 'toggle-favorite': if (data.qasida) toggleFavorite(data.qasida); break;
            case 'play':
                if (data.index !== undefined && data.index >= 0 && data.index < currentPlaylist.length) {
                    currentIndex = data.index;
                    loadTrack(currentIndex);
                }
                break;
        }
    });

    initializeApp();

    function renderUI() {
        renderActiveTags();
        const normalizedSearchTerm = normalizeArabic(searchBox.value.toLowerCase());
        const searchedQasidas = allQasidas.filter(q =>
            (normalizeArabic(q.qasida_name.toLowerCase()).includes(normalizedSearchTerm)) ||
            (normalizeArabic(q.poet_name.toLowerCase()).includes(normalizedSearchTerm)) ||
            (normalizeArabic(q.Reader.toLowerCase()).includes(normalizedSearchTerm))
        );

        const filteredQasidas = activeTags.length > 0
            ? searchedQasidas.filter(q =>
                activeTags.every(tag => q.tagsArray && q.tagsArray.includes(tag))
            )
            : searchedQasidas;

        const groupedData = filteredQasidas.reduce((acc, qasida) => {
            const key = qasida[groupBy];
            if (!acc[key]) acc[key] = [];
            acc[key].push(qasida);
            return acc;
        }, {});

        qasidaListContainer.innerHTML = '';
        if (Object.keys(groupedData).length === 0) {
            qasidaListContainer.innerHTML = `<p class="no-results">لا توجد نتائج تطابق بحثك.</p>`;
        } else {
            Object.keys(groupedData).sort().forEach(groupName => {
                const groupWrapper = document.createElement('div');
                groupWrapper.className = 'list-group';
                const header = document.createElement('div');
                header.className = 'list-group-header';
                header.innerHTML = `<img class="arrow" src="${getIconPath('Arrow')}" style="transition: transform 0.3s;" /> <span>${groupName}</span>`;
                const itemsWrapper = document.createElement('div');
                itemsWrapper.className = 'qasida-items-wrapper';
                const qasidasByName = groupQasidasByName(groupedData[groupName]);
                let itemIndex = 0;
                qasidasByName.forEach((versions, name) => {
                    const qasida = versions[0];
                    const item = createQasidaItem(qasida, versions, itemIndex++);
                    itemsWrapper.appendChild(item);
                });
                header.addEventListener('click', () => {
                    header.querySelector('.arrow').classList.toggle('open');
                    itemsWrapper.classList.toggle('open');
                    if (itemsWrapper.classList.contains('open')) {
                        itemsWrapper.style.maxHeight = itemsWrapper.scrollHeight + "px";
                    } else {
                        itemsWrapper.style.maxHeight = '0px';
                    }
                });
                groupWrapper.appendChild(header);
                groupWrapper.appendChild(itemsWrapper);
                qasidaListContainer.appendChild(groupWrapper);
            });
        }
        currentPlaylist = filteredQasidas;
    }

    function renderFavoritesUI() {
        renderActiveTags();
        const normalizedSearchTerm = normalizeArabic(searchBox.value.toLowerCase());
        const favoriteFullQasidas = favoriteQasidas.map(fav =>
            allQasidas.find(q => getQasidaKey(q) === getQasidaKey(fav))
        ).filter(Boolean); 

        const searchedQasidas = favoriteFullQasidas.filter(q =>
            (normalizeArabic(q.qasida_name.toLowerCase()).includes(normalizedSearchTerm)) ||
            (normalizeArabic(q.poet_name.toLowerCase()).includes(normalizedSearchTerm)) ||
            (normalizeArabic(q.Reader.toLowerCase()).includes(normalizedSearchTerm))
        );
        const filteredQasidas = activeTags.length > 0
            ? searchedQasidas.filter(q => activeTags.every(tag => q.tagsArray && q.tagsArray.includes(tag)))
            : searchedQasidas;

        qasidaListContainer.innerHTML = '';
        if (filteredQasidas.length === 0) {
            qasidaListContainer.innerHTML = `<p class="no-results">لا توجد قصائد في المفضلة تطابق بحثك.</p>`;
        } else {
            const groupWrapper = document.createElement('div');
            groupWrapper.className = 'list-group';
            const header = document.createElement('div');
            header.className = 'list-group-header';
            header.innerHTML = `<span>المفضلة</span>`;
            const itemsWrapper = document.createElement('div');
            itemsWrapper.className = 'qasida-items-wrapper open';
            itemsWrapper.style.maxHeight = 'none'; 
            const qasidasByName = groupQasidasByName(filteredQasidas);
            let itemIndex = 0;
            qasidasByName.forEach((versions, name) => {
                const qasida = versions[0];
                const item = createQasidaItem(qasida, versions, itemIndex++, true);
                itemsWrapper.appendChild(item);
            });
            groupWrapper.appendChild(header);
            groupWrapper.appendChild(itemsWrapper);
            qasidaListContainer.appendChild(groupWrapper);
        }
        currentPlaylist = filteredQasidas;
    }

    function playTrackByData(qasida) {
        currentIndex = currentPlaylist.findIndex(item => getQasidaKey(item) === getQasidaKey(qasida));
        if (currentIndex === -1) {
            currentIndex = allQasidas.findIndex(item => getQasidaKey(item) === getQasidaKey(qasida));
            currentPlaylist = [...allQasidas];
        }
        loadTrack(currentIndex);
    }
    
    function togglePlayPause() {
        if (!audioPlayer.src) {
            if (currentPlaylist.length > 0) playNext();
            return;
        }
        if (audioPlayer.paused) {
            audioPlayer.play();
        } else {
            audioPlayer.pause();
        }
    }

    function playNext() {
        if (currentPlaylist.length === 0) return;
        currentIndex = (currentIndex + 1) % currentPlaylist.length;
        loadTrack(currentIndex);
    }

    function playPrev() {
        if (currentPlaylist.length === 0) return;
        currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
        loadTrack(currentIndex);
    }
    
    function isQasidaFavorited(q) {
        return favoriteQasidas.some(fav => getQasidaKey(fav) === getQasidaKey(q));
    }

    function toggleFavorite(qasida) {
        const key = getQasidaKey(qasida);
        const idx = favoriteQasidas.findIndex(fav => getQasidaKey(fav) === key);
        if (idx === -1) {
            favoriteQasidas.push({ file_name: qasida.file_name, qasida_name: qasida.qasida_name, Reader: qasida.Reader });
        } else {
            favoriteQasidas.splice(idx, 1);
        }
        saveFavorites();
        updatePlayerFavIcon();
        const isNowFavorite = isQasidaFavorited(qasida);
        const newIconSrc = getIconPath('heart', isNowFavorite);
        document.querySelectorAll(`.qasida-item[data-qasida-key="${key}"]`).forEach(item => {
            const favImg = item.querySelector('.fav-btn img');
            if (favImg) favImg.src = newIconSrc;
        });
        if (currentPage === 'favorites') {
            renderFavoritesUI();
        }
        syncPlayerState(true);
    }
    async function saveFavorites() {
        if (window.api && window.api.saveFavorites) {
            await window.api.saveFavorites(favoriteQasidas);
        }
    }

    async function loadFavorites() {
        if (window.api && window.api.loadFavorites) {
            const favs = await window.api.loadFavorites();
            favoriteQasidas = favs || [];
        }
    }
    
    function updatePlayerFavIcon() {
        if (!playerFavBtn) return;
        const playerFavImg = playerFavBtn.querySelector('img');
        const isFav = currentlyPlayingQasida && isQasidaFavorited(currentlyPlayingQasida);
        playerFavImg.src = getIconPath('heart', isFav);
    }
    
    function getIconPath(iconName, isActive = false) {
        const theme = document.body.classList.contains('dark-theme') ? 'Dark' : 'White';
        const activePath = isActive ? 'active/' : '';
        const cleanIconName = iconName.replace('.svg', '');
        return `./Assets/Icons/${theme}/${activePath}${cleanIconName}.svg`;
    }

    function updateAllIcons() {
        const logoImg = document.querySelector('.side-nav .logo');
        if (logoImg) {
            const isDark = document.body.classList.contains('dark-theme');
            logoImg.src = isDark ? './Assets/Logo-Dark.png' : './Assets/Logo.png';
        }
        document.querySelector('.window-close img').src = getIconPath('Exit');
        document.querySelector('.window-maximize img').src = getIconPath('maximize');
        document.querySelector('.window-minimize img').src = getIconPath('minimize');
        document.querySelector('.nav-item[data-page="home"] img').src = getIconPath('Home');
        document.querySelector('.nav-item[data-page="favorites"] img').src = getIconPath('Favorites');
        document.querySelector('.nav-item[data-page="settings"] img').src = getIconPath('settings');
        document.querySelector('.search-container img').src = getIconPath('search');
        document.querySelectorAll('.filter-dropdown-arrow').forEach(arrow => arrow.src = getIconPath('Arrow'));
        const shuffleBtn = document.getElementById('shuffle-btn');
        shuffleBtn.querySelector('img').src = getIconPath('randomize', shuffleBtn.classList.contains('active'));
        document.getElementById('prev-btn').querySelector('img').src = getIconPath('previous');
        playPauseBtn.querySelector('img').src = audioPlayer.paused ? getIconPath('Start') : getIconPath('pause');
        document.getElementById('next-btn').querySelector('img').src = getIconPath('next');
        const repeatBtn = document.getElementById('repeat-btn');
        repeatBtn.querySelector('img').src = getIconPath('repeate-one', repeatBtn.classList.contains('active'));
        updatePlayerFavIcon();
        volumeIcon.src = audioPlayer.muted ? getIconPath('volume-slash') : getIconPath('volume');
        document.querySelectorAll('.list-group-header .arrow').forEach(arrow => arrow.src = getIconPath('Arrow'));
        document.querySelectorAll('.active-tag .close-icon').forEach(icon => icon.src = getIconPath('close'));
    }

    function applyTheme(theme) {
        document.body.classList.toggle('dark-theme', theme === 'dark');
        updateAllIcons();
    }

    function saveTheme(theme) {
        localStorage.setItem('theme', theme);
    }

    async function loadAndApplyTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        const themeInput = document.getElementById('theme-dropdown-input');
        if (themeInput) {
            themeInput.value = savedTheme === 'dark' ? 'داكن' : 'فاتح';
        }
        applyTheme(savedTheme);
    }
    
    async function loadSettings() {
        if (window.api && window.api.loadSettings) {
            settings = await window.api.loadSettings();
            updateSettingsUI();
        }
    }

    async function saveSettings() {
        if (window.api && window.api.saveSettings) {
            await window.api.saveSettings(settings);
        }
    }

    function updateSettingsUI() {
        if (closeBehaviorDropdownInput) {
            closeBehaviorDropdownInput.value = settings.onClose === 'tray' ? 'أخفه في شريط المهام' : 'أغلقه تمامًا';
        }
    }
    
    function syncPlayerState(includePlaylist = false) {
        const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        const state = {
            currentQasida: currentlyPlayingQasida, 
            currentTime: audioPlayer.currentTime,
            duration: audioPlayer.duration,
            progress: audioPlayer.currentTime,
            isPlaying: !audioPlayer.paused,
            shuffleActive: document.getElementById('shuffle-btn').classList.contains('active'),
            repeatActive: document.getElementById('repeat-btn').classList.contains('active'),
            currentIndex: currentIndex,
            theme: currentTheme,
            favorites: favoriteQasidas
        };
        if (includePlaylist) {
            state.playlist = currentPlaylist;
        }
        if (window.api && window.api.send) {
            window.api.send('player-state-update', state);
        }
    }
    
    function renderActiveTags() {
        tagFilterContainer.style.display = activeTags.length > 0 ? 'flex' : 'none';
        tagFilterContainer.innerHTML = '';
        activeTags.forEach(tag => {
            const tagEl = document.createElement('div');
            tagEl.className = 'tag active-tag';
            tagEl.innerHTML = `<span>${tag}</span><img src="${getIconPath('close')}" class="close-icon" alt="Remove Tag" data-tag="${tag}">`;
            tagFilterContainer.appendChild(tagEl);
        });
    }

    function updateTagDropdown() {
        const searchTerm = normalizeArabic(tagSearchInput.value.toLowerCase());
        const filteredTags = searchTerm === ''
            ? allUniqueTags.filter(tag => !activeTags.includes(tag)).slice(0, 10)
            : allUniqueTags.filter(tag => normalizeArabic(tag.toLowerCase()).includes(searchTerm) && !activeTags.includes(tag));

        if (filteredTags.length > 0) {
            tagSearchDropdown.classList.add('open');
            tagSearchDropdown.innerHTML = filteredTags.map(tag => `<div class="tag-search-option">${tag}</div>`).join('');
        } else {
            tagSearchDropdown.classList.remove('open');
        }
    }
    
    function formatTime(seconds) {
        if (isNaN(seconds)) return "0:00";
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function normalizeArabic(text) {
        if (!text || typeof text !== 'string') return '';
        return text.replace(/[\u064B-\u0652\u0640]/g, '');
    }

    function setSliderBackground(slider) {
        const color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color');
        const restColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color-light');
        const min = slider.min ? Number(slider.min) : 0;
        const max = slider.max ? Number(slider.max) : 100;
        const val = Number(slider.value);
        const percent = max > min ? ((val - min) / (max - min)) * 100 : 0;
        slider.style.background = `linear-gradient(to left, ${color} 0%, ${color} ${percent}%, ${restColor} ${percent}%, ${restColor} 100%)`;
    }
    
    function groupQasidasByName(qasidas) {
        return qasidas.reduce((acc, qasida) => {
            if (!acc.has(qasida.qasida_name)) { acc.set(qasida.qasida_name, []); }
            acc.get(qasida.qasida_name).push(qasida);
            return acc;
        }, new Map());
    }
    
    function setWindowRootBorderRadius(state) {
        const root = document.querySelector('.window-root');
        if (!root) return;
        if (state === 'maximized' || state === 'fullscreen') {
            root.style.borderRadius = '0px';
        } else {
            root.style.borderRadius = '25px'; 
        }
    }
    setWindowRootBorderRadius('restored');
    if (window.api && window.api.receive) {
        window.api.receive('window-state', (data) => {
            setWindowRootBorderRadius(data.state);
        });
    }
    
    const themeDropdownInput = document.getElementById('theme-dropdown-input');
    const themeDropdownList = document.getElementById('theme-dropdown-list');
    if (themeDropdownInput && themeDropdownList && themeDropdownWrapper) {
        themeDropdownInput.addEventListener('click', () => {
            themeDropdownWrapper.classList.toggle('open');
            themeDropdownList.classList.toggle('open');
        });
        themeDropdownList.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-dropdown-option')) {
                const selectedValue = e.target.getAttribute('data-value');
                themeDropdownInput.value = e.target.textContent;
                applyTheme(selectedValue);
                saveTheme(selectedValue);
                syncPlayerState(true);
                themeDropdownWrapper.classList.remove('open');
                themeDropdownList.classList.remove('open');
            }
        });
    }
    const closeBehaviorDropdownList = document.getElementById('close-behavior-dropdown-list');
    if (closeBehaviorDropdownInput && closeBehaviorDropdownList && closeBehaviorDropdownWrapper) {
        closeBehaviorDropdownInput.addEventListener('click', () => {
            closeBehaviorDropdownWrapper.classList.toggle('open');
            closeBehaviorDropdownList.classList.toggle('open');
        });
        closeBehaviorDropdownList.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-dropdown-option')) {
                const selectedValue = e.target.getAttribute('data-value');
                closeBehaviorDropdownInput.value = e.target.textContent;
                settings.onClose = selectedValue;
                saveSettings();
                closeBehaviorDropdownWrapper.classList.remove('open');
                closeBehaviorDropdownList.classList.remove('open');
            }
        });
    }
    searchBox.addEventListener('input', renderPage);
    tagFilterContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-icon')) {
            const tagToRemove = e.target.dataset.tag;
            activeTags = activeTags.filter(t => t !== tagToRemove);
            renderPage();
        }
    });
    tagSearchInput.addEventListener('input', updateTagDropdown);
    tagSearchInput.addEventListener('focus', updateTagDropdown);
    tagSearchDropdown.addEventListener('mousedown', (e) => e.preventDefault());
    tagSearchInput.addEventListener('blur', () => {
        setTimeout(() => { tagSearchDropdown.classList.remove('open'); }, 150);
    });
    tagSearchDropdown.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-search-option')) {
            const selectedTag = e.target.textContent;
            if (selectedTag && !activeTags.includes(selectedTag)) {
                activeTags.push(selectedTag);
                renderPage();
            }
            tagSearchInput.value = '';
            tagSearchDropdown.classList.remove('open');
        }
    });
    filterDropdownInput.addEventListener('click', () => {
        filterDropdownWrapper.classList.toggle('open');
        filterDropdownList.classList.toggle('open');
    });
    filterDropdownList.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-dropdown-option')) {
            filterDropdownInput.value = e.target.textContent;
            groupBy = e.target.getAttribute('data-value');
            filterDropdownWrapper.classList.remove('open');
            filterDropdownList.classList.remove('open');
            renderPage();
        }
    });
    document.addEventListener('click', (e) => {
        if (filterDropdownWrapper && !filterDropdownWrapper.contains(e.target)) {
            filterDropdownWrapper.classList.remove('open');
            filterDropdownList.classList.remove('open');
        }
        if (themeDropdownWrapper && !themeDropdownWrapper.contains(e.target)) {
            themeDropdownWrapper.classList.remove('open');
            themeDropdownList.classList.remove('open');
        }
        if (closeBehaviorDropdownWrapper && !closeBehaviorDropdownWrapper.contains(e.target)) {
            closeBehaviorDropdownWrapper.classList.remove('open');
            closeBehaviorDropdownList.classList.remove('open');
        }
    });
    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', playNext);
    prevBtn.addEventListener('click', playPrev);
    if (playerFavBtn) {
        playerFavBtn.onclick = function () {
            if (currentlyPlayingQasida) {
                const favImg = this.querySelector('img');
                if (favImg) {
                    favImg.classList.add('icon-popping');
                    favImg.addEventListener('animationend', () => favImg.classList.remove('icon-popping'), { once: true });
                }
                toggleFavorite(currentlyPlayingQasida);
            }
        };
    }
    document.getElementById('shuffle-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const isActive = btn.classList.toggle('active');
        btn.querySelector('img').src = getIconPath('randomize', isActive);
        if (isActive) {
            const repeatBtn = document.getElementById('repeat-btn');
            repeatBtn.classList.remove('active');
            repeatBtn.querySelector('img').src = getIconPath('repeate-one', false);
        }
        syncPlayerState();
    });
    document.getElementById('repeat-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const isActive = btn.classList.toggle('active');
        btn.querySelector('img').src = getIconPath('repeate-one', isActive);
        if (isActive) {
            const shuffleBtn = document.getElementById('shuffle-btn');
            shuffleBtn.classList.remove('active');
            shuffleBtn.querySelector('img').src = getIconPath('randomize', false);
        }
        syncPlayerState();
    });
    audioPlayer.addEventListener('play', () => { 
        playPauseBtn.querySelector('img').src = getIconPath('pause'); 
        syncPlayerState();
    });
    audioPlayer.addEventListener('pause', () => { 
        playPauseBtn.querySelector('img').src = getIconPath('Start'); 
        syncPlayerState();
    });
    audioPlayer.addEventListener('ended', () => {
        if (document.getElementById('repeat-btn').classList.contains('active')) {
            audioPlayer.play();
        } else if (document.getElementById('shuffle-btn').classList.contains('active')) {
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * currentPlaylist.length);
            } while (currentPlaylist.length > 1 && nextIndex === currentIndex);
            currentIndex = nextIndex;
            loadTrack(currentIndex);
        } else {
            playNext();
        }
    });
    audioPlayer.addEventListener('timeupdate', () => {
        if (!isNaN(audioPlayer.duration)) {
            progressSlider.max = audioPlayer.duration;
            progressSlider.value = audioPlayer.currentTime;
            setSliderBackground(progressSlider);
            document.getElementById('current-time').textContent = formatTime(audioPlayer.currentTime);
        }
        syncPlayerState();
    });
    audioPlayer.addEventListener('loadedmetadata', () => {
        if (!isNaN(audioPlayer.duration)) {
            progressSlider.max = audioPlayer.duration;
            document.getElementById('total-duration').textContent = formatTime(audioPlayer.duration);
        } else {
            document.getElementById('total-duration').textContent = '0:00';
        }
        progressSlider.value = 0;
        setSliderBackground(progressSlider);
        document.getElementById('current-time').textContent = '0:00';
        syncPlayerState();
    });
    progressSlider.addEventListener('input', (e) => {
        audioPlayer.currentTime = e.target.value;
        setSliderBackground(progressSlider);
    });
    volumeIcon.addEventListener('click', () => {
        audioPlayer.muted = !audioPlayer.muted;
        volumeIcon.src = audioPlayer.muted ? getIconPath('volume-slash') : getIconPath('volume');
        
        if (audioPlayer.muted) {
            if (!audioPlayer._previousVolume) {
                audioPlayer._previousVolume = audioPlayer.volume;
            }
            volumeSlider.value = 0;
        } else {
            if (audioPlayer._previousVolume) {
                audioPlayer.volume = audioPlayer._previousVolume;
                volumeSlider.value = audioPlayer._previousVolume;
                audioPlayer._previousVolume = null;
            } else {
                audioPlayer.volume = 0.5;
                volumeSlider.value = 0.5;
            }
        }
        setSliderBackground(volumeSlider);
    });
    volumeSlider.addEventListener('input', (e) => {
        const newVolume = Number(e.target.value);
        audioPlayer.volume = newVolume;
        setSliderBackground(volumeSlider);
        
        if (newVolume === 0) {
            audioPlayer.muted = true;
            volumeIcon.src = getIconPath('volume-slash');
        } else {
            audioPlayer.muted = false;
            volumeIcon.src = getIconPath('volume');
            audioPlayer._previousVolume = null;
        }
    });
});
