const form = document.getElementById("convert-form");
const urlInput = document.getElementById("url-input");
const urlLabel = document.getElementById("url-label");
const urlError = document.getElementById("url-error");
const submitBtn = document.getElementById("submit-btn");
const statusCard = document.getElementById("status-card");
const statusBadge = document.getElementById("status-badge");
const jobInfo = document.getElementById("job-info");
const fileList = document.getElementById("file-list");
const manifestInfo = document.getElementById("manifest-info");
const manifestTitle = document.getElementById("manifest-title");
const manifestCounter = document.getElementById("manifest-counter");

const tabSingle = document.getElementById("tab-single");
const tabPlaylist = document.getElementById("tab-playlist");

let currentMode = "single";
let currentJobId = null;
let pollTimer = null;
const downloadedFiles = new Set();
let renderedManifest = null;

tabSingle.addEventListener("click", () => {
  if (currentMode === "single") return;
  currentMode = "single";
  tabSingle.classList.add("active");
  tabPlaylist.classList.remove("active");
  urlLabel.textContent = "Nhập liên kết Video YouTube:";
  urlInput.placeholder = "https://www.youtube.com/watch?v=... hoặc https://youtu.be/...";
  urlError.classList.add("hidden");
});

tabPlaylist.addEventListener("click", () => {
  if (currentMode === "playlist") return;
  currentMode = "playlist";
  tabPlaylist.classList.add("active");
  tabSingle.classList.remove("active");
  urlLabel.textContent = "Nhập liên kết Danh Sách Phát YouTube (Playlist):";
  urlInput.placeholder = "https://www.youtube.com/playlist?list=...";
  urlError.classList.add("hidden");
});

function validateYouTubeUrl(rawUrl, mode) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (e) {
    return "Đường dẫn không đúng định dạng URL!";
  }

  const validHosts = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"];
  if (!validHosts.includes(parsed.hostname.toLowerCase())) {
    return "Vui lòng nhập đường dẫn thuộc YouTube (youtube.com hoặc youtu.be)!";
  }

  if (mode === "single") {
    if (parsed.hostname.toLowerCase() === "youtu.be") {
      if (parsed.pathname.length <= 1) {
        return "Đường dẫn youtu.be thiếu mã video!";
      }
    } else {
      const v = parsed.searchParams.get("v");
      const isShorts = parsed.pathname.startsWith("/shorts/");
      const isEmbed = parsed.pathname.startsWith("/embed/");
      if (!v && !isShorts && !isEmbed) {
        return "Đường dẫn không chứa mã video YouTube (?v=...)!";
      }
    }
  } else if (mode === "playlist") {
    const listId = parsed.searchParams.get("list");
    if (!listId) {
      return "Đường dẫn không chứa danh sách phát (thiếu tham số ?list=...)! Nếu là video đơn, vui lòng chọn tab Video Đơn.";
    }
  }

  return null;
}

function triggerDownload(url) {
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(() => iframe.remove(), 120000);
}

function renderQueue(manifest) {
  if (renderedManifest && renderedManifest.total === manifest.total) return;
  renderedManifest = manifest;

  manifestInfo.classList.remove("hidden");
  manifestTitle.textContent = manifest.title || "Danh sách video";
  manifestCounter.textContent = `0/${manifest.total}`;

  fileList.innerHTML = "";
  manifest.items.forEach((it) => {
    const el = document.createElement("div");
    el.className = "file-item";
    el.id = `item-${it.index}`;
    el.innerHTML = `
      <span class="file-name">${it.index.toString().padStart(2, "0")}. ${it.title}</span>
      <div class="file-action" id="action-${it.index}">
        <span class="status-tag waiting">⏳ Chờ lượt</span>
      </div>
    `;
    fileList.appendChild(el);
  });
}

function updateQueueStatus(manifest, files) {
  const readyIndices = new Set();

  files.forEach((file) => {
    const idx = file.index;
    if (idx) readyIndices.add(idx);

    if (!downloadedFiles.has(file.id)) {
      downloadedFiles.add(file.id);
      triggerDownload(file.download_url);
    }

    const itemEl = document.getElementById(`item-${idx}`);
    const actionEl = document.getElementById(`action-${idx}`);
    if (itemEl && actionEl) {
      itemEl.className = "file-item is-ready";
      actionEl.innerHTML = `
        <span class="status-tag ready">✓ Đã tải</span>
        <a class="download-link" href="${file.download_url}" target="_blank" rel="noopener">Tải lại</a>
      `;
    }
  });

  if (manifest) {
    manifestCounter.textContent = `Đã tải ${downloadedFiles.size}/${manifest.total}`;

    let foundProcessing = false;
    manifest.items.forEach((it) => {
      if (!readyIndices.has(it.index)) {
        const itemEl = document.getElementById(`item-${it.index}`);
        const actionEl = document.getElementById(`action-${it.index}`);
        if (itemEl && actionEl) {
          if (!foundProcessing) {
            foundProcessing = true;
            itemEl.className = "file-item is-processing";
            actionEl.innerHTML = `<span class="status-tag processing">⚙️ Đang xử lý</span>`;
          } else {
            itemEl.className = "file-item";
            actionEl.innerHTML = `<span class="status-tag waiting">⏳ Chờ lượt</span>`;
          }
        }
      }
    });
  }
}

async function checkStatus() {
  if (!currentJobId) return;

  try {
    const res = await fetch(`/api/status?job_id=${encodeURIComponent(currentJobId)}`);
    const data = await res.json();

    if (!data.success) {
      statusBadge.textContent = "Lỗi: " + (data.error || "Không thể kiểm tra");
      return;
    }

    if (data.manifest) {
      renderQueue(data.manifest);
    }

    updateQueueStatus(data.manifest, data.files || []);

    if (data.is_completed) {
      clearInterval(pollTimer);
      statusBadge.textContent = "✓ Hoàn tất tất cả!";
      statusBadge.classList.add("completed");
      submitBtn.disabled = false;
      submitBtn.textContent = "Bắt Đầu";
      sessionStorage.removeItem("current_job_id");
    } else {
      const count = downloadedFiles.size;
      const total = data.manifest ? data.manifest.total : "?";
      statusBadge.textContent = count > 0
        ? `Đang xử lý... (${count}/${total})`
        : "Đang tải & nén video trên máy chủ...";
    }
  } catch (err) {
    console.error("Poll error:", err);
  }
}

function startPolling(jobId) {
  currentJobId = jobId;
  jobInfo.textContent = `Mã: ${currentJobId}`;
  statusCard.classList.remove("hidden");
  statusBadge.textContent = "Máy chủ đang khởi động...";
  statusBadge.classList.remove("completed");
  submitBtn.disabled = true;
  submitBtn.textContent = "Đang xử lý...";

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(checkStatus, 3500);
  checkStatus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const rawUrl = urlInput.value.trim();
  if (!rawUrl) return;

  const err = validateYouTubeUrl(rawUrl, currentMode);
  if (err) {
    urlError.textContent = err;
    urlError.classList.remove("hidden");
    return;
  }
  urlError.classList.add("hidden");

  let targetUrl = rawUrl;
  if (currentMode === "single") {
    try {
      const u = new URL(rawUrl);
      if (u.searchParams.has("list")) {
        u.searchParams.delete("list");
        u.searchParams.delete("index");
        targetUrl = u.toString();
      }
    } catch (e) {}
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Đang gửi...";
  statusCard.classList.remove("hidden");
  fileList.innerHTML = "";
  manifestInfo.classList.add("hidden");
  renderedManifest = null;
  downloadedFiles.clear();

  try {
    const res = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl }),
    });

    const data = await res.json();
    if (!data.success) {
      alert("Lỗi: " + (data.error || "Không thể khởi động"));
      submitBtn.disabled = false;
      submitBtn.textContent = "Bắt Đầu";
      statusCard.classList.add("hidden");
      return;
    }

    sessionStorage.setItem("current_job_id", data.job_id);
    startPolling(data.job_id);
  } catch (err) {
    alert("Lỗi kết nối: " + err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Bắt Đầu";
    statusCard.classList.add("hidden");
  }
});

const savedJob = sessionStorage.getItem("current_job_id");
if (savedJob) {
  startPolling(savedJob);
}
