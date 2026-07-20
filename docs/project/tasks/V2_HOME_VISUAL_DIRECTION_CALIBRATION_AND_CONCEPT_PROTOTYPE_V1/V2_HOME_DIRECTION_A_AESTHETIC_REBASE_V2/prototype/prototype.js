(() => {
  const series = {
    daily: {
      name: "日",
      labels: ["07-01", "07-10", "07-20", "07-31"],
      actual: [720, 780, 810, 900, null, 970, 1020, 1080, 1130, 1190, 1240, 1284],
      target: [700, 750, 800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200, 1260]
    },
    weekly: {
      name: "周",
      labels: ["第 1 周", "第 2 周", "第 3 周", "第 4 周"],
      actual: [260, 580, 910, 1284],
      target: [250, 550, 900, 1260]
    },
    monthly: {
      name: "月",
      labels: ["5 月", "6 月", "7 月 MTD", ""],
      actual: [540, 920, 1284],
      target: [500, 880, 1260]
    }
  };

  const width = 450;
  const height = 168;
  const plotTop = 16;
  const plotBottom = 140;
  const min = 0;
  const max = 1400;

  const point = (value, index, count) => ({
    x: count <= 1 ? width / 2 : (index / (count - 1)) * width,
    y: plotBottom - ((value - min) / (max - min)) * (plotBottom - plotTop)
  });

  const linePath = (values) => {
    let path = "";
    let drawing = false;
    values.forEach((value, index) => {
      if (value === null) {
        drawing = false;
        return;
      }
      const current = point(value, index, values.length);
      path += `${drawing ? " L" : " M"} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
      drawing = true;
    });
    return path.trim();
  };

  const areaPath = (values) => {
    const valid = values
      .map((value, index) => value === null ? null : { ...point(value, index, values.length), index })
      .filter(Boolean);
    if (!valid.length) return "";
    const topPath = valid.map((current, index) => `${index ? "L" : "M"} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`).join(" ");
    const last = valid[valid.length - 1];
    const first = valid[0];
    return `${topPath} L ${last.x.toFixed(2)} ${plotBottom} L ${first.x.toFixed(2)} ${plotBottom} Z`;
  };

  const actualLine = document.getElementById("actual-line");
  const targetLine = document.getElementById("target-line");
  const actualArea = document.getElementById("actual-area");
  const actualPoint = document.getElementById("actual-point");
  const actualLabel = document.getElementById("actual-label");
  const targetLabel = document.getElementById("target-label");
  const trendDescription = document.getElementById("trend-description");
  const chartAxis = document.getElementById("chart-axis");
  const chartLive = document.getElementById("chart-live");

  const renderChart = (period) => {
    const data = series[period];
    actualLine.setAttribute("d", linePath(data.actual));
    targetLine.setAttribute("d", linePath(data.target));
    actualArea.setAttribute("d", areaPath(data.actual));

    const actualEndIndex = data.actual.length - 1;
    const actualEnd = point(data.actual[actualEndIndex], actualEndIndex, data.actual.length);
    const targetEndIndex = data.target.length - 1;
    const targetEnd = point(data.target[targetEndIndex], targetEndIndex, data.target.length);

    actualPoint.setAttribute("cx", actualEnd.x.toFixed(2));
    actualPoint.setAttribute("cy", actualEnd.y.toFixed(2));
    actualLabel.setAttribute("transform", `translate(${actualEnd.x.toFixed(2)} ${actualEnd.y.toFixed(2)})`);
    targetLabel.setAttribute("transform", `translate(${targetEnd.x.toFixed(2)} ${targetEnd.y.toFixed(2)})`);

    chartAxis.replaceChildren(...data.labels.map((label) => {
      const span = document.createElement("span");
      span.textContent = label;
      return span;
    }));

    trendDescription.textContent = `当前为${data.name}粒度。氧气绿实线为实际 GMV，灰色虚线为目标节奏；缺失点不连接。`;
    chartLive.textContent = `已切换为${data.name}粒度趋势。`;
  };

  document.querySelectorAll("[data-period]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-period]").forEach((peer) => {
        peer.setAttribute("aria-pressed", String(peer === button));
      });
      renderChart(button.dataset.period);
    });
  });

  const panel = document.getElementById("health-panel");
  const scrim = document.getElementById("health-scrim");
  const desktopOpen = document.getElementById("health-open");
  const mobileOpen = document.getElementById("mobile-health-open");
  const close = document.getElementById("health-close");
  let returnFocus = null;

  const setPanel = (open, trigger) => {
    if (open && trigger) returnFocus = trigger;
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    scrim.hidden = !open;
    desktopOpen.setAttribute("aria-expanded", String(open));
    mobileOpen.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
    if (open) {
      window.setTimeout(() => close.focus(), 20);
    } else if (returnFocus) {
      returnFocus.focus();
      returnFocus = null;
    }
  };

  desktopOpen.addEventListener("click", () => setPanel(true, desktopOpen));
  mobileOpen.addEventListener("click", () => setPanel(true, mobileOpen));
  close.addEventListener("click", () => setPanel(false));
  scrim.addEventListener("click", () => setPanel(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) {
      setPanel(false);
    }
  });

  renderChart("daily");
})();
