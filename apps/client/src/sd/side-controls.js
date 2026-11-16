// Keep the small toggle reachable while the map and camera controls are folded.
export function initSideControls() {
  const side = document.getElementById("side"), toggle = document.getElementById("sideToggle");
  let collapsed = matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  try {
    const saved = localStorage.getItem("parkSideCollapsed");
    if (saved === "true" || saved === "false") collapsed = saved === "true";
  } catch {}
  function apply() {
    side.classList.toggle("collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "지도와 화면 도구 펼치기" : "지도와 화면 도구 접기");
    toggle.textContent = collapsed ? "지도·도구 ▾" : "접기 ▴";
    if (collapsed) document.getElementById("settings").classList.add("hidden");
  }
  toggle.onclick = () => {
    collapsed = !collapsed;
    apply();
    try { localStorage.setItem("parkSideCollapsed", String(collapsed)); } catch {}
  };
  apply();
}
