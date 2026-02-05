class ImageViewer {
    constructor() {
        this.viewer = document.getElementById('viewer');
        this.wrapper = document.getElementById('imageWrapper');
        this.image = document.getElementById('mainImage');

        this.scale = 1;
        this.defaultScale = 0.7; // 기본 배율 (이 숫자만 수정하면 됨)
        this.maxScale = 1.5;     // 150%까지만 확대
        this.posX = 0;
        this.posY = 0;

        this.isDragging = false;
        this.hasMoved = false;  // 드래그로 이동했는지 체크
        this.startX = 0;
        this.startY = 0;

        // 오디오 관련
        this.currentAudio = null;
        this.currentMarker = null;
        this.currentTrackIndex = 0; // 현재 재생 중인 트랙 (0: 트랙1, 1: 트랙2)

        // UI 요소
        this.controlsRight = null;
        this.track1Row = null;
        this.track2Row = null;

        this.init();
    }

    init() {
        // 이미지 로드 완료 후 초기화
        if (this.image.complete) {
            this.setupInitialPosition();
        } else {
            this.image.onload = () => this.setupInitialPosition();
        }

        this.bindEvents();
    }

    setupInitialPosition() {
        // 건물 이미지 크기를 배경 대비 비율로 설정
        this.resizePlaceMarkers();

        // 기본 배율로 시작
        this.scale = this.defaultScale;

        // 초기 위치 설정
        this.constrainPosition();
        this.updateTransform();
    }

    // 모바일 여부 체크
    isMobile() {
        return window.innerWidth <= 768;
    }

    // 최소 스케일 = 기본 배율
    get minScale() {
        return this.defaultScale;
    }

    // 건물 이미지 크기를 배경 이미지 대비 비율로 설정
    resizePlaceMarkers() {
        const bgWidth = this.image.naturalWidth;
        const bgHeight = this.image.naturalHeight;
        const markers = document.querySelectorAll('.place-marker img, .arrow-marker img');

        markers.forEach(img => {
            if (img.complete) {
                this.setMarkerSize(img, bgWidth, bgHeight);
            } else {
                img.onload = () => this.setMarkerSize(img, bgWidth, bgHeight);
            }
        });
    }

    // 개별 마커 크기 설정
    setMarkerSize(img, bgWidth, bgHeight) {
        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;

        if (this.isMobile()) {
            // 모바일: 높이 기준 (100vh)
            const heightInVh = (imgHeight / bgHeight) * 100 * 1.5;
            img.style.width = 'auto';
            img.style.height = heightInVh + 'vh';
        } else {
            // 데스크탑: 너비 기준 (100vw)
            const widthInVw = (imgWidth / bgWidth) * 100 * 1.5;
            img.style.width = widthInVw + 'vw';
            img.style.height = 'auto';
        }
    }

    // 이미지가 화면 바깥으로 나가지 않도록 위치 제한
    constrainPosition() {
        const viewerRect = this.viewer.getBoundingClientRect();
        const viewerWidth = viewerRect.width;
        const viewerHeight = viewerRect.height;

        const aspectRatio = this.image.naturalHeight / this.image.naturalWidth;
        let imageDisplayWidth, imageDisplayHeight;

        if (this.isMobile()) {
            // 모바일: height 100vh 기준
            imageDisplayHeight = viewerHeight * this.scale;
            imageDisplayWidth = (viewerHeight / aspectRatio) * this.scale;
        } else {
            // 데스크탑: width 100vw 기준
            imageDisplayWidth = viewerWidth * this.scale;
            imageDisplayHeight = viewerWidth * aspectRatio * this.scale;
        }

        // X축 경계 제한
        const minX = viewerWidth - imageDisplayWidth;
        const maxX = 0;

        if (imageDisplayWidth <= viewerWidth) {
            this.posX = (viewerWidth - imageDisplayWidth) / 2;
        } else {
            this.posX = Math.max(minX, Math.min(maxX, this.posX));
        }

        // Y축 경계 제한
        const minY = viewerHeight - imageDisplayHeight;
        const maxY = 0;

        if (imageDisplayHeight <= viewerHeight) {
            this.posY = (viewerHeight - imageDisplayHeight) / 2;
        } else {
            this.posY = Math.max(minY, Math.min(maxY, this.posY));
        }
    }

    bindEvents() {
        // 마우스 휠 줌
        this.viewer.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // 드래그 이동
        this.viewer.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', (e) => this.endDrag(e));

        // 터치 지원
        this.viewer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.viewer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.viewer.addEventListener('touchend', (e) => this.endDrag(e));

        // 장소 마커 클릭 (오디오 재생)
        this.bindMarkerEvents();

        // 버튼 컨트롤
        document.getElementById('zoomIn').addEventListener('click', () => this.zoom(0.1));
        document.getElementById('zoomOut').addEventListener('click', () => this.zoom(-0.1));

        // UI 요소 저장
        this.controlsRight = document.querySelector('.controls-right');
        this.track1Row = document.querySelector('.track-row.track-1');
        this.track2Row = document.querySelector('.track-row.track-2');

        // 트랙별 재생 버튼 이벤트
        const track1PlayBtn = this.track1Row.querySelector('.play-btn');
        const track2PlayBtn = this.track2Row.querySelector('.play-btn');

        track1PlayBtn.addEventListener('click', () => this.playTrack(0));
        track2PlayBtn.addEventListener('click', () => this.playTrack(1));

        // 키보드 단축키
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // 윈도우 리사이즈
        window.addEventListener('resize', () => {
            this.resizePlaceMarkers();
            this.constrainPosition();
            this.updateTransform();
        });
    }

    // 마커 클릭 이벤트 바인딩
    bindMarkerEvents() {
        const markers = document.querySelectorAll('.place-marker');

        markers.forEach(marker => {
            // 데스크탑 클릭
            marker.addEventListener('click', (e) => {
                if (this.hasMoved) return;
                e.stopPropagation();
                this.handleMarkerClick(marker);
            });

            // 모바일 터치
            marker.addEventListener('touchend', (e) => {
                if (this.hasMoved) return;
                e.preventDefault();
                e.stopPropagation();
                this.handleMarkerClick(marker);
            });
        });
    }

    // 마커 클릭 핸들러
    handleMarkerClick(marker) {
        const audioSrc = marker.dataset.audio;
        const audioSrc2 = marker.dataset.audio2;
        const name1 = marker.dataset.name;  // 첫 번째 트랙 이름 (옵션)
        const name2 = marker.dataset.name2;

        if (!audioSrc) return;

        // 건물 이름 가져오기 (data-name이 있으면 사용, 없으면 place-title)
        const titleEl = marker.querySelector('.place-title');
        const placeName = name1 || (titleEl ? titleEl.textContent : marker.querySelector('img').alt);

        // 기존 오디오 정지
        this.stopAudio();

        // 650거리처럼 두 개의 트랙이 있는 경우
        if (audioSrc2) {
            this.currentMarker = marker;
            this.tracks = [
                { name: placeName, src: audioSrc },
                { name: name2 || '트랙 2', src: audioSrc2 }
            ];

            // UI 업데이트
            this.showDualTracks(this.tracks[0].name, this.tracks[1].name);

            // 랜덤으로 하나 재생
            const randomIndex = Math.floor(Math.random() * 2);
            this.playTrack(randomIndex);
        } else {
            // 단일 트랙
            this.currentMarker = marker;
            this.tracks = [{ name: placeName, src: audioSrc }];

            this.showSingleTrack(placeName);
            this.playTrack(0);
        }
    }

    // 두 개 트랙 UI 표시
    showDualTracks(name1, name2) {
        this.controlsRight.classList.add('visible');
        this.track1Row.style.display = 'flex';
        this.track2Row.style.display = 'flex';

        this.track1Row.querySelector('.location-btn').textContent = name1;
        this.track2Row.querySelector('.location-btn').textContent = name2;
    }

    // 단일 트랙 UI 표시
    showSingleTrack(name) {
        this.controlsRight.classList.add('visible');
        this.track1Row.style.display = 'flex';
        this.track2Row.style.display = 'none';

        this.track1Row.querySelector('.location-btn').textContent = name;
    }

    // 특정 트랙 재생
    playTrack(index) {
        if (!this.tracks || !this.tracks[index]) return;

        const track = this.tracks[index];

        // 같은 트랙을 다시 클릭하면 토글
        if (this.currentAudio && this.currentTrackIndex === index) {
            if (this.currentAudio.paused) {
                this.currentAudio.play();
                this.currentMarker.classList.add('playing');
                this.updateTrackUI(index, true);
            } else {
                this.currentAudio.pause();
                this.currentMarker.classList.remove('playing');
                this.updateTrackUI(index, false);
            }
            return;
        }

        // 기존 오디오 정지
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.updateTrackUI(this.currentTrackIndex, false);
        }

        // 새 오디오 재생
        this.currentAudio = new Audio(track.src);
        this.currentTrackIndex = index;

        this.currentAudio.play();
        this.currentMarker.classList.add('playing');
        this.updateTrackUI(index, true);

        // 오디오 종료 시
        this.currentAudio.addEventListener('ended', () => {
            this.currentMarker.classList.remove('playing');
            this.updateTrackUI(index, false);
            this.currentAudio = null;
        });
    }

    // 트랙 UI 업데이트
    updateTrackUI(index, isPlaying) {
        const trackRow = index === 0 ? this.track1Row : this.track2Row;
        const playBtnImg = trackRow.querySelector('.play-btn img');

        // 모든 트랙 버튼 play로 초기화
        this.track1Row.querySelector('.play-btn img').src = 'resource/play.png';
        this.track2Row.querySelector('.play-btn img').src = 'resource/play.png';

        // 현재 트랙만 업데이트
        if (isPlaying) {
            playBtnImg.src = 'resource/pause.png';
            playBtnImg.alt = '일시정지';
        } else {
            playBtnImg.src = 'resource/play.png';
            playBtnImg.alt = '재생';
        }
    }

    // 오디오 정지
    stopAudio() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
        }
        if (this.currentMarker) {
            this.currentMarker.classList.remove('playing');
        }
        this.currentAudio = null;
        this.currentMarker = null;
        this.tracks = null;

        // UI 초기화
        if (this.track1Row) {
            this.track1Row.querySelector('.play-btn img').src = 'resource/play.png';
        }
        if (this.track2Row) {
            this.track2Row.querySelector('.play-btn img').src = 'resource/play.png';
        }
    }

    handleWheel(e) {
        e.preventDefault();

        const rect = this.viewer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 마우스 위치를 이미지 좌표로 변환
        const imageX = (mouseX - this.posX) / this.scale;
        const imageY = (mouseY - this.posY) / this.scale;

        // 줌 적용 (부드럽게 0.05 단위로)
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale + delta));

        if (newScale !== this.scale) {
            // 마우스 위치 기준으로 줌
            this.posX = mouseX - imageX * newScale;
            this.posY = mouseY - imageY * newScale;
            this.scale = newScale;

            this.constrainPosition();
            this.updateTransform();
        }
    }

    zoom(delta) {
        const rect = this.viewer.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const imageX = (centerX - this.posX) / this.scale;
        const imageY = (centerY - this.posY) / this.scale;

        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale + delta));

        if (newScale !== this.scale) {
            this.posX = centerX - imageX * newScale;
            this.posY = centerY - imageY * newScale;
            this.scale = newScale;

            this.constrainPosition();
            this.updateTransform();
        }
    }

    startDrag(e) {
        this.isDragging = true;
        this.hasMoved = false;
        this.wrapper.classList.add('dragging');
        this.startX = e.clientX - this.posX;
        this.startY = e.clientY - this.posY;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
    }

    drag(e) {
        if (!this.isDragging) return;

        // 5px 이상 이동했으면 드래그로 판정
        const dx = Math.abs(e.clientX - this.dragStartX);
        const dy = Math.abs(e.clientY - this.dragStartY);
        if (dx > 5 || dy > 5) {
            this.hasMoved = true;
        }

        this.posX = e.clientX - this.startX;
        this.posY = e.clientY - this.startY;

        this.constrainPosition();
        this.updateTransform();
    }

    endDrag(e) {
        this.isDragging = false;
        this.wrapper.classList.remove('dragging');

        // 약간의 딜레이 후 hasMoved 초기화 (클릭 이벤트가 먼저 처리되도록)
        setTimeout(() => {
            this.hasMoved = false;
        }, 10);
    }

    handleTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            this.isDragging = true;
            this.hasMoved = false;
            this.wrapper.classList.add('dragging');
            this.startX = touch.clientX - this.posX;
            this.startY = touch.clientY - this.posY;
            this.dragStartX = touch.clientX;
            this.dragStartY = touch.clientY;
        }
    }

    handleTouchMove(e) {
        if (!this.isDragging || e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];

        // 5px 이상 이동했으면 드래그로 판정
        const dx = Math.abs(touch.clientX - this.dragStartX);
        const dy = Math.abs(touch.clientY - this.dragStartY);
        if (dx > 5 || dy > 5) {
            this.hasMoved = true;
        }

        this.posX = touch.clientX - this.startX;
        this.posY = touch.clientY - this.startY;

        this.constrainPosition();
        this.updateTransform();
    }

    handleKeyboard(e) {
        switch (e.key) {
            case '+':
            case '=':
                e.preventDefault();
                this.zoom(0.1);
                break;
            case '-':
                e.preventDefault();
                this.zoom(-0.1);
                break;
            case '0':
                e.preventDefault();
                this.reset();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.posY += 50;
                this.constrainPosition();
                this.updateTransform();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.posY -= 50;
                this.constrainPosition();
                this.updateTransform();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.posX += 50;
                this.constrainPosition();
                this.updateTransform();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.posX -= 50;
                this.constrainPosition();
                this.updateTransform();
                break;
        }
    }

    reset() {
        this.scale = 1;
        this.posX = 0;
        this.posY = 0;
        this.constrainPosition();
        this.updateTransform();
    }

    fitToScreen() {
        // 화면 맞춤은 minScale(100%)로 리셋
        this.scale = this.minScale;
        this.posX = 0;
        this.posY = 0;
        this.constrainPosition();
        this.updateTransform();
    }

    updateTransform() {
        this.wrapper.style.transform = `translate(${this.posX}px, ${this.posY}px) scale(${this.scale})`;
    }
}

// 뷰어 초기화
document.addEventListener('DOMContentLoaded', () => {
    new ImageViewer();

    // 모달 기능
    const moreLink = document.querySelector('.more-link');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose = document.getElementById('modalClose');

    // 처음 접속 시 모달 열기
    modalOverlay.classList.add('active');

    // 더보기 클릭 시 모달 열기
    moreLink.addEventListener('click', (e) => {
        e.preventDefault();
        modalOverlay.classList.add('active');
    });

    // X 버튼 클릭 시 모달 닫기
    modalClose.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
    });

    // 오버레이 클릭 시 모달 닫기
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.classList.remove('active');
        }
    });

    // ESC 키 누르면 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
            modalOverlay.classList.remove('active');
        }
    });
});
