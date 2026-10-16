// 接单页面逻辑
(function () {
  document.getElementById("year").textContent = new Date().getFullYear();

  const list = document.getElementById("sundayList");
  const submitBtn = document.getElementById("submitBtn");
  const selBanner = document.getElementById("selBanner");
  const selText = document.getElementById("selText");
  const toast = document.getElementById("toast");
  const successModal = document.getElementById("successModal");
  const form = document.getElementById("bookingForm");

  let selectedDate = null;

  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = "toast " + (type || "") + " show";
    setTimeout(() => { toast.classList.remove("show"); }, 3500);
  }

  function fmtDate(s) {
    const d = new Date(s + "T00:00:00");
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${d.getFullYear()} 年 ${m} 月 ${day} 日`;
  }

  fetch("/api/sundays")
    .then(r => r.json())
    .then(items => {
      list.innerHTML = "";
      if (!items.length) {
        list.innerHTML = "<div class=\"empty-state\">暂无可预约日期</div>";
        return;
      }
      items.forEach(it => {
        const el = document.createElement("div");
        let cls = "sunday-item";
        let label = "可预约", labelCls = "open";
        if (!it.is_open) { cls += " disabled"; label = "休息"; labelCls = "rest"; }
        else if (it.taken) { cls += " disabled taken"; label = "已约"; labelCls = "taken"; }
        el.className = cls;
        el.innerHTML = `
          <div>
            <div class="d-date">${fmtDate(it.date)}</div>
            <div class="d-day">SUNDAY · 周日</div>
          </div>
          <div class="d-status ${labelCls}">${label}</div>
        `;
        if (it.is_open && !it.taken) {
          el.addEventListener("click", () => selectDate(it.date, el));
        }
        list.appendChild(el);
      });
    })
    .catch(err => {
      list.innerHTML = "<div class=\"empty-state\">日期加载失败</div>";
      console.error(err);
    });

  function selectDate(date, el) {
    document.querySelectorAll(".sunday-item.selected").forEach(n => n.classList.remove("selected"));
    el.classList.add("selected");
    selectedDate = date;
    selText.textContent = fmtDate(date);
    selBanner.classList.add("show");
    submitBtn.disabled = false;
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!selectedDate) { showToast("请先选择日期", "error"); return; }
    const fd = new FormData(form);
    const payload = {
      sunday_date: selectedDate,
      customer_name: fd.get("customer_name") || "",
      phone: fd.get("phone") || "",
      wechat: fd.get("wechat") || "",
      note: fd.get("note") || ""
    };
    submitBtn.disabled = true;
    submitBtn.textContent = "提交中...";
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "提交失败");
      successModal.classList.add("show");
      form.reset();
      selectedDate = null;
      selBanner.classList.remove("show");
      submitBtn.textContent = "提交预约 →";
      // 刷新列表
      setTimeout(() => location.reload(), 1800);
    } catch (err) {
      showToast(err.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "提交预约 →";
    }
  });
})();
