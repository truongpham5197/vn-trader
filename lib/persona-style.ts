// Văn phong lời khuyên / giải thích theo giọng thông báo của user (lib/persona.ts).
// Pure, dùng được cả client (thẻ vị thế, trạng thái gợi ý) lẫn server (Telegram, web push).
// Chỉ đổi cách nói: số liệu, mốc cắt lỗ/chốt lời, "không bán hộ", "không phải lệnh" giữ nguyên nghĩa.
// Chuỗi không chứa < > & — ghép vào HTML Telegram an toàn.
import { PERSONAS, personaById } from "./persona";

export const LINE_KEYS = [
  "waitPrice", "setStop", "stopNow", "stopLater", "targetNow", "targetLater",
  "nearStop", "nearTarget", "setTarget", "green", "red", "flat",
] as const;
export type LineKey = (typeof LINE_KEYS)[number];
export type Tone = "loss" | "gain" | "neutral";
type OppGroup = "go" | "wait" | "stop";

interface StyleKit {
  advise: string; // thay "Lời khuyên"
  noSell: string; // thay "app không bán hộ" — PHẢI chứa "không bán hộ"
  heads: { card: string; why: string; steps: string; protect: string; more: string };
  interj: Record<Tone, string[]>;
  opp: Record<OppGroup, string>;
  pos: Record<LineKey, string>;
}

export const STYLES: Record<string, StyleKit> = {
  genz: {
    advise: "Tips nè",
    noSell: "app không bán hộ đâu nha",
    heads: { card: "Tâm sự cả rổ · cho đỡ căng", why: "Vì sao dị", steps: "Việc cần làm", protect: "Giữ ví", more: "Vì sao dị" },
    interj: { loss: ["U là trời", "Căng đét", "Xỉu ngang"], gain: ["Slay", "Xịn xò", "Đỉnh nóc"], neutral: ["Chill", "Ổn áp", "Bình tĩnh"] },
    opp: { go: "vibe ổn, tự quyết nha", wait: "đợi xíu", stop: "thôi khum" },
    pos: {
      waitPrice: "Chưa có giá, bình tĩnh", setStop: "Ê, chưa có cắt lỗ", stopNow: "Ối, thủng cắt lỗ rồi", stopLater: "Thủng cắt lỗ, hàng chưa về",
      targetNow: "Tới chốt lời kìa", targetLater: "Tới chốt lời, hàng chưa về", nearStop: "Sát cắt lỗ, run tay", nearTarget: "Sắp chạm chốt rồi",
      setTarget: "Chưa có chốt lời kìa", green: "Đang xanh, chill đi", red: "Đỏ nhẹ, chưa tới mức", flat: "Vẫn trong vùng, thở đi",
    },
  },
  blv: {
    advise: "BLV nhắc",
    noSell: "app chỉ bình luận, không bán hộ",
    heads: { card: "Nhận định cả đội hình", why: "Phân tích chiến thuật", steps: "Kế hoạch trận đấu", protect: "Giữ sạch lưới", more: "Xem lại pha này" },
    interj: { loss: ["Ôi không", "Nguy hiểm", "Thủng lưới"], gain: ["Vàooo", "Tuyệt vời", "Bàn thắng"], neutral: ["Thế trận cân bằng", "Bóng lăn đều", "Chưa có gì đột biến"] },
    opp: { go: "đã vào vòng cấm, tự quyết dứt điểm", wait: "chờ thời cơ", stop: "việt vị, không lên bóng" },
    pos: {
      waitPrice: "Chưa có tỉ số, chờ bóng lăn", setStop: "Chưa có thủ môn cắt lỗ", stopNow: "Thủng lưới, qua cắt lỗ", stopLater: "Thủng cắt lỗ, cầu thủ chưa về",
      targetNow: "Ghi bàn ở mức chốt lời", targetLater: "Chạm chốt lời, chưa rời sân được", nearStop: "Sát vạch cắt lỗ, phòng ngự căng", nearTarget: "Sắp sút tung lưới chốt lời",
      setTarget: "Chưa có khung thành chốt lời", green: "Đang dẫn bàn, giữ nhịp", red: "Bị dẫn nhẹ, chưa tới cắt lỗ", flat: "Giữa sân, thế trận ổn",
    },
  },
  bep: {
    advise: "Bếp dặn",
    noSell: "bếp chỉ nêm, app không bán hộ",
    heads: { card: "Bếp nếm thử cả mâm", why: "Công thức", steps: "Các bước nấu", protect: "Giữ nồi không cháy", more: "Xem công thức" },
    interj: { loss: ["Khét rồi", "Trào nồi", "Quá lửa"], gain: ["Chín tới", "Thơm phức", "Vừa miệng"], neutral: ["Lửa vừa", "Đang hầm", "Để lửa nhỏ"] },
    opp: { go: "đã chín, tự quyết có ăn không", wait: "chưa chín, chờ thêm", stop: "món này bỏ, đừng dọn lên" },
    pos: {
      waitPrice: "Chưa có giá, bếp chưa nhóm", setStop: "Chưa có vạch cắt lỗ cho nồi", stopNow: "Khét qua mức cắt lỗ", stopLater: "Khét qua cắt lỗ, món chưa ra lò",
      targetNow: "Chín vàng ở mức chốt lời", targetLater: "Chín ở mức chốt, chưa ra lò", nearStop: "Sát cắt lỗ, sắp khét", nearTarget: "Sắp chín tới mức chốt",
      setTarget: "Chưa hẹn giờ chốt lời", green: "Đang thơm, cứ để lửa", red: "Hơi nhạt, chưa tới cắt lỗ", flat: "Đang hầm trong vùng",
    },
  },
  game: {
    advise: "Hint",
    noSell: "app không auto, không bán hộ",
    heads: { card: "Chỉ số cả team", why: "Giải thích cơ chế", steps: "Nhiệm vụ", protect: "Giữ máu", more: "Xem cơ chế" },
    interj: { loss: ["Low HP", "Bị gank", "Game over tới nơi"], gain: ["Victory", "Level up", "Pentakill"], neutral: ["Farm tiếp", "Giữ lane", "Chưa combat"] },
    opp: { go: "đủ điều kiện, tự bấm skill", wait: "chờ hồi chiêu", stop: "không vào combat" },
    pos: {
      waitPrice: "Chưa load giá, chờ map", setStop: "Chưa cắm mắt cắt lỗ", stopNow: "Hết máu, thủng cắt lỗ", stopLater: "Thủng cắt lỗ, đang hồi sinh T+2",
      targetNow: "Phá trụ chốt lời", targetLater: "Chạm chốt lời, chưa rút về được", nearStop: "Máu đỏ, sát cắt lỗ", nearTarget: "Sắp phá trụ chốt lời",
      setTarget: "Chưa đặt mục tiêu chốt lời", green: "Đang lead, farm tiếp", red: "Hơi thua, chưa tới cắt lỗ", flat: "Giữ lane an toàn",
    },
  },
  coTruong: {
    advise: "Cơ trưởng khuyến cáo",
    noSell: "tổ bay không lái hộ, app không bán hộ",
    heads: { card: "Báo cáo buồng lái", why: "Thông số chuyến bay", steps: "Checklist", protect: "Dây an toàn", more: "Xem thông số" },
    interj: { loss: ["Cảnh báo nhiễu động", "Mất độ cao", "Mayday nhẹ"], gain: ["Hạ cánh êm", "Đạt độ cao", "Gió xuôi"], neutral: ["Bay ổn định", "Độ cao hành trình", "Trời quang"] },
    opp: { go: "đường băng thông, tự quyết cất cánh", wait: "chờ cấp phép", stop: "hủy cất cánh" },
    pos: {
      waitPrice: "Chưa có tín hiệu radar", setStop: "Chưa cài độ cao cắt lỗ", stopNow: "Dưới độ cao cắt lỗ", stopLater: "Dưới cắt lỗ, chưa hạ cánh được T+2",
      targetNow: "Tới độ cao chốt lời", targetLater: "Tới chốt lời, chưa mở cửa được", nearStop: "Sát độ cao cắt lỗ", nearTarget: "Sắp tới độ cao chốt",
      setTarget: "Chưa có điểm đến chốt lời", green: "Bay cao, giữ hướng", red: "Hạ nhẹ, chưa tới cắt lỗ", flat: "Bay ổn định trong hành lang",
    },
  },
  thayBoi: {
    advise: "Thầy phán",
    noSell: "thầy chỉ xem quẻ, app không bán hộ",
    heads: { card: "Quẻ cả rổ", why: "Giải quẻ", steps: "Việc nên làm", protect: "Giữ lộc", more: "Giải quẻ" },
    interj: { loss: ["Quẻ xấu", "Hạn tới", "Sao quả tạ"], gain: ["Quẻ đẹp", "Lộc tới", "Thần tài gõ cửa"], neutral: ["Quẻ bình", "Vận đều", "Chưa có điềm"] },
    opp: { go: "quẻ thuận, con tự quyết", wait: "chưa tới giờ hoàng đạo", stop: "quẻ nghịch, chớ mua" },
    pos: {
      waitPrice: "Quẻ chưa hiện, chưa có giá", setStop: "Chưa có bùa cắt lỗ", stopNow: "Phạm hạn, thủng cắt lỗ", stopLater: "Thủng cắt lỗ, vận chưa về T+2",
      targetNow: "Ứng quẻ ở mức chốt lời", targetLater: "Tới chốt lời, lộc chưa về", nearStop: "Sát cắt lỗ, sao xấu gần", nearTarget: "Sắp ứng quẻ chốt lời",
      setTarget: "Chưa định ngày chốt lời", green: "Vận xanh, cứ giữ", red: "Hơi đen, chưa tới cắt lỗ", flat: "Vận bình, ngồi yên",
    },
  },
  rapper: {
    advise: "MC nhắn",
    noSell: "MC chỉ rap, app không bán hộ",
    heads: { card: "Bản rap cả rổ", why: "Lời bài hát", steps: "Setlist", protect: "Giữ beat", more: "Xem lời" },
    interj: { loss: ["Lạc beat", "Rớt nhịp", "Mic hú"], gain: ["Lên top", "Đúng flow", "Hit rồi"], neutral: ["Giữ nhịp", "Beat đều", "Chưa drop"] },
    opp: { go: "vào beat, tự quyết hát", wait: "chờ nhịp", stop: "tắt mic, đừng vào" },
    pos: {
      waitPrice: "Chưa có giá, chưa lên beat", setStop: "Chưa set cắt lỗ, mic chưa check", stopNow: "Thủng cắt lỗ, rớt nhịp", stopLater: "Thủng cắt lỗ, T+2 chưa về",
      targetNow: "Chốt lời lên top", targetLater: "Chạm chốt lời, chưa rời sân khấu", nearStop: "Sát cắt lỗ, run mic", nearTarget: "Sắp chạm chốt, gần drop",
      setTarget: "Chưa có đích chốt lời", green: "Đang xanh, giữ flow", red: "Hơi lệch tone, chưa tới cắt lỗ", flat: "Beat đều trong vùng",
    },
  },
  me: {
    advise: "Mẹ dặn",
    noSell: "mẹ chỉ nhắc, app không bán hộ",
    heads: { card: "Mẹ xem cả nhà", why: "Mẹ giải thích", steps: "Con làm giúp mẹ", protect: "Giữ tiền nhà", more: "Nghe mẹ nói" },
    interj: { loss: ["Trời ơi con", "Mẹ lo quá", "Ôi con ơi"], gain: ["Giỏi quá con", "Mẹ mừng", "Ngoan lắm"], neutral: ["Ổn con ạ", "Cứ từ từ", "Bình thường thôi"] },
    opp: { go: "được đó, con tự quyết", wait: "chờ chút con", stop: "đừng mua con" },
    pos: {
      waitPrice: "Chưa có giá, con chờ chút", setStop: "Con chưa đặt cắt lỗ", stopNow: "Thủng cắt lỗ rồi con", stopLater: "Thủng cắt lỗ, hàng chưa về con",
      targetNow: "Tới chốt lời rồi con", targetLater: "Tới chốt lời, hàng chưa về", nearStop: "Sát cắt lỗ, mẹ lo", nearTarget: "Sắp chạm chốt rồi con",
      setTarget: "Con chưa đặt chốt lời", green: "Đang xanh, con cứ giữ", red: "Đỏ nhẹ, chưa tới cắt lỗ", flat: "Vẫn trong vùng, ngoan",
    },
  },
  daiHiep: {
    advise: "Tại hạ khuyên",
    noSell: "tại hạ không xuất kiếm hộ, app không bán hộ",
    heads: { card: "Luận võ cả môn phái", why: "Tâm pháp", steps: "Chiêu thức", protect: "Hộ thân", more: "Xem tâm pháp" },
    interj: { loss: ["Trúng chưởng", "Nội thương", "Tẩu hỏa"], gain: ["Luyện thành", "Xuất thần", "Đắc thắng"], neutral: ["Tĩnh tọa", "Vận khí đều", "Thủ thế"] },
    opp: { go: "chiêu đã thành, thiếu hiệp tự quyết", wait: "chờ thời", stop: "chớ ra chiêu" },
    pos: {
      waitPrice: "Chưa rõ giá, tĩnh tọa", setStop: "Chưa có hộ thân cắt lỗ", stopNow: "Trúng chưởng, thủng cắt lỗ", stopLater: "Thủng cắt lỗ, kiếm chưa về T+2",
      targetNow: "Luyện thành ở mức chốt lời", targetLater: "Tới chốt lời, chưa thu kiếm được", nearStop: "Sát cắt lỗ, nội lực yếu", nearTarget: "Sắp đại thành chốt lời",
      setTarget: "Chưa định cảnh giới chốt lời", green: "Nội lực đang lên, giữ", red: "Hơi yếu, chưa tới cắt lỗ", flat: "Thủ thế trong vùng",
    },
  },
  dev: {
    advise: "Code review",
    noSell: "app chỉ log, không bán hộ",
    heads: { card: "Health check danh mục", why: "Root cause", steps: "TODO", protect: "Guardrail", more: "Xem log" },
    interj: { loss: ["Exception", "Build đỏ", "Panic"], gain: ["Pass", "Build xanh", "Ship it"], neutral: ["Idle", "Running", "No-op"] },
    opp: { go: "pass check, tự quyết merge", wait: "pending", stop: "blocked, đừng merge" },
    pos: {
      waitPrice: "Chưa có giá, đang fetch", setStop: "Thiếu config cắt lỗ", stopNow: "Error: thủng cắt lỗ", stopLater: "Thủng cắt lỗ, T+2 chưa settle",
      targetNow: "Hit target chốt lời", targetLater: "Chạm chốt lời, chưa settle T+2", nearStop: "Warning: sát cắt lỗ", nearTarget: "Sắp hit target chốt",
      setTarget: "Thiếu config chốt lời", green: "Xanh, cứ chạy", red: "Warning nhẹ, chưa tới cắt lỗ", flat: "Healthy trong vùng",
    },
  },
};

export interface AdviceStyle {
  id: string;
  heads: StyleKit["heads"];
  /** Đổi "Lời khuyên" / "app không bán hộ" sang văn phong riêng — giữ nguyên số liệu. */
  text(s: string): string;
  /** Nhãn một dòng cho vị thế. */
  pos(key: LineKey | undefined, fallback: string): string;
  /** Câu tiêu đề thẻ cả rổ. */
  headline(s: string, tone: Tone): string;
  /** Nhãn trạng thái gợi ý mua: giữ nhãn gốc, thêm đuôi theo giọng. */
  opp(state: string, label: string): string;
}

const OPP_GROUP: Record<string, OppGroup> = {
  actionable: "go", watch: "wait", waiting: "wait", stale: "wait",
  extended: "stop", invalid: "stop", expired: "stop", blocked: "stop",
};

/** `variant` = thứ tự trong nhóm cùng phong cách → đổi thán từ tiêu đề, người trùng phong cách vẫn khác câu. */
export function adviceStyle(personaId: string | null | undefined, variant = 0): AdviceStyle {
  const p = personaById(personaId);
  const k = STYLES[p.id] ?? STYLES[PERSONAS[0].id];
  const v = Math.max(0, Math.floor(variant));
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const text = (s: string) =>
    s
      .replace(/Lời khuyên là /g, `${k.advise}: `)
      .replace(/Lời khuyên/g, k.advise)
      .replace(/([Aa])pp (?:chỉ cảnh báo, )?không bán hộ/g, (_, a: string) => (a === "A" ? cap(k.noSell) : k.noSell));
  return {
    id: p.id,
    heads: k.heads,
    text,
    pos: (key, fallback) => (key ? k.pos[key] : fallback),
    // Bỏ thán từ gốc ("Ối", "Ê,") để không chồng 2 thán từ
    headline: (s, tone) => `${k.interj[tone][v % k.interj[tone].length]}! ${cap(text(s.replace(/^(Ối|Ê,)\s+/, "")))}`,
    opp: (state, label) => {
      const g = OPP_GROUP[state];
      return g ? `${label} · ${k.opp[g]}` : label;
    },
  };
}
