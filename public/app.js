const form = document.getElementById("convert-form");
const urlInput = document.getElementById("url-input");
const submitBtn = document.getElementById("submit-btn");
const statusCard = document.getElementById("status-card");
const statusBadge = document.getElementById("status-badge");
const jobInfo = document.getElementById("job-info");
const fileList = document.getElementById("file-list");

let currentJobId = null;
let pollTimer = null;
const downloadedFiles = new Set();

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
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

    for (const file of data.files || []) {
      if (!downloadedFiles.has(file.id)) {
        downloadedFiles.add(file.id);

        triggerDownload(file.download_url, file.name);

        const item = document.createElement("div");
        item.className = "file-item";
        item.innerHTML = `
          <span class="file-name">🎬 ${file.name}</span>
          <span class="file-action">
            ✓ Đã tải xuống
            <a class="download-link" href="${file.download_url}" target="_blank">Tải lại</a>
          </span>
        `;
        fileList.appendChild(item);
      }
    }

    if (data.is_completed) {
      clearInterval(pollTimer);
      statusBadge.textContent = "✓ Hoàn tất tất cả!";
      statusBadge.classList.add("completed");
      submitBtn.disabled = false;
      submitBtn.textContent = "Bắt Đầu";
    } else {
      const count = downloadedFiles.size;
      statusBadge.textContent = count > 0
        ? `Đang xử lý tiếp... (Đã xong ${count} video)`
        : "Đang tải & nén video trên máy chủ...";
    }
  } catch (err) {
    console.error("Poll error:", err);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Đang gửi...";
  statusCard.classList.remove("hidden");
  fileList.innerHTML = "";
  downloadedFiles.clear();

  statusBadge.textContent = "Đang kết nối máy chủ GitHub Actions...";
  statusBadge.classList.remove("completed");

  try {
    const res = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();
    if (!data.success) {
      alert("Lỗi: " + (data.error || "Không thể khởi động tiến trình"));
      submitBtn.disabled = false;
      submitBtn.textContent = "Bắt Đầu";
      statusCard.classList.add("hidden");
      return;
    }

    currentJobId = data.job_id;
    jobInfo.textContent = `Mã phiên: ${currentJobId}`;
    statusBadge.textContent = "Máy chủ đang chạy, chuẩn bị tải video...";

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(checkStatus, 5000);
    checkStatus();
  } catch (err) {
    alert("Lỗi kết nối: " + err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "Bắt Đầu";
    statusCard.classList.add("hidden");
  }
});
