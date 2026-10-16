// 后台管理逻辑
(function () {
  const loginView = document.getElementById("loginView");
  const panelView = document.getElementById("panelView");
  const loginForm = document.getElementById("loginForm");
  const loginPwd = document.getElementById("loginPwd");
  const loginErr = document.getElementById("loginErr");
  const logoutBtn = document.getElementById("logoutBtn");
  const toast = document.getElementById("toast");

  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = "toast " + (type || "") + " show";
    setTimeout(() => toast.classList.remove("show"), 3500);
  }
  function fmtPretty(s) {
    const d = new Date(s + "T00:00:00");
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  }

  // HTML 转义（防 XSS）
const ESC_MAP = {
  38: String.fromCharCode(38,97,109,112,59),
  60: String.fromCharCode(38,108,116,59),
  62: String.fromCharCode(38,103,116,59),
  34: String.fromCharCode(38,113,117,111,116,59),
  39: String.fromCharCode(38,35,51,57,59)
};
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return ESC_MAP[c.charCodeAt(0)];
  });
}

  // 检查登录状态
  fetch("/api/admin/me").then(function (r) { return r.json(); }).then(function (d) {
    if (d.logged_in) showPanel();
  });

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    loginErr.style.display = "none";
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPwd.value })
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || "登录失败");
      }
      showPanel();
    } catch (err) {
      loginErr.textContent = err.message;
      loginErr.style.display = "block";
    }
  });

  logoutBtn.addEventListener("click", async function (e) {
    e.preventDefault();
    await fetch("/api/admin/logout", { method: "POST" });
    location.reload();
  });

  function showPanel() {
    loginView.style.display = "none";
    panelView.style.display = "block";
    loadPhotos();
    loadAvailability();
    loadOrders();
  }

  document.querySelectorAll(".tabs button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tabs button").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      const t = btn.dataset.tab;
      document.querySelector(".tab-panel[data-panel=\"" + t + "\"]").classList.add("active");
    });
  });

  // ============ 作品管理 ============
  const photoList = document.getElementById("photoList");
  const uploadCard = document.getElementById("uploadCard");
  const upFile = document.getElementById("upFile");
  const upTitle = document.getElementById("upTitle");
  const upDesc = document.getElementById("upDesc");

  function loadPhotos() {
    photoList.innerHTML = "<div class=\"loading\" style=\"grid-column: 1/-1\">加载中</div>";
    fetch("/api/photos").then(function (r) { return r.json(); }).then(function (photos) {
      photoList.innerHTML = "";
      if (!photos.length) {
        photoList.innerHTML = "<div class=\"empty-state\" style=\"grid-column: 1/-1\">还没有作品，拖拽图片到上方上传区域</div>";
        return;
      }
      photos.forEach(function (p) {
        const card = document.createElement("div");
        card.className = "photo-card";
        card.innerHTML =
          "<img src=\"" + p.url + "\" alt=\"\">" +
          "<div class=\"p-meta\">" +
            "<div class=\"p-title\">" + escapeHtml(p.title || "Untitled") + "</div>" +
            "<div class=\"p-desc\">" + escapeHtml(p.description || "—") + "</div>" +
            "<div class=\"p-actions\">" +
              "<button data-act=\"up\" data-id=\"" + p.id + "\">↑ 上移</button>" +
              "<button data-act=\"edit\" data-id=\"" + p.id + "\">编辑</button>" +
              "<button class=\"del\" data-act=\"del\" data-id=\"" + p.id + "\">删除</button>" +
            "</div>" +
          "</div>";
        photoList.appendChild(card);
      });
    });
  }

  photoList.addEventListener("click", async function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    if (act === "del") {
      if (!confirm("确认删除这张照片？")) return;
      const r = await fetch("/api/admin/photos/" + id, { method: "DELETE" });
      if (r.ok) { showToast("已删除", "success"); loadPhotos(); }
      else showToast("删除失败", "error");
    } else if (act === "edit") {
      const card = btn.closest(".photo-card");
      const curTitle = card.querySelector(".p-title").textContent;
      const curDesc = card.querySelector(".p-desc").textContent;
      const newTitle = prompt("新标题：", curTitle === "Untitled" ? "" : curTitle);
      if (newTitle === null) return;
      const newDesc = prompt("新描述：", curDesc === "—" ? "" : curDesc);
      if (newDesc === null) return;
      const r = await fetch("/api/admin/photos/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, description: newDesc })
      });
      if (r.ok) { showToast("已更新", "success"); loadPhotos(); }
    } else if (act === "up") {
      const card = btn.closest(".photo-card");
      const idx = Array.prototype.indexOf.call(photoList.children, card);
      if (idx === 0) return;
      const prevCard = photoList.children[idx - 1];
      const allPhotos = await fetch("/api/photos").then(function (r) { return r.json(); });
      const targetPhoto = allPhotos[idx - 1];
      const photo = allPhotos.find(function (p) { return String(p.id) === String(id); });
      const newOrder = (targetPhoto && targetPhoto.id ? targetPhoto.id : 0) - 1;
      await fetch("/api/admin/photos/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: newOrder })
      });
      loadPhotos();
    }
  });

  uploadCard.addEventListener("dragover", function (e) { e.preventDefault(); uploadCard.classList.add("dragover"); });
  uploadCard.addEventListener("dragleave", function () { uploadCard.classList.remove("dragover"); });
  uploadCard.addEventListener("drop", function (e) {
    e.preventDefault();
    uploadCard.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files[0]);
  });
  upFile.addEventListener("change", function (e) {
    if (e.target.files.length) handleUpload(e.target.files[0]);
    e.target.value = "";
  });

  async function handleUpload(file) {
    if (!file.type.startsWith("image/")) { showToast("请选择图片文件", "error"); return; }
    if (file.size > 15 * 1024 * 1024) { showToast("文件大小不能超过 15MB", "error"); return; }
    const fd = new FormData();
    fd.append("photo", file);
    fd.append("title", upTitle.value || "");
    fd.append("description", upDesc.value || "");
    showToast("上传中...", "");
    try {
      const r = await fetch("/api/admin/photos", { method: "POST", body: fd });
      if (!r.ok) throw new Error(((await r.json()).error) || "上传失败");
      showToast("上传成功", "success");
      upTitle.value = ""; upDesc.value = "";
      loadPhotos();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  // ============ 排期管理 ============
  const availList = document.getElementById("availabilityList");

  function loadAvailability() {
    availList.innerHTML = "<div class=\"loading\">加载中</div>";
    fetch("/api/admin/availability").then(function (r) { return r.json(); }).then(function (items) {
      availList.innerHTML = "";
      items.forEach(function (it) {
        const el = document.createElement("div");
        el.className = "avail-item";
        el.innerHTML =
          "<div class=\"ad\">" + fmtPretty(it.date) + "<small>" + it.date + " · SUNDAY</small></div>" +
          "<input class=\"note-input\" placeholder=\"备注（可选）\" value=\"" + escapeHtml(it.note || "") + "\">" +
          "<label class=\"switch\">" +
            "<input type=\"checkbox\" " + (it.is_open ? "checked" : "") + ">" +
            "<span class=\"slider\"></span>" +
          "</label>";
        const checkbox = el.querySelector("input[type=checkbox]");
        const noteInput = el.querySelector("input.note-input");
        const save = async function () {
          try {
            const r = await fetch("/api/admin/availability/" + it.date, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_open: checkbox.checked, note: noteInput.value })
            });
            if (!r.ok) throw new Error();
            showToast("已保存", "success");
          } catch (e) { showToast("保存失败", "error"); }
        };
        checkbox.addEventListener("change", save);
        let noteTimer;
        noteInput.addEventListener("input", function () {
          clearTimeout(noteTimer);
          noteTimer = setTimeout(save, 600);
        });
        availList.appendChild(el);
      });
    });
  }

  // ============ 订单管理 ============
  const ordersBody = document.getElementById("ordersBody");

  function loadOrders() {
    ordersBody.innerHTML = "<tr><td colspan=\"8\"><div class=\"loading\">加载中</div></td></tr>";
    fetch("/api/admin/orders").then(function (r) { return r.json(); }).then(function (orders) {
      ordersBody.innerHTML = "";
      if (!orders.length) {
        ordersBody.innerHTML = "<tr><td colspan=\"8\" style=\"text-align:center;color:var(--text-muted);padding:40px\">暂无订单</td></tr>";
        return;
      }
      orders.forEach(function (o) {
        const tr = document.createElement("tr");
        const isFinal = o.status === "cancelled" || o.status === "done";
        const isConfirmed = o.status === "confirmed" || isFinal;
        tr.innerHTML =
          "<td>#" + o.id + "</td>" +
          "<td>" + fmtPretty(o.sunday_date) + "</td>" +
          "<td>" + escapeHtml(o.customer_name || "—") + "</td>" +
          "<td class=\"hide-mobile\">" + escapeHtml(o.phone) + "</td>" +
          "<td class=\"hide-mobile\">" + escapeHtml(o.wechat) + "</td>" +
          "<td><span class=\"status-tag " + o.status + "\">" + o.status + "</span></td>" +
          "<td class=\"hide-mobile\">" + escapeHtml(o.note || "—") + "</td>" +
          "<td class=\"o-actions\">" +
            "<button data-act=\"confirm\" data-id=\"" + o.id + "\" " + (isConfirmed ? "disabled" : "") + ">确认</button>" +
            "<button data-act=\"done\" data-id=\"" + o.id + "\" " + (isFinal ? "disabled" : "") + ">完成</button>" +
            "<button data-act=\"cancel\" data-id=\"" + o.id + "\" " + (isFinal ? "disabled" : "") + ">取消</button>" +
            "<button data-act=\"del\" data-id=\"" + o.id + "\" style=\"color:var(--danger)\">删</button>" +
          "</td>";
        ordersBody.appendChild(tr);
      });
    });
  }

  ordersBody.addEventListener("click", async function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    const map = { confirm: "confirmed", done: "done", cancel: "cancelled" };
    if (act === "del") {
      if (!confirm("确认删除订单？")) return;
      const r = await fetch("/api/admin/orders/" + id, { method: "DELETE" });
      if (r.ok) { showToast("已删除", "success"); loadOrders(); }
    } else if (map[act]) {
      const r = await fetch("/api/admin/orders/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: map[act] })
      });
      if (r.ok) { showToast("已更新", "success"); loadOrders(); }
    }
  });
})();
