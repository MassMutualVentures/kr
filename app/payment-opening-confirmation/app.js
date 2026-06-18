const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzr3MIfpM1BIJG3e4ZaJZSG8A3s9C34i2XNZEZYNXoMpSHfDYCihnXjOrjYYKQXnJMOlg/exec";

const form = document.querySelector("#applicationForm");
const formSection = document.querySelector("#formSection");
const formMessage = document.querySelector("#formMessage");
const submitButton = document.querySelector("#submitButton");
const successPanel = document.querySelector("#successPanel");
const newApplication = document.querySelector("#newApplication");
const confirmArea = document.querySelector(".confirm-area");
const fields = Array.from(form.querySelectorAll("input, select, button"));
const steps = Array.from(document.querySelectorAll(".step"));
const sectionProgress = document.querySelector("#sectionProgress");
const sectionBlocks = Array.from(document.querySelectorAll("[data-read-section]"));
const SECTION_READING_SECONDS = 8;
const sectionState = new Map();
const visibleSectionRatios = new Map();
let activeSectionIndex = 0;

const fieldRules = {
  fullName: (value) => value.trim().length >= 2 ? "" : "이름을 두 글자 이상 입력해 주세요.",
  phoneNumber: (value) => {
    const digits = value.replace(/[^\d]/g, "");
    if (!digits) return "휴대전화번호를 입력해 주세요.";
    if (digits.length < 7 || digits.length > 15) return "올바른 휴대전화번호를 입력해 주세요.";
    return "";
  },
  accuracy: () => document.querySelector("#accuracy").checked ? "" : "신청 정보가 사실과 다름없음을 확인해 주세요."
};

function setStep(index) {
  steps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === index);
  });
}

function setFormEnabled(enabled) {
  fields.forEach((field) => {
    if (field.id !== "submitButton") {
      field.disabled = !enabled;
    }
  });
  submitButton.disabled = !enabled;
  formSection.classList.toggle("is-locked", !enabled);
  setStep(enabled ? 1 : 0);
}

function setMessage(text, type = "") {
  formMessage.textContent = text;
  formMessage.className = `form-message${type ? ` is-${type}` : ""}`;
}

function setError(fieldName, message) {
  const error = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (error) error.textContent = message;
}

function getSectionSeconds(block) {
  const seconds = Number(block.dataset.readSeconds || SECTION_READING_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : SECTION_READING_SECONDS;
}

function getCompletedSectionCount() {
  return Array.from(sectionState.values()).filter((state) => state.complete).length;
}

function getSectionButton(block) {
  return block.querySelector("[data-read-confirm]");
}

function setConfirmButton(button, text, checked = false) {
  if (!button) return;

  button.classList.toggle("is-checked", checked);
  button.innerHTML = `
    <span class="confirm-check" aria-hidden="true">${checked ? "✓" : ""}</span>
    <span>${text}</span>
  `;
}

function setSectionStatus(block, html, statusClass = "") {
  const status = block.querySelector("[data-read-status]");
  if (!status) return;

  status.classList.remove("is-active", "is-complete", "is-ready", "is-locked");
  if (statusClass) status.classList.add(statusClass);
  status.innerHTML = html;
}

function pauseSectionTimer(block) {
  const state = sectionState.get(block);
  if (!state || !state.timerId) return;

  window.clearInterval(state.timerId);
  state.timerId = null;
  block.classList.remove("is-reading");

  const status = block.querySelector("[data-read-status]");
  if (status) status.classList.remove("is-active");
}

function renderSection(block, index) {
  const state = sectionState.get(block);
  const button = getSectionButton(block);
  if (!state) return;

  block.classList.toggle("is-active-section", index === activeSectionIndex && !state.complete);
  block.classList.toggle("is-complete", state.complete);

  if (state.complete) {
    setSectionStatus(block, "이 항목은 확인이 완료되었습니다", "is-complete");
    if (button) {
      button.disabled = true;
      setConfirmButton(button, "확인 완료", true);
    }
    return;
  }

  if (index < activeSectionIndex) {
    setSectionStatus(block, "이 항목은 확인이 완료되었습니다", "is-complete");
    if (button) {
      button.disabled = true;
      setConfirmButton(button, "확인 완료", true);
    }
    return;
  }

  if (index > activeSectionIndex) {
    pauseSectionTimer(block);
    setSectionStatus(block, "이전 항목 확인 후 진행할 수 있습니다", "is-locked");
    if (button) {
      button.disabled = true;
      setConfirmButton(button, "이전 항목을 먼저 확인해 주세요");
    }
    return;
  }

  if (state.ready) {
    setSectionStatus(block, "읽기 시간이 완료되었습니다. 아래 확인 체크박스를 눌러 주세요", "is-ready");
    if (button) {
      button.disabled = false;
      setConfirmButton(button, "클릭하여 확인: 이 항목을 모두 읽었습니다");
    }
    return;
  }

  const statusClass = state.timerId ? "is-active" : "";
  setSectionStatus(
    block,
    `이 항목 확인까지 <strong data-read-count>${state.remaining}</strong>초`,
    statusClass
  );
  if (button) {
    button.disabled = true;
    setConfirmButton(button, "읽기 시간이 끝나면 확인할 수 있습니다");
  }
}

function renderAllSections() {
  sectionBlocks.forEach((block, index) => renderSection(block, index));
}

function updateSectionProgress() {
  const confirmedCount = getCompletedSectionCount();
  const totalCount = sectionBlocks.length;
  const isComplete = totalCount > 0 && confirmedCount === totalCount;

  if (sectionProgress) {
    sectionProgress.classList.toggle("is-ready", isComplete);
    sectionProgress.textContent = isComplete
      ? `${totalCount} / ${totalCount} 확인 완료. 신청 정보 입력란이 열렸습니다.`
      : `확인 진행률: ${confirmedCount} / ${totalCount} 완료`;
  }

  if (isComplete) {
    setFormEnabled(true);
    setMessage("확인이 완료되었습니다. 신청 정보를 입력해 주세요.", "success");
  }
}

function finishSectionTimer(block) {
  const state = sectionState.get(block);
  if (!state || state.ready || state.complete) return;

  pauseSectionTimer(block);
  state.remaining = 0;
  state.ready = true;
  renderSection(block, sectionBlocks.indexOf(block));
}

function startActiveSectionTimer() {
  const block = sectionBlocks[activeSectionIndex];
  const state = sectionState.get(block);
  if (!block || !state || state.complete || state.ready || state.timerId) return;

  const isVisible = (visibleSectionRatios.get(block) || 0) > 0.18;
  if (!isVisible) return;

  block.classList.add("is-reading");
  renderSection(block, activeSectionIndex);

  state.timerId = window.setInterval(() => {
    state.remaining -= 1;

    if (state.remaining <= 0) {
      finishSectionTimer(block);
      return;
    }

    renderSection(block, activeSectionIndex);
  }, 1000);
}

function refreshActiveTimer() {
  sectionBlocks.forEach((block, index) => {
    if (index !== activeSectionIndex) pauseSectionTimer(block);
  });
  startActiveSectionTimer();
}

function confirmSection(block) {
  const index = sectionBlocks.indexOf(block);
  const state = sectionState.get(block);
  if (index !== activeSectionIndex || !state?.ready || state.complete) return;

  state.complete = true;
  pauseSectionTimer(block);
  activeSectionIndex += 1;
  updateSectionProgress();
  renderAllSections();

  const nextBlock = sectionBlocks[activeSectionIndex];
  if (nextBlock) {
    nextBlock.scrollIntoView({ behavior: "smooth", block: "center" });
    visibleSectionRatios.set(nextBlock, 1);
    refreshActiveTimer();
  }
}

function initSectionState() {
  activeSectionIndex = 0;
  visibleSectionRatios.clear();

  sectionBlocks.forEach((block) => {
    const total = getSectionSeconds(block);
    const oldState = sectionState.get(block);
    if (oldState?.timerId) window.clearInterval(oldState.timerId);

    sectionState.set(block, {
      total,
      remaining: total,
      complete: false,
      ready: false,
      timerId: null
    });
    block.classList.remove("is-reading", "is-complete", "is-active-section");
  });

  setFormEnabled(false);
  updateSectionProgress();
  renderAllSections();
}

function setupSectionObservers() {
  if (!("IntersectionObserver" in window)) {
    visibleSectionRatios.set(sectionBlocks[activeSectionIndex], 1);
    refreshActiveTimer();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        visibleSectionRatios.set(entry.target, entry.intersectionRatio);
      } else {
        visibleSectionRatios.delete(entry.target);
      }
    });
    refreshActiveTimer();
  }, {
    rootMargin: "-12% 0px -18% 0px",
    threshold: [0, 0.18, 0.4, 0.7]
  });

  sectionBlocks.forEach((block) => observer.observe(block));
}

function validateForm() {
  let isValid = true;
  Object.entries(fieldRules).forEach(([fieldName, rule]) => {
    const field = form.elements[fieldName];
    const message = rule(field?.value || "");
    setError(fieldName, message);
    if (message) isValid = false;
  });
  return isValid;
}

function getPayload() {
  const formData = new FormData(form);
  const phoneDigits = String(formData.get("phoneNumber") || "").replace(/[^\d]/g, "");

  return {
    submittedAt: new Date().toISOString(),
    fullName: String(formData.get("fullName") || "").trim(),
    countryCode: String(formData.get("countryCode") || "+82"),
    phoneNumber: phoneDigits,
    source: window.location.href
  };
}

async function submitToGoogleSheet(payload) {
  if (!GOOGLE_SCRIPT_URL) {
    return;
  }

  const response = await fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });

  return response;
}

function showSuccess() {
  setStep(2);
  formSection.hidden = true;
  confirmArea.hidden = true;
  successPanel.hidden = false;
  successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
}

sectionBlocks.forEach((block) => {
  const button = getSectionButton(block);
  if (button) {
    button.addEventListener("click", () => confirmSection(block));
  }
});

form.addEventListener("input", (event) => {
  const fieldName = event.target.name;
  if (fieldRules[fieldName]) {
    setError(fieldName, fieldRules[fieldName](event.target.value));
  }
});

form.addEventListener("change", (event) => {
  const fieldName = event.target.name;
  if (fieldRules[fieldName]) {
    setError(fieldName, fieldRules[fieldName](event.target.value));
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  if (!validateForm()) {
    setMessage("입력 내용을 다시 확인해 주세요.", "error");
    return;
  }

  const payload = getPayload();
  submitButton.disabled = true;
  submitButton.textContent = "접수 완료";
  setMessage("신청이 접수되었습니다.", "success");
  showSuccess();

  submitToGoogleSheet(payload).catch((error) => {
    console.warn("Google Sheet submission failed:", error);
  });
});

newApplication.addEventListener("click", () => {
  form.reset();
  successPanel.hidden = true;
  formSection.hidden = false;
  confirmArea.hidden = false;
  submitButton.textContent = "신청하기";
  Object.keys(fieldRules).forEach((fieldName) => setError(fieldName, ""));
  setMessage("");
  initSectionState();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

initSectionState();
setupSectionObservers();
