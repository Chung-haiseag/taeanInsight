// macOS 내장 Vision OCR (VNRecognizeTextRequest) — 로컬·무료·한글 지원, 해상도 제한 없음
// 사용: ocr_vision <image.png>  → stdout에 인식 라인 JSON 배열 [{t,x,y,w,h}] (y=상단기준 0~1)
import Foundation
import Vision
import CoreGraphics
import ImageIO

func loadCG(_ path: String) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

let args = CommandLine.arguments
guard args.count >= 2, let cg = loadCG(args[1]) else {
    FileHandle.standardError.write("usage: ocr_vision <image> (또는 이미지 로드 실패)\n".data(using: .utf8)!)
    exit(1)
}

let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
let env = ProcessInfo.processInfo.environment
req.usesLanguageCorrection = (env["OCR_CORRECTION"] ?? "1") != "0"
// 한글 + 한자(번체/간체) + 영문 — 1990~2000년대 신문의 한자 혼용 대응. OCR_LANGS로 조정 가능.
let want = (env["OCR_LANGS"] ?? "ko-KR,zh-Hant,zh-Hans,en-US").split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
req.recognitionLanguages = want

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do { try handler.perform([req]) } catch {
    FileHandle.standardError.write("OCR 실패: \(error)\n".data(using: .utf8)!)
    exit(1)
}

struct Line: Codable { let t: String; let x: Double; let y: Double; let w: Double; let h: Double }
var out: [Line] = []
for obs in (req.results ?? []) {
    guard let c = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox  // 정규화, 원점 좌하단
    // y를 상단 기준으로 변환
    out.append(Line(t: c.string, x: b.minX, y: 1 - b.maxY, w: b.width, h: b.height))
}
let data = try JSONEncoder().encode(out)
FileHandle.standardOutput.write(data)
