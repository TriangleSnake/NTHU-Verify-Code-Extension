// 取得圖片（保證載入完成）
let results = []; // 供 debug 即時顯示用（最新一批）
(function () {
  const img = document.querySelector('img[src^="auth_img.php"]');
  if (!img) return;

  if (img.complete) {
    start(img);
  } else {
    img.addEventListener('load', () => start(img), { once: true });
  }
})();



async function start(img) {
  // 先跑一次
  await processImage(img, referenceDigits);

  // 監聽 storage，即時切換 Debug 視覺化
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.debugMode) {
      const isOn = !!changes.debugMode.newValue;

      if (isOn) {
        if (results && results.length > 0) {
          showVisualization(results); // 立刻顯示
        }
      } else {
        const oldViz = document.getElementById("captcha-visualize");
        if (oldViz) oldViz.remove();   // 立刻清除
      }
    }
  });
}

async function processImage(img, referenceDigits) {
  // 每次重跑先清空 results
  results = [];

  // 1. 畫到 canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  // 2. 二值化
  const bin = rgb2bin(canvas, 150);

  // 3. 切割數字（顏色容忍度 90）
  const digitArrays = splitDigitsByFloodFill(bin, canvas, 90);

  let resultText = "";

  // 4. OCR (Compare with reference)
  for (let i = 0; i < digitArrays.length; i++) {
    const digitCanvas = bin2canvas(digitArrays[i]);

    // 取像素點
    const pixels = extractPixels(digitArrays[i]);

    // Deskew
    const angle = getSkewAngle(pixels);
    const straight = rotateCanvasExpand(digitCanvas, -angle);

    // Resize
    const normalized = resizeCanvas(straight, 32);

    // 比對
    let bestDigit = null;
    let bestScore = Infinity;

    const scores = {};   // 純數值（xorDifference）
    const visuals = {};  // 疊圖 canvas
    const rotated = rotateCanvasExpand(normalized, -Math.PI / 2); // -90°

    const digitArray = canvasToArray(normalized); // 用來 disambiguate 及數值比對

    for (const d in referenceDigits) {
      // 參考圖：一樣旋轉 -90° 來做可視化疊圖（只是視覺化，score 用 array 算）
      const refCanvas = rotateCanvasExpand(bin2canvas(referenceDigits[d]), -Math.PI / 2);

      // 分數：用二維陣列 XOR 差異
      const score = xorDifference(digitArray, referenceDigits[d]);
      scores[d] = score;

      // 疊圖（只回傳 canvas）
      visuals[d] = xorCanvas(rotated, refCanvas);

      if (score < bestScore) {
        bestScore = score;

        // d 是字串，disambiguate 需要數字的話轉一下
        const dNum = Number(d);
        if ([0, 9, 5, 6, 1, 7].includes(dNum)) {
          bestDigit = disambiguate(dNum, digitArray).toString();
        } else {
          bestDigit = d; // 直接用字串
        }
      }
    }

    resultText += bestDigit;

    // 收集這一位數字的可視化/分數
    results.push({
      i,
      canvas: rotated,    // 標準化 + 旋轉後的 digit 畫面
      visuals,            // 每個 0~9 疊圖 canvas
      scores              // 每個 0~9 的 xorDifference 數值
    });
  }

  // 自動填入
  const input = document.getElementsByName("passwd2")[0];
  if (input) input.value = resultText;

  console.log("完整結果:", resultText);

  // 如果現在 Debug Mode 開著，立刻顯示
  const debug = await getDebugMode();
  if (debug && results.length > 0) {
    showVisualization(results);
  }
}

// 讀取 Debug Mode
function getDebugMode() {
  return new Promise(resolve => {
    try {
      chrome.storage.sync.get({ debugMode: false }, (res) => {
        resolve(!!res.debugMode);
      });
    } catch (e) {
      resolve(false);
    }
  });
}
