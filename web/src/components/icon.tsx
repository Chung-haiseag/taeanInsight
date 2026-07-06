// 통일 라인 아이콘 — Phosphor(리디자인 스킬 권장, Lucide/Feather AI-기본 회피).
// 시맨틱 이름 → Phosphor 컴포넌트. currentColor 상속, 기본 1.1em(텍스트 인라인 매칭), 장식용 aria-hidden.
// 날씨·해양·관광 데이터 글리프와 화살표(→←)는 이모지/텍스트 유지 — 여기서 다루지 않는다.

import type { ComponentType } from "react";
import {
  Bell, BellSlash, MagnifyingGlass, Lightbulb, CurrencyKrw, Coins, MagicWand, Sparkle,
  PencilSimple, NotePencil, Megaphone, Storefront, Newspaper, FileText, ClipboardText,
  DownloadSimple, BookOpen, Books, Play, Headphones, SpeakerHigh, Microphone, CalendarBlank,
  Compass, MapPin, Lock, User, Crown, ChartBar, LinkSimple, EnvelopeSimple, ChatCircle,
  Paperclip, Image as ImageIcon, ArrowsClockwise, Printer, VideoCamera, Broadcast, Confetti,
  ArrowsOut, Wrench, Eye, Star,
} from "@phosphor-icons/react/dist/ssr";

type PhosphorProps = { size?: number | string; weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone"; className?: string; color?: string };

const MAP: Record<string, ComponentType<PhosphorProps>> = {
  bell: Bell, "bell-off": BellSlash, search: MagnifyingGlass, idea: Lightbulb,
  won: CurrencyKrw, coins: Coins, wand: MagicWand, sparkle: Sparkle,
  pen: PencilSimple, write: NotePencil, megaphone: Megaphone, store: Storefront,
  news: Newspaper, doc: FileText, clipboard: ClipboardText, download: DownloadSimple,
  book: BookOpen, books: Books, play: Play, headphones: Headphones, speaker: SpeakerHigh,
  mic: Microphone, calendar: CalendarBlank, compass: Compass, pin: MapPin, lock: Lock,
  user: User, crown: Crown, chart: ChartBar, link: LinkSimple, mail: EnvelopeSimple,
  chat: ChatCircle, clip: Paperclip, image: ImageIcon, refresh: ArrowsClockwise,
  print: Printer, camera: VideoCamera, signal: Broadcast, party: Confetti,
  expand: ArrowsOut, wrench: Wrench, eye: Eye, star: Star,
};

export type IconName = keyof typeof MAP;

export function Icon({
  name, size = "0.9em", weight = "regular", className, label,
}: {
  name: IconName;
  size?: number | string;
  weight?: PhosphorProps["weight"];
  className?: string;
  label?: string; // 있으면 스크린리더에 의미 전달, 없으면 장식(aria-hidden)
}) {
  const C = MAP[name];
  if (!C) return null;
  return (
    <span className={`inline-flex shrink-0 items-center ${className ?? ""}`} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label}>
      <C size={size} weight={weight} />
    </span>
  );
}
