// 首页：作品加载 + 滚动动效
(function () {
  // 年份
  document.getElementById("year").textContent = new Date().getFullYear();

  // 导航滚动效果
  const nav = document.getElementById("nav");
  const onScroll = () => {
    if (window.scrollY > 40) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Hero 背景：取第一张照片作为背景
  const heroBg = document.getElementById("heroBg");
  const aboutImg = document.getElementById("aboutImg");

  // 视差
  let lastY = 0;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    if (heroBg && y < window.innerHeight) {
      heroBg.style.transform = `scale(${1.05 + y * 0.0003}) translateY(${y * 0.3}px)`;
    }
    lastY = y;
  }, { passive: true });

  // 平滑滚动
  document.querySelectorAll("a[href^=\"#\"]").forEach(a => {
    a.addEventListener("click", e => {
      const id = a.getAttribute("href");
      if (id.length > 1) {
        const el = document.querySelector(id);
        if (el) {
          e.preventDefault();
          window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: "smooth" });
        }
      }
    });
  });

  // 加载作品
  const gallery = document.getElementById("gallery");
  fetch("/api/photos")
    .then(r => r.json())
    .then(photos => {
      if (!photos.length) {
        gallery.outerHTML = "<div class=\"empty-state\" style=\"grid-column: span 12\">尚未上传作品。登录后台添加你的第一张照片 →</div>";
        return;
      }
      // 按预设的网格模式排布，让画面有节奏感
      const sizes = ["s-8", "s-4", "s-4", "s-6", "s-6", "s-5", "s-7", "s-12", "s-4", "s-4", "s-4"];
      gallery.innerHTML = "";
      photos.forEach((p, i) => {
        const item = document.createElement("div");
        const cls = sizes[i % sizes.length];
        item.className = "gallery-item " + cls;
        item.innerHTML = `
          <img src="${p.url}" alt="${escapeHtml(p.title || "")}" loading="lazy">
          <div class="g-overlay">
            <div class="g-text">
              <div class="g-title">${escapeHtml(p.title || "Untitled")}</div>
              <div class="g-desc">${escapeHtml(p.description || "View →")}</div>
            </div>
          </div>
        `;
        gallery.appendChild(item);
      });

      // 首张照片作为 hero / about 背景
      if (photos[0] && heroBg) heroBg.style.backgroundImage = `url(${photos[0].url})`;
      if (photos[1] && aboutImg) {
        aboutImg.style.backgroundImage = `url(${photos[1].url})`;
      } else if (photos[0] && aboutImg) {
        aboutImg.style.backgroundImage = `url(${photos[0].url})`;
      }

      // IntersectionObserver：作品淡入
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            en.target.classList.add("in-view");
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.12 });
      document.querySelectorAll(".gallery-item").forEach((el, i) => {
        el.style.transitionDelay = `${(i % 6) * 80}ms`;
        io.observe(el);
      });
    })
    .catch(err => {
      gallery.innerHTML = "<div class=\"empty-state\" style=\"grid-column: span 12\">作品加载失败</div>";
      console.error(err);
    });

  const ESC_MAP = {
  38: String.fromCharCode(38,97,109,112,59),
  60: String.fromCharCode(38,108,116,59),
  62: String.fromCharCode(38,103,116,59),
  34: String.fromCharCode(38,113,117,111,116,59),
  39: String.fromCharCode(38,35,51,57,59)
};
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"\x27]/g, function (c) {
    return ESC_MAP[c.charCodeAt(0)];
  });
}
})();
