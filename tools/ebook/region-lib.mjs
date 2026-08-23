// 지면에서 기사가 차지한 자리 찾기 — 평택시민신문처럼 '지금 읽는 기사'를 지면 위에 짚어주기 위한 것.
//
//   한 지면에 기사가 여섯~여덟 개씩 실린다. 스캔을 펼쳐도 어느 것이 지금 읽는 기사인지 알 수 없다.
//   그래서 지면을 다시 글자인식(Vision)해 **문단 상자**를 얻고, 그 문단의 글이 이 기사 본문에
//   들어 있으면 그 상자를 이 기사 자리로 본다.
//
//   ⚠ 통짜 사각형 하나로 묶지 않는다. 기사가 두세 단에 걸쳐 있으면 그 사이의 남의 기사까지
//     덮어버린다. **문단마다 따로** 칠한다.
//
//   ⚠ 글자인식 결과와 저장된 본문은 **글자가 조금 다르다**(디지털화 때 띄어쓰기·오탈자를 고쳤다).
//     그래서 정확히 같은지 보지 않고, 짧은 토막이 얼마나 겹치는지로 판단한다.

/** 대조용 정규화 — 공백·문장부호를 걷어내 두 글을 같은 잣대로 맞춘다. */
export const norm = (s) => String(s ?? "").replace(/[^가-힣0-9a-zA-Z]/g, "");

/** 꼭짓점 넷 → 0~1 백분율 사각형. 화면이 어떤 크기로 그리든 그대로 얹힌다. */
export function toBox(vertices, pageW, pageH) {
  if (!Array.isArray(vertices) || !vertices.length || !pageW || !pageH) return null;
  const xs = vertices.map((v) => Number(v?.x) || 0);
  const ys = vertices.map((v) => Number(v?.y) || 0);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  if (w <= 0 || h <= 0) return null;
  const r = (n) => Math.round(n * 10000) / 10000;   // 소수 넷째 자리면 충분하다(4천 픽셀 기준 0.4픽셀)
  return { x: r(x / pageW), y: r(y / pageH), w: r(w / pageW), h: r(h / pageH) };
}

/** Vision 응답 → 문단 목록(글 + 상자). 페이지 하나만 본다(지면 이미지는 한 장이다). */
export function visionParagraphs(fullTextAnnotation) {
  const page = fullTextAnnotation?.pages?.[0];
  if (!page) return [];
  const { width, height } = page;
  const out = [];
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      const text = (para.words ?? [])
        .map((w) => (w.symbols ?? []).map((s) => s.text ?? "").join(""))
        .join(" ");
      const box = toBox(para.boundingBox?.vertices, width, height);
      if (box && norm(text)) out.push({ text, box });
    }
  }
  return out;
}

/**
 * macOS 내장 OCR(`ocr_vision`) 출력 → 문단 목록(순수).
 *   `[{t,x,y,w,h}]`를 이미 0~1로 내주므로 환산이 필요 없다.
 *   ⚠ 이쪽은 **줄 단위**다(문단이 아니라). 오히려 좋다 — 칠하는 모양이 지면 글줄과 딱 맞는다.
 */
export function ocrLines(rows) {
  const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
  return (Array.isArray(rows) ? rows : [])
    .filter((l) => norm(l?.t) && Number(l?.w) > 0 && Number(l?.h) > 0)
    .map((l) => ({
      text: String(l.t),
      // x가 음수로 아주 조금 나오는 일이 있다(정규화 오차) — 0 아래로는 내리지 않는다.
      box: { x: Math.max(0, r4(l.x)), y: Math.max(0, r4(l.y)), w: r4(l.w), h: r4(l.h) },
    }));
}

/**
 * 문단이 이 기사의 것인가(순수).
 *   짧은 토막(win 글자)을 훑어 본문에 있는 비율을 본다 — 글자가 조금 달라도 견딘다.
 *   너무 짧은 문단은 여러 기사에 흔히 나오므로 아예 보지 않는다.
 */
export function paragraphScore(paraText, bodyNorm, { win = 12 } = {}) {
  const p = norm(paraText);
  if (p.length < win) return 0;
  let hit = 0, tot = 0;
  for (let i = 0; i + win <= p.length; i += Math.max(1, Math.floor(win / 2))) {
    tot++;
    if (bodyNorm.includes(p.slice(i, i + win))) hit++;
  }
  return tot ? hit / tot : 0;
}

/**
 * 지면 문단들 → 이 기사가 차지한 사각형들.
 *   @returns {{boxes: Array, matched: number}} matched = 본문 글자 중 찾아낸 비율(0~1)
 */
export function articleRegion(paragraphs, { title = "", body = "" }, opts = {}) {
  const { win = 10, minScore = 0.5 } = opts;
  const bodyNorm = norm(`${title} ${body}`);
  if (bodyNorm.length < win) return { boxes: [], matched: 0 };

  const boxes = [];
  let covered = 0;
  for (const p of paragraphs) {
    if (paragraphScore(p.text, bodyNorm, { win }) < minScore) continue;
    boxes.push(p.box);
    covered += norm(p.text).length;
  }
  return { boxes, matched: Math.min(1, Math.round((covered / bodyNorm.length) * 100) / 100) };
}

/**
 * 한 지면의 기사들을 한꺼번에 배정한다.
 *   ⚠ 한 문단이 여러 기사에 걸리면 **가장 잘 맞는 기사**에만 준다 — 안 그러면 이웃 기사끼리
 *     같은 자리를 서로 칠해 지면이 온통 붉어진다.
 */
// 기본값은 실측으로 정했다(1997-12-26 1면: win=10·0.5에서 본문 96% 매칭, win=12로 올리면 43%로 떨어짐).
export function assignPage(paragraphs, articles, opts = {}) {
  const { win = 10, minScore = 0.5 } = opts;
  const bodies = articles.map((a) => norm(`${a.title ?? ""} ${a.body ?? ""}`));
  const picked = articles.map(() => []);
  const covered = articles.map(() => 0);

  for (const p of paragraphs) {
    let bestI = -1, bestS = minScore;
    for (let i = 0; i < articles.length; i++) {
      const s = paragraphScore(p.text, bodies[i], { win });
      if (s > bestS) { bestS = s; bestI = i; }
    }
    if (bestI < 0) continue;
    picked[bestI].push(p.box);
    covered[bestI] += norm(p.text).length;
  }
  return articles.map((a, i) => ({
    idxno: a.idxno,
    boxes: picked[i],
    matched: bodies[i].length ? Math.min(1, Math.round((covered[i] / bodies[i].length) * 100) / 100) : 0,
  }));
}
