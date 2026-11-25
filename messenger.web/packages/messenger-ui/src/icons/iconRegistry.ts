import {
  ArrowBendUpLeft,
  ArrowLeft,
  ArrowFatRight,
  At,
  BookmarkSimple,
  ChatCircleDots,
  CaretLeft,
  CaretRight,
  Check,
  Checks,
  Clock,
  Copy,
  DotsThree,
  DotsThreeVertical,
  DownloadSimple,
  ExclamationMark,
  File,
  GearSix,
  Hash,
  List,
  MagnifyingGlass,
  Microphone,
  Moon,
  Paperclip,
  PaperPlaneRight,
  Pause,
  PencilSimple,
  Play,
  PushPin,
  Quotes,
  Scissors,
  SlidersHorizontal,
  SignOut,
  Smiley,
  Stop,
  Sun,
  Trash,
  Users,
  WarningCircle,
  Waveform,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import type { AppIconComponent } from "./types.js";
import { AiSecretaryIcon } from "./custom/AiSecretaryIcon.js";
import { DecisionIcon } from "./custom/DecisionIcon.js";
import { ExternalChatIcon } from "./custom/ExternalChatIcon.js";
import { IncidentIcon } from "./custom/IncidentIcon.js";
import { ItsmLinkIcon } from "./custom/ItsmLinkIcon.js";
import { LogoIcon } from "./custom/LogoIcon.js";

/**
 * Explicit DIOS icon registry.
 * Swap a single entry to replace Phosphor with a custom glyph without touching call sites.
 */
export const icons = {
  // Brand / custom
  logo: LogoIcon as AppIconComponent,
  incident: IncidentIcon as AppIconComponent,
  "ai-secretary": AiSecretaryIcon as AppIconComponent,
  "external-chat": ExternalChatIcon as AppIconComponent,
  "itsm-link": ItsmLinkIcon as AppIconComponent,
  decision: DecisionIcon as AppIconComponent,

  // Navigation / chrome
  chat: ChatCircleDots,
  people: Users,
  bookmark: BookmarkSimple,
  settings: GearSix,
  logout: SignOut,
  sliders: SlidersHorizontal,
  search: MagnifyingGlass,
  menu: List,
  back: ArrowLeft,
  previous: CaretLeft,
  next: CaretRight,
  more: DotsThree,
  "more-vertical": DotsThreeVertical,
  close: X,
  sun: Sun,
  moon: Moon,

  // Composer
  send: PaperPlaneRight,
  attach: Paperclip,
  file: File,
  download: DownloadSimple,
  mention: At,
  hash: Hash,
  emoji: Smiley,
  mic: Microphone,
  play: Play,
  pause: Pause,
  stop: Stop,
  scissors: Scissors,
  trash: Trash,

  // Message actions
  reply: ArrowBendUpLeft,
  quote: Quotes,
  copy: Copy,
  forward: ArrowFatRight,
  edit: PencilSimple,
  pencil: PencilSimple,
  pin: PushPin,

  // Status / connectivity
  check: Check,
  "check-double": Checks,
  clock: Clock,
  error: WarningCircle,
  offline: WifiSlash,
  waveform: Waveform,
  "exclamation-mark": ExclamationMark,
} as const satisfies Record<string, AppIconComponent>;

export type IconName = keyof typeof icons;

/** Context → recommended glyph size (px). */
export const ICON_CONTEXT_SIZE = {
  rail: 20,
  header: 20,
  composer: 20,
  "message-action": 16,
  "context-menu": 18,
  status: 14,
  mobile: 22,
} as const;

export type IconContext = keyof typeof ICON_CONTEXT_SIZE;
