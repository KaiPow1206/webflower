const API_URL = "http://mykey.nguyennhoanhthai.workers.dev/";

const RENDER_BATCH_SIZE = 20;
const PAGE_SIZE = 48;
const SEARCH_DEBOUNCE_MS = 200;
const IMAGE_ROOT_MARGIN = "300px";
const CACHE_STORAGE_KEY = "flower_library_cache_v2";
const GUARD_BLOCKED_MESSAGE = "__curiosity_guard_blocked__";
const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  flowers: [],
  filteredFlowers: [],
  activeFilter: "all",
  playerFilter: "all",
  searchQuery: "",
  visibleCount: PAGE_SIZE,
};

let renderToken = 0;
let searchDebounceTimer = null;
let guardReleaseHooked = false;

const flowerGrid = document.getElementById("flowerGrid");
const statusArea = document.getElementById("statusArea");
const searchInput = document.getElementById("searchInput");
const memberMenuTrigger = document.getElementById("memberMenuTrigger");
const memberPanel = document.getElementById("memberPanel");
const memberPanelBackdrop = document.getElementById("memberPanelBackdrop");
const closeMemberPanel = document.getElementById("closeMemberPanel");
const memberMenuOptions = memberPanel.querySelector(".member-menu-options");
const resultsAnnouncement = document.getElementById("resultsAnnouncement");
const appHeader = document.querySelector(".app-header");
const appMain = document.querySelector(".app-main");
const filterButtons = document.querySelectorAll(".filter-btn");
const ownersModalEl = document.getElementById("ownersModal");
const ownersModal = new bootstrap.Modal(ownersModalEl);
const ownersModalLabel = document.getElementById("ownersModalLabel");
const modalFlowerInfo = document.getElementById("modalFlowerInfo");
const ownersList = document.getElementById("ownersList");
const celebrationOverlay = document.getElementById("celebrationOverlay");
const celebrationMessage = document.getElementById("celebrationMessage");
const fireworksCanvas = document.getElementById("fireworksCanvas");
const closeCelebration = document.getElementById("closeCelebration");
const celebrationConfig = window.CELEBRATION_CONFIG || {};

let fireworksFrame = null;
let fireworksCycleTimer = null;
let fireworksBurstTimers = [];
let fireworksRunId = 0;

const flowerByKey = new Map();

const imageObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      const src = img.dataset.src;
      if (src) {
        img.src = src;
        img.removeAttribute("data-src");
      }
      imageObserver.unobserve(img);
    });
  },
  { rootMargin: IMAGE_ROOT_MARGIN }
);

const loadMoreObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) loadMoreFlowers();
    });
  },
  { rootMargin: "400px" }
);

function normalizeQuality(quality) {
  return (quality || "").trim().toLowerCase();
}

function safeImageUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function resizeFireworksCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  fireworksCanvas.width = window.innerWidth * ratio;
  fireworksCanvas.height = window.innerHeight * ratio;
  fireworksCanvas.style.width = `${window.innerWidth}px`;
  fireworksCanvas.style.height = `${window.innerHeight}px`;
}

function launchFireworks() {
  if (reducedMotionPreference.matches) return;

  const runId = ++fireworksRunId;
  const context = fireworksCanvas.getContext("2d");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const particles = [];
  const colors = ["#ff4d6d", "#ffcf33", "#39d98a", "#38bdf8", "#f2b33d", "#fb7185"];

  resizeFireworksCanvas();
  context.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
  for (let burst = 0; burst < 8; burst += 1) {
    const fromLeft = burst % 2 === 0;
    const centerX = fromLeft
      ? window.innerWidth * (0.06 + Math.random() * 0.2)
      : window.innerWidth * (0.74 + Math.random() * 0.2);
    const centerY = window.innerHeight * (0.16 + Math.random() * 0.62);
    for (let index = 0; index < 42; index += 1) {
      const angle = (Math.PI * 2 * index) / 42;
      const speed = 1.9 + Math.random() * 2.8;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 2.5 + Math.random() * 2.5,
        color: colors[(burst + index) % colors.length],
        previousX: centerX,
        previousY: centerY,
      });
    }
  }

  cancelAnimationFrame(fireworksFrame);
  function animate() {
    if (runId !== fireworksRunId) return;
    context.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
    let activeParticles = 0;
    particles.forEach((particle) => {
      if (particle.life <= 0) return;
      activeParticles += 1;
      particle.previousX = particle.x;
      particle.previousY = particle.y;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.02;
      particle.life -= 0.008;
      context.globalAlpha = Math.max(particle.life, 0);
      context.fillStyle = particle.color;
      context.shadowBlur = 24 * ratio;
      context.shadowColor = particle.color;
      context.strokeStyle = particle.color;
      context.lineWidth = 1.8 * ratio;
      context.beginPath();
      context.moveTo(particle.previousX * ratio, particle.previousY * ratio);
      context.lineTo(particle.x * ratio, particle.y * ratio);
      context.stroke();
      context.beginPath();
      context.arc(particle.x * ratio, particle.y * ratio, particle.size * ratio, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
    context.shadowBlur = 0;
    if (activeParticles > 0) fireworksFrame = requestAnimationFrame(animate);
  }
  animate();
}

function scheduleFireworksCycle() {
  window.clearTimeout(fireworksCycleTimer);
  fireworksBurstTimers.forEach((timer) => window.clearTimeout(timer));
  fireworksBurstTimers = [];
  if (reducedMotionPreference.matches) return;

  for (let burst = 0; burst < 5; burst += 1) {
    const timer = window.setTimeout(() => {
      if (celebrationOverlay.classList.contains("is-visible")) launchFireworks();
    }, burst * 900);
    fireworksBurstTimers.push(timer);
  }
  fireworksCycleTimer = window.setTimeout(scheduleFireworksCycle, 300000);
}

function showCelebration() {
  celebrationOverlay.classList.remove("is-closing");
  celebrationMessage.textContent = celebrationConfig.message || "Bạn đã hoàn thành!";
  celebrationOverlay.classList.add("is-visible");
  celebrationOverlay.setAttribute("aria-hidden", "false");
  scheduleFireworksCycle();
  closeCelebration.focus();
}

function finishFireworks() {
  window.clearTimeout(fireworksCycleTimer);
  fireworksRunId += 1;
  fireworksBurstTimers.forEach((timer) => window.clearTimeout(timer));
  fireworksBurstTimers = [];
  cancelAnimationFrame(fireworksFrame);
  const context = fireworksCanvas.getContext("2d");
  context.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
  context.globalAlpha = 1;
  celebrationOverlay.classList.remove("is-visible");
  celebrationOverlay.classList.remove("is-closing");
  celebrationOverlay.setAttribute("aria-hidden", "true");
}

function closeCelebrationNotice() {
  finishFireworks();
}

function normalizePlayerName(name) {
  return (name || "").trim().toLowerCase();
}

function qualityClass(quality) {
  const normalized = normalizeQuality(quality);
  if (normalized === "đỏ") return "quality-do";
  if (normalized === "cam") return "quality-cam";
  if (normalized === "tím") return "quality-tim";
  if (normalized === "xanh") return "quality-xanh";
  return "quality-none";
}

function qualityBadgeClass(quality) {
  const normalized = normalizeQuality(quality);
  if (normalized === "đỏ") return "do";
  if (normalized === "cam") return "cam";
  if (normalized === "tím") return "tim";
  if (normalized === "xanh") return "xanh"
  return "none";
}

function qualityLabel(quality) {
  const normalized = normalizeQuality(quality);
  if (normalized === "đỏ") return "Đỏ";
  if (normalized === "cam") return "Cam";
  if (normalized === "tím") return "Tím";
  if (normalized === "xanh") return "Xanh";
  return "Chưa phân loại";
}

function isSpecialFlower(name) {
  const normalized = (name || "").toLowerCase();
  return normalized.includes(" nguyệt ") && name.includes("-");
}

function flowerKey(name) {
  return (name || "").trim().toLowerCase();
}

function normalizeFlowerEntry(flower) {
  const name = (flower.name || "").trim();
  if (!name) return null;

  return {
    name,
    quality: normalizeQuality(flower.quality),
    image: (flower.image || "").trim(),
    owners: Array.isArray(flower.owners) ? flower.owners : [],
  };
}

function buildFlowerCatalog(players) {
  const catalog = new Map();

  players.forEach((player) => {
    const playerName = player.name || "Không tên";

    (player.flowers || []).forEach((flower) => {
      const flowerName = (flower.name || "").trim();
      if (!flowerName) return;

      const key = flowerKey(flowerName);
      const existing = catalog.get(key);

      if (!existing) {
        catalog.set(key, {
          name: flowerName,
          quality: normalizeQuality(flower.quality),
          image: (flower.image || "").trim(),
          owners: [playerName],
        });
        return;
      }

      if (!existing.owners.includes(playerName)) {
        existing.owners.push(playerName);
      }

      if (!existing.image && flower.image) {
        existing.image = flower.image.trim();
      }

      if (!existing.quality && flower.quality) {
        existing.quality = normalizeQuality(flower.quality);
      }
    });
  });

  return Array.from(catalog.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "vi")
  );
}

function parseApiData(data) {
  if (!Array.isArray(data)) {
    throw new Error("Dữ liệu API không đúng định dạng.");
  }

  if (data.length === 0) return [];

  const first = data[0];
  const isFlatFlowerList =
    first &&
    typeof first === "object" &&
    "name" in first &&
    Array.isArray(first.owners) &&
    !("flowers" in first);

  if (isFlatFlowerList) {
    return data
      .map(normalizeFlowerEntry)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }

  return buildFlowerCatalog(data);
}

function rebuildFlowerIndex(flowers) {
  flowerByKey.clear();
  flowers.forEach((flower) => {
    flowerByKey.set(flowerKey(flower.name), flower);
  });
}

function getUniquePlayerNames(flowers) {
  const uniqueNames = new Set();

  flowers.forEach((flower) => {
    (flower.owners || []).forEach((owner) => {
      const normalized = normalizePlayerName(owner);
      if (normalized) uniqueNames.add(owner.trim());
    });
  });

  return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b, "vi"));
}

function populatePlayerFilterOptions(flowers) {
  const names = getUniquePlayerNames(flowers);
  const currentValue = state.playerFilter;

  if (names.length === 0 || !names.some((name) => normalizePlayerName(name) === normalizePlayerName(currentValue))) {
    state.playerFilter = "all";
  }

  const options = [{ value: "all", label: "Tất cả người chơi" }, ...names.map((name) => ({
    value: name,
    label: name,
  }))];

  memberMenuOptions.replaceChildren();
  options.forEach(({ value, label }) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "member-menu-option";
    option.dataset.player = value;
    const optionLabel = document.createElement("span");
    optionLabel.textContent = label;
    const checkIcon = document.createElement("i");
    checkIcon.className = "bi bi-check2 member-menu-check";
    checkIcon.setAttribute("aria-hidden", "true");
    option.append(optionLabel, checkIcon);
    memberMenuOptions.appendChild(option);
  });

  syncMemberMenuSelection();
}

function syncMemberMenuSelection() {
  memberMenuOptions.querySelectorAll(".member-menu-option").forEach((option) => {
    const isSelected =
      normalizePlayerName(option.dataset.player) === normalizePlayerName(state.playerFilter);
    option.setAttribute("aria-pressed", String(isSelected));
    option.classList.toggle("is-selected", isSelected);
  });
}

function setMemberMenuOpen(isOpen, restoreFocus = false) {
  memberMenuTrigger.setAttribute("aria-expanded", String(isOpen));
  memberPanel.setAttribute("aria-hidden", String(!isOpen));
  memberPanel.inert = !isOpen;
  appHeader.inert = isOpen;
  appMain.inert = isOpen;
  memberPanel.classList.toggle("is-open", isOpen);
  memberPanelBackdrop.classList.toggle("is-open", isOpen);
  memberPanelBackdrop.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("member-panel-open", isOpen);

  if (isOpen) closeMemberPanel.focus();
  else if (restoreFocus) memberMenuTrigger.focus();
}

function selectPlayer(value) {
  state.playerFilter = value;
  syncMemberMenuSelection();
  setMemberMenuOpen(false, true);
  updateQualityCounts();
  renderFlowers(true, true);
}

function updateQualityCounts() {
  const counts = {
    all: 0,
    "đỏ": 0,
    "cam": 0,
    "tím": 0,
    "xanh":0,
    special: 0,
  };

  state.flowers.forEach((flower) => {
    const belongsToPlayer =
      state.playerFilter === "all" ||
      (flower.owners || []).some(
        (owner) => normalizePlayerName(owner) === normalizePlayerName(state.playerFilter)
      );

    if (!belongsToPlayer) return;

    counts.all += 1;
    const quality = normalizeQuality(flower.quality);
    if (quality in counts) counts[quality] += 1;
    if (isSpecialFlower(flower.name)) counts.special += 1;
  });

  filterButtons.forEach((button) => {
    const countEl = button.querySelector(".filter-count");
    if (countEl) countEl.textContent = counts[button.dataset.filter] || 0;
  });

  const xanhButton = document.querySelector('.filter-btn[data-filter="xanh"]');
  if (xanhButton) {
    const hasXanh = counts.xanh > 0;
    xanhButton.hidden = !hasXanh;
    xanhButton.setAttribute("aria-hidden", String(!hasXanh));

    if (!hasXanh && state.activeFilter === "xanh") {
      state.activeFilter = "all";
      filterButtons.forEach((button) => {
        const isActive = button.dataset.filter === "all";
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
    }
  }
}

function updateFilteredFlowers() {
  const query = state.searchQuery.trim().toLowerCase();

  state.filteredFlowers = state.flowers.filter((flower) => {
    const matchesFilter =
      state.activeFilter === "all" ||
      (state.activeFilter === "special"
        ? isSpecialFlower(flower.name)
        : normalizeQuality(flower.quality) === state.activeFilter);

    const matchesPlayer =
      state.playerFilter === "all" ||
      (flower.owners || []).some(
        (owner) => normalizePlayerName(owner) === normalizePlayerName(state.playerFilter)
      );

    const matchesSearch = !query || flower.name.toLowerCase().includes(query);

    return matchesFilter && matchesPlayer && matchesSearch;
  });
}

function observeFlowerImage(imageEl) {
  if (!imageEl.dataset.src) return;
  imageObserver.observe(imageEl);
}

function createFlowerCard(flower) {
  const col = document.createElement("div");
  col.className = "col-6 flower-card-col";

  const imageUrl = safeImageUrl(flower.image);
  const hasImage = Boolean(imageUrl);
  const isSpecial = isSpecialFlower(flower.name);
  const isSpecialRed = isSpecial && qualityBadgeClass(flower.quality) === "do";
  const key = flowerKey(flower.name);
  const card = document.createElement("article");
  card.className = `flower-card h-100${isSpecial ? " flower-card-special" : ""}${isSpecialRed ? " flower-card-special-red" : ""}`;
  card.tabIndex = 0;
  card.dataset.flowerKey = key;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Xem người sở hữu hoa ${flower.name}`);

  card.innerHTML = `
    <div class="flower-image-wrap ${qualityClass(flower.quality)}">
      ${isSpecial && !isSpecialRed ? `<span class="flower-special-star" title="Hoa đặc biệt"><i class="bi bi-star-fill"></i></span>` : ""}
      <img
        class="flower-image ${hasImage ? "" : "is-empty"}"
        alt=""
        decoding="async"
      >
      <div class="flower-placeholder ${hasImage ? "hidden" : ""}">
        <i class="bi bi-flower2"></i>
        <small>Chưa có ảnh</small>
      </div>
    </div>
    <div class="flower-body">
      <h2 class="flower-name">${isSpecial && !isSpecialRed ? `<i class="bi bi-star-fill flower-name-star" aria-hidden="true"></i>` : ""}</h2>
      <div class="flower-meta">
        <div class="flower-badges">
          <span class="quality-badge ${qualityBadgeClass(flower.quality)}">
            ${qualityLabel(flower.quality)}
          </span>
          ${isSpecialRed ? `<span class="special-quality-badge"><i class="bi bi-star-fill" aria-hidden="true"></i>Đặc biệt</span>` : ""}
        </div>
        <span>${flower.owners.length} người</span>
      </div>
    </div>
  `;

  const imageEl = card.querySelector(".flower-image");
  const placeholderEl = card.querySelector(".flower-placeholder");
  const nameEl = card.querySelector(".flower-name");
  nameEl.append(document.createTextNode(flower.name));
  imageEl.alt = flower.name;

  if (hasImage) {
    imageEl.dataset.src = imageUrl;
    observeFlowerImage(imageEl);
    imageEl.addEventListener("error", () => {
      imageEl.classList.add("is-empty");
      placeholderEl.classList.remove("hidden");
    }, { once: true });
  }

  col.appendChild(card);
  return col;
}

function removeLoadMoreSentinel() {
  const sentinel = document.getElementById("loadMoreSentinel");
  if (sentinel) {
    loadMoreObserver.unobserve(sentinel);
    sentinel.remove();
  }
}

function updateLoadMoreSentinel(hasMore) {
  removeLoadMoreSentinel();
  if (!hasMore) return;

  const sentinel = document.createElement("div");
  sentinel.id = "loadMoreSentinel";
  sentinel.className = "col-12 load-more-sentinel";
  sentinel.setAttribute("aria-hidden", "true");
  flowerGrid.appendChild(sentinel);
  loadMoreObserver.observe(sentinel);
}

function renderEmptyState() {
  flowerGrid.classList.remove("d-none");
  flowerGrid.innerHTML = `
    <div class="col-12">
      <div class="empty-state">
        <i class="bi bi-search fs-2 d-block mb-2"></i>
        <p class="mb-0">${state.flowers.length ? "Không tìm thấy hoa phù hợp." : "Hiện chưa có dữ liệu hoa để hiển thị."}</p>
      </div>
    </div>
  `;
}

function renderFlowers(reset = true, announceResults = false) {
  const token = ++renderToken;

  updateFilteredFlowers();

  if (announceResults) {
    const resultCount = state.filteredFlowers.length;
    resultsAnnouncement.textContent = resultCount === 0
      ? "Không tìm thấy hoa phù hợp."
      : `Có ${new Intl.NumberFormat("vi-VN").format(resultCount)} loại hoa phù hợp.`;
  }

  if (reset) {
    state.visibleCount = PAGE_SIZE;
    removeLoadMoreSentinel();
    flowerGrid.innerHTML = "";
  }

  const filtered = state.filteredFlowers;

  if (filtered.length === 0) {
    renderEmptyState();
    return;
  }

  const alreadyRendered = flowerGrid.querySelectorAll(".flower-card-col").length;
  const targetCount = Math.min(state.visibleCount, filtered.length);
  const slice = filtered.slice(alreadyRendered, targetCount);

  if (slice.length === 0) {
    updateLoadMoreSentinel(targetCount < filtered.length);
    flowerGrid.classList.remove("d-none");
    return;
  }

  let index = 0;

  function renderBatch() {
    if (token !== renderToken) return;

    const fragment = document.createDocumentFragment();
    const end = Math.min(index + RENDER_BATCH_SIZE, slice.length);

    for (; index < end; index += 1) {
      fragment.appendChild(createFlowerCard(slice[index]));
    }

    flowerGrid.appendChild(fragment);

    if (index < slice.length) {
      requestAnimationFrame(renderBatch);
      return;
    }

    updateLoadMoreSentinel(targetCount < filtered.length);
    flowerGrid.classList.remove("d-none");
  }

  requestAnimationFrame(renderBatch);
}

function loadMoreFlowers() {
  if (state.visibleCount >= state.filteredFlowers.length) return;
  state.visibleCount = Math.min(
    state.visibleCount + PAGE_SIZE,
    state.filteredFlowers.length
  );
  renderFlowers(false);
}

function showOwnersModal(flower) {
  const isSpecial = isSpecialFlower(flower.name);
  const imageUrl = safeImageUrl(flower.image);
  ownersModalLabel.textContent = flower.name;
  if (isSpecial) {
    const star = document.createElement("i");
    star.className = "bi bi-star-fill flower-name-star me-1";
    star.setAttribute("aria-hidden", "true");
    ownersModalLabel.prepend(star);
  }
  ownersList.innerHTML = "";

  modalFlowerInfo.innerHTML = `
    <div class="modal-flower-thumb ${qualityClass(flower.quality)}">
      ${imageUrl ? `<img alt="" loading="lazy" decoding="async">` : `<i class="bi bi-flower2" aria-hidden="true"></i>`}
    </div>
    <div>
      <div class="modal-quality-badges">
        <span class="quality-badge ${qualityBadgeClass(flower.quality)}">
          ${qualityLabel(flower.quality)}
        </span>
        ${isSpecial && qualityBadgeClass(flower.quality) === "do" ? `<span class="special-quality-badge"><i class="bi bi-star-fill" aria-hidden="true"></i>Đặc biệt</span>` : ""}
      </div>
      <p class="modal-owner-count mb-0"></p>
    </div>
  `;
  const modalImage = modalFlowerInfo.querySelector("img");
  if (modalImage) {
    modalImage.src = imageUrl;
    modalImage.alt = flower.name;
    modalImage.addEventListener("error", () => {
      const placeholder = document.createElement("i");
      placeholder.className = "bi bi-flower2";
      placeholder.setAttribute("aria-hidden", "true");
      modalImage.replaceWith(placeholder);
    }, { once: true });
  }
  modalFlowerInfo.querySelector(".modal-owner-count").textContent =
    `${flower.owners.length} người sở hữu`;

  flower.owners
    .slice()
    .sort((a, b) => a.localeCompare(b, "vi"))
    .forEach((owner) => {
      const item = document.createElement("li");
      item.className = "list-group-item d-flex align-items-center gap-2";
      const icon = document.createElement("i");
      icon.className = "bi bi-person-circle";
      icon.setAttribute("aria-hidden", "true");
      const ownerName = document.createElement("span");
      ownerName.textContent = owner;
      item.append(icon, ownerName);
      ownersList.appendChild(item);
    });

  ownersModal.show();
}

function showError(message) {
  statusArea.classList.remove("d-none");
  statusArea.setAttribute("aria-busy", "false");
  const icon = document.createElement("i");
  icon.className = "bi bi-exclamation-triangle fs-2 d-block mb-2 text-warning";
  icon.setAttribute("aria-hidden", "true");
  const messageEl = document.createElement("p");
  messageEl.className = "mb-3";
  messageEl.textContent = message;
  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.className = "btn btn-outline-light btn-sm";
  retryButton.textContent = "Thử lại";
  retryButton.addEventListener("click", () => {
    retryButton.disabled = true;
    loadData();
  });
  statusArea.replaceChildren(icon, messageEl, retryButton);
}

function showLoading() {
  renderToken += 1;
  removeLoadMoreSentinel();
  flowerGrid.classList.add("d-none");
  statusArea.classList.remove("d-none");
  statusArea.setAttribute("aria-busy", "true");
  statusArea.innerHTML = `
    <div class="spinner-border text-light" aria-hidden="true">
      <span class="visually-hidden">Đang tải...</span>
    </div>
    <p class="mt-3 mb-0">Đang tải dữ liệu hoa...</p>
  `;
}

function serializeFlowers(flowers) {
  return JSON.stringify(flowers);
}

function flowerDataSignature(flower) {
  return JSON.stringify({
    name: flower.name,
    quality: normalizeQuality(flower.quality),
    image: (flower.image || "").trim(),
    owners: (flower.owners || []).slice().sort((a, b) => a.localeCompare(b, "vi")),
  });
}

function prioritizeChangedFlowers(previousFlowers, freshFlowers) {
  const previousByKey = new Map(
    previousFlowers.map((flower) => [flowerKey(flower.name), flowerDataSignature(flower)])
  );
  const previousIndexByKey = new Map(
    previousFlowers.map((flower, index) => [flowerKey(flower.name), index])
  );
  const changed = [];
  const unchanged = [];

  freshFlowers.forEach((flower) => {
    const previousSignature = previousByKey.get(flowerKey(flower.name));
    const target = previousSignature === flowerDataSignature(flower) ? unchanged : changed;
    target.push(flower);
  });

  unchanged.sort(
    (first, second) =>
      previousIndexByKey.get(flowerKey(first.name)) -
      previousIndexByKey.get(flowerKey(second.name))
  );

  return changed.concat(unchanged);
}

function readCachedFlowers() {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.flowers) || parsed.flowers.length === 0) return null;

    const flowers = parsed.flowers.map(normalizeFlowerEntry).filter(Boolean);
    if (flowers.length === 0) return null;

    return {
      flowers,
      savedAt: parsed.savedAt || 0,
    };
  } catch {
    return null;
  }
}

function writeCachedFlowers(flowers) {
  try {
    localStorage.setItem(
      CACHE_STORAGE_KEY,
      JSON.stringify({
        flowers,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Bỏ qua nếu localStorage đầy hoặc bị chặn (chế độ ẩn danh).
  }
}

function applyFlowers(flowers) {
  state.flowers = flowers.filter((flower) => (flower.owners || []).length > 0);
  populatePlayerFilterOptions(state.flowers);
  updateQualityCounts();
  rebuildFlowerIndex(state.flowers);
  statusArea.classList.add("d-none");
  statusArea.setAttribute("aria-busy", "false");
  renderFlowers(true);
}

async function fetchFlowersFromApi() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  const abortOnGuard = () => controller.abort();
  window.addEventListener("curiosityguard:block", abortOnGuard, { once: true });
  let response;
  try {
    response = await fetch(API_URL, { signal: controller.signal });
  } catch (error) {
    if (window.__curiosityGuardActive) {
      throw new Error(GUARD_BLOCKED_MESSAGE);
    }
    if (error.name === "AbortError") {
      throw new Error("Kết nối mất quá nhiều thời gian. Kiểm tra mạng rồi thử lại.");
    }
    throw new Error("Không thể kết nối tới máy chủ. Kiểm tra mạng rồi thử lại.");
  } finally {
    window.clearTimeout(timeoutId);
    window.removeEventListener("curiosityguard:block", abortOnGuard);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Không có quyền truy cập dữ liệu hoa. Vui lòng liên hệ quản lý group.");
    }
    if (response.status === 404) {
      throw new Error("Không tìm thấy nguồn dữ liệu hoa. Vui lòng liên hệ quản lý group.");
    }
    if (response.status === 429) {
      throw new Error("Máy chủ đang nhận quá nhiều yêu cầu. Vui lòng chờ rồi thử lại.");
    }
    throw new Error("Máy chủ chưa thể tải dữ liệu hoa. Vui lòng thử lại sau.");
  }

  try {
    return parseApiData(await response.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Máy chủ trả về dữ liệu không đọc được. Vui lòng thử lại sau.");
    }
    throw error;
  }
}

async function refreshFlowersInBackground(cachedSnapshot) {
  try {
    const freshFlowers = await fetchFlowersFromApi();
    const previousFlowers = state.flowers;
    const cachedData = cachedSnapshot || serializeFlowers(previousFlowers);
    const orderedFlowers = prioritizeChangedFlowers(previousFlowers, freshFlowers);

    writeCachedFlowers(orderedFlowers);

    if (serializeFlowers(orderedFlowers) !== cachedData) {
      applyFlowers(orderedFlowers);
    }
  } catch {
    // Giữ dữ liệu cache nếu mạng lỗi.
  }
}

function waitForGuardRelease() {
  if (guardReleaseHooked) return;

  guardReleaseHooked = true;
  window.addEventListener(
    "curiosityguard:release",
    () => {
      guardReleaseHooked = false;
      loadData();
    },
    { once: true }
  );
}

async function loadData() {
  // DevTools đang mở: không gọi API, chờ đóng DevTools rồi mới tải.
  if (window.__curiosityGuardActive) {
    waitForGuardRelease();
    return;
  }

  const cached = readCachedFlowers();

  if (cached) {
    applyFlowers(cached.flowers);
    refreshFlowersInBackground(serializeFlowers(cached.flowers));
    return;
  }

  showLoading();

  try {
    const flowers = await fetchFlowersFromApi();
    writeCachedFlowers(flowers);
    applyFlowers(flowers);
  } catch (error) {
    if (error && error.message === GUARD_BLOCKED_MESSAGE) {
      waitForGuardRelease();
      return;
    }
    showError(error.message || "Đã xảy ra lỗi khi tải dữ liệu.");
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

flowerGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".flower-card");
  if (!card) return;
  const flower = flowerByKey.get(card.dataset.flowerKey);
  if (flower) showOwnersModal(flower);
});

flowerGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".flower-card");
  if (!card) return;
  event.preventDefault();
  const flower = flowerByKey.get(card.dataset.flowerKey);
  if (flower) showOwnersModal(flower);
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((btn) => {
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
    });
    button.classList.add("active");
    button.setAttribute("aria-pressed", "true");
    state.activeFilter = button.dataset.filter;
    renderFlowers(true, true);
  });
});

memberMenuTrigger.addEventListener("click", () => {
  const isOpen = memberMenuTrigger.getAttribute("aria-expanded") === "true";
  setMemberMenuOpen(!isOpen);
});

closeMemberPanel.addEventListener("click", () => {
  setMemberMenuOpen(false, true);
});

memberPanelBackdrop.addEventListener("click", () => {
  setMemberMenuOpen(false, true);
});

memberMenuOptions.addEventListener("click", (event) => {
  const option = event.target.closest(".member-menu-option");
  if (!option) return;
  selectPlayer(option.dataset.player);
});

document.addEventListener("pointerdown", (event) => {
  if (
    memberMenuTrigger.getAttribute("aria-expanded") === "true" &&
    !memberPanel.contains(event.target) &&
    !memberMenuTrigger.contains(event.target)
  ) {
    setMemberMenuOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (memberMenuTrigger.getAttribute("aria-expanded") !== "true") return;

  if (event.key === "Escape") {
    setMemberMenuOpen(false, true);
    return;
  }

  if (event.key !== "Tab") return;
  const focusableElements = [...memberPanel.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => element.getClientRects().length > 0);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (!firstElement) {
    event.preventDefault();
    closeMemberPanel.focus();
  } else if (event.shiftKey && (document.activeElement === firstElement || !memberPanel.contains(document.activeElement))) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && (document.activeElement === lastElement || !memberPanel.contains(document.activeElement))) {
    event.preventDefault();
    firstElement.focus();
  }
});

searchInput.addEventListener("input", (event) => {
  state.searchQuery = event.target.value;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    renderFlowers(true, true);
  }, SEARCH_DEBOUNCE_MS);
});

closeCelebration.addEventListener("click", closeCelebrationNotice);

loadData();

// closeCelebration.addEventListener("click", closeCelebrationNotice);
// window.addEventListener("resize", resizeFireworksCanvas);
// if (celebrationConfig.autoShow !== false) {
//   window.setTimeout(showCelebration, 900);
// }