// WAV 버퍼 → MP3 버퍼(ffmpeg, 128kbps mono). 오디오 나레이션 용량 절감용(WAV의 ~1/10).
//   ffmpeg 필요(맥: brew install ffmpeg / VPS: apt install ffmpeg).
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function wavToMp3(wavBuf, bitrate = "128k") {
  const stamp = `${process.pid}-${Math.random().toString(36).slice(2)}`;
  const inTmp = join(tmpdir(), `a-${stamp}.wav`);
  const outTmp = join(tmpdir(), `a-${stamp}.mp3`);
  writeFileSync(inTmp, wavBuf);
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", inTmp, "-b:a", bitrate, "-ac", "1", outTmp]);
    return readFileSync(outTmp);
  } finally {
    rmSync(inTmp, { force: true });
    rmSync(outTmp, { force: true });
  }
}
