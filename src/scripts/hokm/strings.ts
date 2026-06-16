// Bilingual UI strings for the Hokm table. Persian (fa) is primary; English
// (en) is the fallback for the default-locale page. Chosen at runtime from
// <html lang>.

export type Lang = "fa" | "en";

export interface Strings {
  title: string;
  signIn: string;
  signInHint: string;
  notAllowed: string;
  namePlaceholder: string;
  joinGame: string;
  joinError: string;
  createRoom: string;
  creating: string;
  shareHint: string;
  copyLink: string;
  copied: string;
  connecting: string;
  reconnecting: string;
  takeSeat: string;
  seatTaken: string;
  empty: string;
  ready: string;
  waitingReady: string;
  youAreHakem: string;
  chooseTrump: string;
  hakemChoosing: (n: string) => string;
  trumpIs: string;
  yourTurn: string;
  waitingFor: (n: string) => string;
  teamA: string;
  teamB: string;
  tricks: string;
  hands: string;
  hand: string;
  kot: string;
  wonHand: (t: string) => string;
  nextHand: string;
  matchOver: (t: string) => string;
  newMatch: string;
  joinVoice: string;
  mic: string;
  micOn: string;
  micOff: string;
  music: string;
  you: string;
  hakem: string;
  spectating: string;
  rules: string;
}

const fa: Strings = {
  title: "حکم",
  signIn: "ورود",
  signInHint: "اسمت رو بنویس تا بدونیم کیه",
  notAllowed: "این حساب اجازه‌ی ورود ندارد.",
  namePlaceholder: "اسمت چیه؟",
  joinGame: "بزن بریم",
  joinError: "مشکل در اتصال. دوباره امتحان کن.",
  createRoom: "ساخت میز جدید",
  creating: "در حال ساخت…",
  shareHint: "این لینک را برای دوستانت بفرست:",
  copyLink: "کپی لینک",
  copied: "کپی شد!",
  connecting: "در حال اتصال…",
  reconnecting: "اتصال دوباره…",
  takeSeat: "بنشین",
  seatTaken: "این صندلی پر است",
  empty: "خالی",
  ready: "آماده‌ام",
  waitingReady: "منتظر آماده شدن بازیکن‌ها…",
  youAreHakem: "تو حاکمی",
  chooseTrump: "حکم را انتخاب کن",
  hakemChoosing: (n) => `${n} در حال انتخاب حکم است…`,
  trumpIs: "حکم:",
  yourTurn: "نوبت توست",
  waitingFor: (n) => `نوبت ${n}`,
  teamA: "تیم ما",
  teamB: "تیم حریف",
  tricks: "دست",
  hands: "بازی",
  hand: "دست",
  kot: "کوت!",
  wonHand: (t) => `${t} این دست را برد`,
  nextHand: "دست بعد",
  matchOver: (t) => `${t} برنده‌ی بازی شد! 🎉`,
  newMatch: "بازی جدید",
  joinVoice: "ورود به گفتگوی صوتی",
  mic: "میکروفون",
  micOn: "روشن",
  micOff: "خاموش",
  music: "موسیقی",
  you: "تو",
  hakem: "حاکم",
  spectating: "تماشاگر",
  rules: "هر تیم اول به ۷ دست برسد این دست را می‌برد؛ اولین تیمی که ۷ بازی ببرد برنده است.",
};

const en: Strings = {
  title: "Hokm",
  signIn: "Join",
  signInHint: "Choose a name so everyone knows who you are",
  notAllowed: "This account isn't allowed.",
  namePlaceholder: "Your name",
  joinGame: "Let's play",
  joinError: "Connection error. Try again.",
  createRoom: "Create a new table",
  creating: "Creating…",
  shareHint: "Send this link to your friends:",
  copyLink: "Copy link",
  copied: "Copied!",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  takeSeat: "Sit here",
  seatTaken: "Seat taken",
  empty: "Empty",
  ready: "I'm ready",
  waitingReady: "Waiting for players to be ready…",
  youAreHakem: "You are the Hakem",
  chooseTrump: "Choose the trump (hokm)",
  hakemChoosing: (n) => `${n} is choosing trump…`,
  trumpIs: "Trump:",
  yourTurn: "Your turn",
  waitingFor: (n) => `${n}'s turn`,
  teamA: "Our team",
  teamB: "Opponents",
  tricks: "tricks",
  hands: "hands",
  hand: "Hand",
  kot: "Kot!",
  wonHand: (t) => `${t} won the hand`,
  nextHand: "Next hand",
  matchOver: (t) => `${t} wins the match! 🎉`,
  newMatch: "New match",
  joinVoice: "Join voice chat",
  mic: "Mic",
  micOn: "on",
  micOff: "off",
  music: "Music",
  you: "You",
  hakem: "Hakem",
  spectating: "Spectating",
  rules: "First team to 7 tricks wins the hand; first to 7 hands wins the match.",
};

export function getStrings(): Strings {
  const lang = (document.documentElement.lang || "en").startsWith("fa")
    ? "fa"
    : "en";
  return lang === "fa" ? fa : en;
}
