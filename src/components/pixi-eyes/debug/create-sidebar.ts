// @env browser

// Minimal sidebar UI with slide-in panel

import {
  CONTROL_DEFINITIONS,
  SECTIONS,
  sanitizeHexColor,
  sanitizeFocusEase,
  sanitizeLayoutShape,
  sanitizeCrossType,
} from "../controls";
import type { ControlDefinition } from "../controls";

export type SidebarBindings = {
  destroy: () => void;
  toggle: () => void;
  open: () => void;
  close: () => void;
};

type SceneAPI = {
  setConfig: (config: Record<string, unknown>) => void;
};

type UpdateSettings = (patch: Record<string, number | string>) => void;

const SIDEBAR_ID = "pixi-eyes-sidebar";
const FPS_VALUE_ID = "pixi-eyes-fps";
const VISIBLE_VALUE_ID = "pixi-eyes-visible";

const TOGGLE_BUTTON_CLASS =
  "fixed bottom-4 right-4 z-50 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--color-fixed-foreground)]/15 bg-[color-mix(in_oklab,var(--color-fixed-background)_72%,transparent)] text-2xl text-[var(--color-fixed-foreground)] backdrop-blur-sm transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105";

const SIDEBAR_CLASS =
  "fixed top-0 right-0 bottom-0 z-[9998] flex w-[300px] flex-col border-l border-[var(--color-fixed-foreground)]/10 bg-[color-mix(in_oklab,var(--color-fixed-background)_78%,transparent)] text-[var(--color-fixed-foreground)] backdrop-blur-md transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] shadow-[-4px_0_24px_rgba(0,0,0,0.1)]";

const SIDEBAR_CLOSED_CLASS = "translate-x-full";
const SIDEBAR_OPEN_CLASS = "translate-x-0";

const HEADER_CLASS = "flex items-center justify-between border-b border-[var(--color-fixed-foreground)]/8 px-5 py-4";

const TITLE_CLASS = "text-[11px] font-bold uppercase tracking-widest text-[var(--color-fixed-foreground)]/45";

const CLOSE_BUTTON_CLASS =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-[var(--color-fixed-foreground)]/10 bg-transparent text-base text-[var(--color-fixed-foreground)]/50 transition-all duration-150 hover:bg-[var(--color-fixed-foreground)]/5 hover:text-[var(--color-fixed-foreground)]/80";

const METRICS_CLASS = "flex gap-3 border-b border-[var(--color-fixed-foreground)]/6 px-5 py-3";

const METRIC_CLASS = "flex-1 rounded-xl border border-[var(--color-fixed-foreground)]/8 px-3.5 py-2.5";

const METRIC_LABEL_CLASS = "text-[10px] font-bold uppercase tracking-widest text-[var(--color-fixed-foreground)]/40";

const METRIC_VALUE_CLASS = "mt-1.5 text-2xl font-medium text-[var(--color-fixed-foreground)]/90";

const CONTENT_CLASS = "flex-1 overflow-y-auto px-5 py-4";

const SECTION_CLASS = "mb-5";

const SECTION_HEADER_CLASS = "flex items-center justify-between py-2 cursor-pointer select-none";

const SECTION_TITLE_CLASS = "text-[11px] font-bold uppercase tracking-widest text-[var(--color-fixed-foreground)]/35";

const SECTION_CHEVRON_CLASS =
  "flex h-5 w-5 items-center justify-center text-[var(--color-fixed-foreground)]/30 transition-transform duration-200 rotate-180";

const SECTION_CHEVRON_CLOSED_CLASS = "rotate-0";

const SECTION_CONTROLS_CLASS = "grid gap-2 mt-2";

const CONTROL_CLASS = "grid grid-cols-[1fr_80px] items-center gap-3 py-2";

const CONTROL_LABEL_CLASS = "text-[12px] font-medium tracking-tight text-[var(--color-fixed-foreground)]/55";

const CONTROL_INPUT_CLASS =
  "h-7 w-full rounded-md border border-[var(--color-fixed-foreground)]/12 bg-transparent px-2 text-[13px] text-[var(--color-fixed-foreground)]/90 outline-none transition-colors focus:border-[var(--color-fixed-foreground)]/30";

const CONTROL_INPUT_COLOR_CLASS =
  "h-7 w-full cursor-pointer rounded-md border border-[var(--color-fixed-foreground)]/12 bg-transparent p-0.5 text-[13px] text-[var(--color-fixed-foreground)]/90 outline-none transition-colors focus:border-[var(--color-fixed-foreground)]/30";

function getNumberDisplayValue(
  value: number | string,
  step: number | undefined,
  def: number | string,
): string {
  if (typeof value !== "number" || typeof step !== "number") {
    return String(def);
  }
  if (!Number.isFinite(value)) {
    return String(def);
  }
  if (step < 1) {
    return value.toFixed(2);
  }
  return String(value);
}

function renderNumberControl(control: ControlDefinition, value: number | string): string {
  const { id, label, min, max, step, default: def } = control;
  const displayValue = getNumberDisplayValue(value, step, def);
  return `
    <label class="${CONTROL_CLASS}">
      <span class="${CONTROL_LABEL_CLASS}">${label}</span>
      <input id="${id}" class="${CONTROL_INPUT_CLASS}" type="number" min="${min}" max="${max}" step="${step}" value="${displayValue}" />
    </label>
  `;
}

function renderColorControl(control: ControlDefinition, value: number | string): string {
  const { id, label, default: def } = control;
  return `
    <label class="${CONTROL_CLASS}">
      <span class="${CONTROL_LABEL_CLASS}">${label}</span>
      <input id="${id}" class="${CONTROL_INPUT_COLOR_CLASS}" type="color" value="${typeof value === "string" ? value : def}" />
    </label>
  `;
}

function renderSelectControl(control: ControlDefinition, value: number | string): string {
  const { id, label, options } = control;
  if (!options) return "";
  const opts = options
    .map(
      (o) =>
        `<option value="${o.value}"${o.value === value ? " selected" : ""}>${o.label}</option>`,
    )
    .join("");
  return `
    <label class="${CONTROL_CLASS}">
      <span class="${CONTROL_LABEL_CLASS}">${label}</span>
      <select id="${id}" class="${CONTROL_INPUT_CLASS}">${opts}</select>
    </label>
  `;
}

const RENDER_BY_TYPE: Record<string, (ctrl: ControlDefinition, val: number | string) => string> = {
  number: renderNumberControl,
  color: renderColorControl,
  select: renderSelectControl,
};

function renderControl(control: ControlDefinition, value: number | string): string {
  const render = RENDER_BY_TYPE[control.type];
  return render ? render(control, value) : "";
}

function renderSection(section: string, stored: Record<string, number | string>): string {
  const controls = CONTROL_DEFINITIONS.filter((c) => c.section === section);
  const controlsHtml = controls.map((c) => renderControl(c, stored[c.id] ?? c.default)).join("");
  return `
    <div class="${SECTION_CLASS}" data-section="${section}">
      <div class="${SECTION_HEADER_CLASS}" data-section-toggle>
        <span class="${SECTION_TITLE_CLASS}">${section}</span>
        <span class="${SECTION_CHEVRON_CLASS}" data-section-chevron>⌄</span>
      </div>
      <div class="${SECTION_CONTROLS_CLASS}">${controlsHtml}</div>
    </div>
  `;
}

function renderAllSections(stored: Record<string, number | string>): string {
  return SECTIONS.map((section) => renderSection(section, stored)).join("");
}

function clampInput(
  input: HTMLInputElement,
  min: number,
  max: number,
  fractionDigits?: number,
): number {
  const rawValue = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : min;
  const clamped = Math.min(Math.max(rawValue, min), max);
  if (typeof fractionDigits === "number") {
    input.value = clamped.toFixed(fractionDigits);
  } else {
    input.value = String(clamped);
  }
  return clamped;
}

function bindNumberInput(
  id: string,
  min: number,
  max: number,
  fractionDigits: number | undefined,
  scene: SceneAPI,
  updateStoredSettings: UpdateSettings,
): () => void {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) return () => {};

  const applyValue = (value: number) => {
    updateStoredSettings({ [id]: value });
    scene.setConfig({ [id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]: value });
  };

  const commit = () => {
    const value = clampInput(input, min, max, fractionDigits);
    applyValue(value);
  };

  const onInput = () => {
    if (!Number.isFinite(input.valueAsNumber)) {
      return;
    }

    const value = Math.min(Math.max(input.valueAsNumber, min), max);
    applyValue(value);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") commit();
  };

  input.addEventListener("input", onInput);
  input.addEventListener("change", commit);
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", onKeyDown);

  return () => {
    input.removeEventListener("input", onInput);
    input.removeEventListener("change", commit);
    input.removeEventListener("blur", commit);
    input.removeEventListener("keydown", onKeyDown);
  };
}

function bindColorInput(
  id: string,
  scene: SceneAPI,
  updateStoredSettings: UpdateSettings,
): () => void {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) return () => {};

  const hexToNumber = (value: string) => Number.parseInt(value.slice(1), 16);

  const commit = () => {
    const value = sanitizeHexColor(input.value, "#000000");
    input.value = value;
    updateStoredSettings({ [id]: value });
    scene.setConfig({
      [id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]: hexToNumber(value),
    });
  };

  input.addEventListener("input", commit);
  input.addEventListener("change", commit);

  return () => {
    input.removeEventListener("input", commit);
    input.removeEventListener("change", commit);
  };
}

function bindSelectInput(
  id: string,
  sanitize: (v: string) => string,
  scene: SceneAPI,
  updateStoredSettings: UpdateSettings,
): () => void {
  const input = document.querySelector<HTMLSelectElement>(`#${id}`);
  if (!input) return () => {};

  const onChange = () => {
    const value = sanitize(input.value);
    input.value = value;
    updateStoredSettings({ [id]: value });
    scene.setConfig({ [id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]: value });
  };

  input.addEventListener("change", onChange);

  return () => {
    input.removeEventListener("change", onChange);
  };
}

function bindSectionToggle(): () => void {
  const headers = document.querySelectorAll("[data-section-toggle]");
  const toggle = (e: Event) => {
    const section = (e.target as Element).closest(`.${SECTION_CLASS}`);
    const chevron = section?.querySelector("[data-section-chevron]");
    const controls = section?.querySelector(`.${SECTION_CONTROLS_CLASS}`);
    if (section && chevron && controls) {
      const isCollapsed = controls.classList.toggle("hidden");
      chevron.classList.toggle(SECTION_CHEVRON_CLOSED_CLASS, !isCollapsed);
    }
  };
  headers.forEach((header) => header.addEventListener("click", toggle));
  return () => {
    headers.forEach((header) => header.removeEventListener("click", toggle));
  };
}

export function createSidebar(
  scene: SceneAPI,
  updateStoredSettings: UpdateSettings,
  storedSettings: Record<string, number | string>,
): SidebarBindings {
  const sectionsHtml = renderAllSections(storedSettings);

  const sidebarHtml = `
    <div class="${HEADER_CLASS}">
      <span class="${TITLE_CLASS}">Pixi Eyes</span>
      <button id="${SIDEBAR_ID}-close" class="${CLOSE_BUTTON_CLASS}">×</button>
    </div>
    <div class="${METRICS_CLASS}">
      <div class="${METRIC_CLASS}">
        <div class="${METRIC_LABEL_CLASS}">FPS</div>
        <div id="${FPS_VALUE_ID}" class="${METRIC_VALUE_CLASS}">0</div>
      </div>
      <div class="${METRIC_CLASS}">
        <div class="${METRIC_LABEL_CLASS}">Visible</div>
        <div id="${VISIBLE_VALUE_ID}" class="${METRIC_VALUE_CLASS}">0</div>
      </div>
    </div>
    <div class="${CONTENT_CLASS}">${sectionsHtml}</div>
  `;

  const toggleBtn = document.createElement("button");
  toggleBtn.className = TOGGLE_BUTTON_CLASS;
  toggleBtn.textContent = "⚙️";
  toggleBtn.title = "Toggle settings (S)";

  const sidebar = document.createElement("aside");
  sidebar.className = `${SIDEBAR_CLASS} ${SIDEBAR_CLOSED_CLASS}`;
  sidebar.innerHTML = sidebarHtml;

  document.body.appendChild(toggleBtn);
  document.body.appendChild(sidebar);

  const unbinds: Array<() => void> = [];

  const SANITIZER_BY_ID: Record<string, (v: string) => string> = {
    "layout-shape": (v) => sanitizeLayoutShape(v, "circle"),
    "cross-type": (v) => sanitizeCrossType(v, "x"),
  };

  for (const control of CONTROL_DEFINITIONS) {
    const { id, type, min = 0, max = 100, fractionDigits } = control;

    if (type === "number") {
      unbinds.push(bindNumberInput(id, min, max, fractionDigits, scene, updateStoredSettings));
    }
    if (type === "color") {
      unbinds.push(bindColorInput(id, scene, updateStoredSettings));
    }
    if (type === "select") {
      const sanitize = SANITIZER_BY_ID[id] ?? ((v: string) => sanitizeFocusEase(v, "out-cubic"));
      unbinds.push(bindSelectInput(id, sanitize, scene, updateStoredSettings));
    }
  }

  unbinds.push(bindSectionToggle());

  const closeBtn = document.getElementById(`${SIDEBAR_ID}-close`);
  const toggle = () => {
    const isOpen = sidebar.classList.toggle(SIDEBAR_OPEN_CLASS);
    sidebar.classList.toggle(SIDEBAR_CLOSED_CLASS, !isOpen);
    const chevron = sidebar.querySelector("[data-section-chevron]");
    chevron?.classList.toggle(SECTION_CHEVRON_CLOSED_CLASS, !isOpen);
  };

  toggleBtn.addEventListener("click", toggle);
  closeBtn?.addEventListener("click", toggle);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      toggle();
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  return {
    destroy: () => {
      unbinds.forEach((unbind) => unbind());
      toggleBtn.remove();
      sidebar.remove();
      window.removeEventListener("keydown", handleKeyDown);
    },
    toggle,
    open: () => {
      sidebar.classList.remove(SIDEBAR_CLOSED_CLASS);
      sidebar.classList.add(SIDEBAR_OPEN_CLASS);
    },
    close: () => {
      sidebar.classList.remove(SIDEBAR_OPEN_CLASS);
      sidebar.classList.add(SIDEBAR_CLOSED_CLASS);
    },
  };
}
