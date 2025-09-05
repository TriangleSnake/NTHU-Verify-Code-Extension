// popup.js
const toggle = document.getElementById('toggle');
const statusEl = document.getElementById('status');

function render(isOn) {
  if (isOn) {
    toggle.classList.add('on');
    statusEl.textContent = '目前狀態：ON';
    statusEl.classList.add('on');
    statusEl.classList.remove('off');
  } else {
    toggle.classList.remove('on');
    statusEl.textContent = '目前狀態：OFF';
    statusEl.classList.remove('on');
    statusEl.classList.add('off');
  }
}

async function getDebugMode() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ debugMode: false }, (res) => {
      resolve(!!res.debugMode);
    });
  });
}

async function setDebugMode(value) {
  return new Promise(resolve => {
    chrome.storage.sync.set({ debugMode: !!value }, resolve);
  });
}

(async () => {
  // 初始化狀態
  const isOn = await getDebugMode();
  render(isOn);
  // 點擊切換
  toggle.addEventListener('click', async () => {
    const current = await getDebugMode();
    const next = !current;
    await setDebugMode(next);
    render(next);
  });
})();
