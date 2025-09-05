
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
function splitDigitsByFloodFill(bin, canvas, tolerance = 30, minPixels = 20) {
  const h = bin.length;
  const w = bin[0].length;

  const visited = Array.from({ length: h }, () => Array(w).fill(false));

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  function getColor(x, y) {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  }

  function colorsSimilar(c1, c2, tol = 30) {
    const dr = c1[0] - c2[0];
    const dg = c1[1] - c2[1];
    const db = c1[2] - c2[2];
    return (dr * dr + dg * dg + db * db) <= tol * tol;
  }

  function floodFill(sx, sy) {
    const baseColor = getColor(sx, sy);
    let queue = [[sx, sy]];
    let pixels = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;

    while (queue.length > 0) {
      const [x, y] = queue.pop();
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (visited[y][x]) continue;
      if (bin[y][x] !== 1) continue; // 必須是數字區域

      const color = getColor(x, y);
      if (!colorsSimilar(color, baseColor, tolerance)) continue; // 必須顏色相似

      visited[y][x] = true;
      pixels.push([x, y]);

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      queue.push([x + 1, y]);
      queue.push([x - 1, y]);
      queue.push([x, y + 1]);
      queue.push([x, y - 1]);
    }

    // 🚨 過濾掉太小的雜點
    if (pixels.length < minPixels) return null;

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

  // 按 X 排序，保持數字順序
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
  return 100*diff/(h*w);
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

function xorCanvas(canvasA, canvasB) {
  const w = Math.min(canvasA.width, canvasB.width);
  const h = Math.min(canvasA.height, canvasB.height);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");

  const dataA = canvasA.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, w, h).data;
  const dataB = canvasB.getContext("2d", { willReadFrequently: true })
    .getImageData(0, 0, w, h).data;

  const imgData = ctx.createImageData(w, h);
  const outData = imgData.data;

  for (let i = 0; i < dataA.length; i += 4) {
    const a = dataA[i] < 128 ? 1 : 0;
    const b = dataB[i] < 128 ? 1 : 0;
    if (a === 1 && b === 1) {
      // 重疊 → 紅
      outData[i] = 255; outData[i + 1] = 0; outData[i + 2] = 0; outData[i + 3] = 255;
    } else {
      // 其他 → 白
      outData[i] = 255; outData[i + 1] = 255; outData[i + 2] = 255; outData[i + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return out;
}





function showVisualization(results) {
  const captchaInput = document.querySelector('div[align="left"][style*="border-style: solid"]');
  if (!captchaInput) return;

  // 清掉舊的
  const oldViz = document.getElementById("captcha-visualize");
  if (oldViz) oldViz.remove();

  let viz = document.createElement("div");
  viz.id = "captcha-visualize";
  viz.style.marginTop = "10px";
  viz.style.padding = "10px";
  viz.style.border = "1px solid #ccc";
  viz.style.background = "#fafafa";
  viz.style.fontFamily = "monospace";

  results.forEach(r => {
    const row = document.createElement("div");
    row.style.marginBottom = "16px";

    const title = document.createElement("div");
    title.textContent = `Digit ${r.i}`;
    row.appendChild(title);
    row.appendChild(r.canvas);

    // 找最佳匹配
    let bestDigit = null;
    let bestScore = -Infinity;
    for (let d in r.scores) {
      const sim = 100 - r.scores[d]; // 相似度
      if (sim > bestScore) {
        bestScore = sim;
        bestDigit = d;
      }
    }

    // 顯示 XOR 疊圖
    let grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(5, auto)";
    grid.style.gap = "8px";

    for (let d = 0; d <= 9; d++) {
      const cell = document.createElement("div");
      cell.style.textAlign = "center";

      const diffCanvas = r.visuals[d];
      diffCanvas.style.border = (d == bestDigit)
        ? "2px solid green"
        : "1px solid #ccc";

      const label = document.createElement("div");
      const sim = 100 - r.scores[d]; // 相似度
      label.textContent = `${d}: ${sim.toFixed(1)}%`;
      if (d == bestDigit) {
        label.style.color = "green";
        label.style.fontWeight = "bold";
      }

      cell.appendChild(diffCanvas);
      cell.appendChild(label);
      grid.appendChild(cell);
    }

    row.appendChild(grid);
    viz.appendChild(row);
  });

  // 插到驗證碼輸入框的最後面
  captchaInput.insertAdjacentElement("afterend", viz);
}




function disambiguate(num, digitArray) {
  const h = digitArray.length;
  const w = digitArray[0].length;

  // 0 vs 9
  if (num === 0 || num === 9) {
    const x = Math.floor(w / 3); // 從左邊數過來 1/3 的直線

    let groups = 0;
    let inBlack = false;

    for (let y = 0; y < h; y++) {
      if (digitArray[y][x] === 1) {
        if (!inBlack) {
          groups++;
          inBlack = true;
        }
      } else {
        inBlack = false;
      }
    }

    return groups === 1 ? 9 : 0;
  }

  // 2 vs 3
  if (num === 2 || num === 3) {
    const midX = Math.floor(w / 2);

    let sumY = 0;
    let count = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < midX; x++) { // 只看左半邊
        if (digitArray[y][x] === 1) {
          sumY += y;
          count++;
        }
      }
    }

    if (count === 0) return num; // fallback

    const centroidY = sumY / count;
    const centerY = h / 2;

    // 偏上 → 2，偏下 → 3
    return centroidY < centerY ? 2 : 3;
  }
  if (num==1||num==7){
    const h = digitArray.length;
    const w = digitArray[0].length;

    let minY = h; // 右半部最上方的黑像素

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
        if (digitArray[y][x] === 1) {
            if (y < minY) minY = y;
        }
        }
    }

    if (minY === h) return 1; // fallback 沒找到 → 當成 1

    // 如果最上方黑點距離頂邊很近 → 7
    const threshold = Math.floor(h * 0.2); // 10% 高度
    return minY <= threshold ? 7 : 1; 
    }
    console.log("Error")
  return num;
}
