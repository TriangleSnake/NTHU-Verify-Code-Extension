
// ===== 影像處理工具 =====

/*
async function loadReferenceDigits(threshold = 128) {
  const refs = {};

  for (let d = 0; d <= 9; d++) {
    const img = new Image();
    img.src = chrome.runtime.getURL(`reference/${d}.png`);
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;

    let arr = Array.from({ length: img.height }, () => Array(img.width).fill(0));

    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        arr[y][x] = avg < threshold ? 1 : 0; // 黑=1, 白=0
      }
    }

    refs[d.toString()] = arr;
  }

  // 轉成 JSON 字串，方便 copy-paste 到 referenceDigits.js
  console.log(JSON.stringify(refs));

  return refs;
}
*/


// A. RGB → 二值化 (黑=1, 白=0)
function rgb2bin(canvas, threshold = 128) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const w = canvas.width;
  const h = canvas.height;
  let bin = Array.from({ length: h }, () => new Array(w).fill(0));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      bin[y][x] = avg > threshold ? 0 : 1;
    }
  }
  return bin;
}

// B. Flood-fill 切割數字
function splitDigitsByFloodFill(bin) {
  const h = bin.length;
  const w = bin[0].length;
  const visited = Array.from({ length: h }, () => Array(w).fill(false));

  function floodFill(sx, sy) {
    let queue = [[sx, sy]];
    let pixels = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;

    while (queue.length > 0) {
      const [x, y] = queue.pop();
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (visited[y][x]) continue;
      if (bin[y][x] !== 1) continue;

      visited[y][x] = true;
      pixels.push([x, y]);

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      queue.push([x + 1, y]);
      queue.push([x - 1, y]);
      queue.push([x, y + 1]);
      queue.push([x, y - 1]);
    }

    if (pixels.length === 0) return null;

    const digitH = maxY - minY + 1;
    const digitW = maxX - minX + 1;
    let digitArray = Array.from({ length: digitH }, () => Array(digitW).fill(0));

    for (let [x, y] of pixels) {
      digitArray[y - minY][x - minX] = 1;
    }

    return { x: minX, array: digitArray };
  }

  let results = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!visited[y][x] && bin[y][x] === 1) {
        const digit = floodFill(x, y);
        if (digit) results.push(digit);
      }
    }
  }

  results.sort((a, b) => a.x - b.x);
  return results.map(r => r.array);
}

// C. 二值陣列 → Canvas
function bin2canvas(arr) {
  const h = arr.length;
  const w = arr[0].length;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });;

  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = arr[y][x] === 1 ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// D. 抽取像素點 (黑點)
function extractPixels(arr) {
  const pixels = [];
  for (let y = 0; y < arr.length; y++) {
    for (let x = 0; x < arr[0].length; x++) {
      if (arr[y][x] === 1) {
        pixels.push([x, y]);
      }
    }
  }
  return pixels;
}

// E. 計算傾斜角度（PCA）
function getSkewAngle(points) {
  const n = points.length;
  if (n === 0) return 0;

  // 1. 中心點
  const meanX = points.reduce((a, p) => a + p[0], 0) / n;
  const meanY = points.reduce((a, p) => a + p[1], 0) / n;

  // 2. 共變異矩陣
  let covXX = 0, covYY = 0, covXY = 0;
  for (let [x, y] of points) {
    const dx = x - meanX;
    const dy = y - meanY;
    covXX += dx * dx;
    covYY += dy * dy;
    covXY += dx * dy;
  }

  // 3. PCA 主軸角度
  let angle = 0.5 * Math.atan2(2 * covXY, covXX - covYY);

  // 4. 找最下面的點 (y 最大)
  const bottomPoint = points.reduce(
    (max, p) => (p[1] > max[1] ? p : max),
    points[0]
  );

  // 5. 把 bottomPoint 旋轉到 angle 下的座標
  const dx = bottomPoint[0] - meanX;
  const dy = bottomPoint[1] - meanY;
  const rotX = dx * Math.cos(-angle) - dy * Math.sin(-angle);
  //console.log(`dx: ${dx},dy: ${dy}, rotX:${rotX}`)
  // const rotY = dx * Math.sin(-angle) + dy * Math.cos(-angle); // 用不到

  // 6. 確保 bottomPoint 在左邊（rotX < 0）
  
  if (rotX > 0) {
    angle += Math.PI; // 翻轉 180°
  }
  

  // 7. 正規化到 [-90°, 90°]

  return angle; // radians
}



// F. 轉正 (自動擴展大小，避免切掉)
function rotateCanvasExpand(srcCanvas, angleRad) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;

  const cos = Math.abs(Math.cos(angleRad));
  const sin = Math.abs(Math.sin(angleRad));

  // 用 ceil 避免被切掉
  const newW = Math.ceil(w * cos + h * sin);
  const newH = Math.ceil(h * cos + w * sin);

  const rotated = document.createElement("canvas");
  rotated.width = newW;
  rotated.height = newH;
  const ctx = rotated.getContext("2d", { willReadFrequently: true });;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, newW, newH);

  ctx.translate(newW / 2, newH / 2);

  // 注意方向：canvas rotate 是順時針
  ctx.rotate(angleRad);

  ctx.drawImage(srcCanvas, -w / 2, -h / 2);

  return rotated;
}


// G. 統一大小 (resize 到 targetSize)
function resizeCanvas(srcCanvas, targetSize = 32) {
  const resized = document.createElement("canvas");
  resized.width = targetSize;
  resized.height = targetSize;
  const ctx = resized.getContext("2d", { willReadFrequently: true });;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, targetSize, targetSize);

  const scale = Math.min(
    targetSize / srcCanvas.width,
    targetSize / srcCanvas.height
  );

  const newW = srcCanvas.width * scale;
  const newH = srcCanvas.height * scale;
  const offsetX = (targetSize - newW) / 2;
  const offsetY = (targetSize - newH) / 2;

  ctx.drawImage(srcCanvas, offsetX, offsetY, newW, newH);

  return resized;
}

// H. XOR 差異計算
function xorDifference(arrA, arrB) {
  const h = Math.min(arrA.length, arrB.length);
  const w = Math.min(arrA[0].length, arrB[0].length);

  let diff = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (arrA[y][x] !== arrB[y][x]) diff++;
    }
  }
  return diff;
}

function canvasToArray(canvas, threshold = 128) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let arr = Array.from({ length: canvas.height }, () => Array(canvas.width).fill(0));

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      arr[y][x] = avg < threshold ? 1 : 0;
    }
  }

  return arr;
}

// I. 數字比對 (跟 referenceDigits)
function compareDigit(digitCanvas, referenceDigits=null) {
  if (referenceDigits == null) return "TODO"
  const ctx = digitCanvas.getContext("2d", { willReadFrequently: true });;
  const imgData = ctx.getImageData(0, 0, digitCanvas.width, digitCanvas.height).data;
  const pixels = [];
  for (let y = 0; y < digitCanvas.height; y++) {
    for (let x = 0; x < digitCanvas.width; x++) {
      const i = (y * digitCanvas.width + x) * 4;
      if (imgData[i] < 128) pixels.push([x, y]);
    }
  }

  const angle = getSkewAngle(pixels);
  const straight = rotateCanvasExpand(digitCanvas, -angle);
  const normalized = resizeCanvas(straight, 32);

  let bestDigit = null;
  let bestScore = Infinity;

  for (let d in referenceDigits) {
    const ref = resizeCanvas(referenceDigits[d], 32);
    const score = xorDifference(normalized, ref);
    if (score < bestScore) {
      bestScore = score;
      bestDigit = d;
    }
  }

  return bestDigit;
}

// J. 拼回去
function joinDigitsCanvas(digitCanvases, gap = 2) {
  const totalWidth = digitCanvases.reduce((sum, c) => sum + c.width, 0) + gap * (digitCanvases.length - 1);
  const maxHeight = Math.max(...digitCanvases.map(c => c.height));

  const canvas = document.createElement("canvas");
  canvas.width = totalWidth;
  canvas.height = maxHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });;

  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let offsetX = 0;
  for (let c of digitCanvases) {
    ctx.drawImage(c, offsetX, 0);
    offsetX += c.width + gap;
  }

  return canvas;
}
