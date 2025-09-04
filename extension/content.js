const img = document.querySelector('img[src^="auth_img.php"]');
processImage(img, referenceDigits);

function processImage(img, referenceDigits) {
  // 1. 畫到 canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  // 2. 二值化
  const bin = rgb2bin(canvas, 150);

  // 3. 切割數字
  const digitArrays = splitDigitsByFloodFill(bin);

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
    for (let d in referenceDigits) {
      const ref = referenceDigits[d];
      const digitArray = canvasToArray(normalized);
      const score = xorDifference(digitArray, ref);
      if (score < bestScore) {
        bestScore = score;
        bestDigit = d;
      }
    }

    resultText += bestDigit;

    // Debug: 顯示
    const label = document.createElement("div");
    label.textContent = `Digit ${i} → ${bestDigit}`;
    document.body.appendChild(label);
    document.body.appendChild(normalized);
  }

  console.log("完整結果:", resultText);
  document.getElementsByName("passwd2")[0].value = resultText
}