// Giọng thông báo riêng từng user — trẻ, vui. Được trùng phong cách (kể cả với owner), nhưng mỗi người
// trong cùng phong cách có "biến thể" riêng (thứ tự theo id) → cùng lúc, cùng mã vẫn nhận câu khác nhau.
// Chỉ là lời dẫn: số liệu/lời khuyên thật nằm ở phần sau câu. Không hứa lãi, không ra lệnh bán.
// Chuỗi không chứa < > & — vẫn escape khi ghép HTML.

export type Slot =
  | "greet" // mở đầu gợi ý mua
  | "buy" // từng mã gợi ý
  | "held" // mã gợi ý trùng mã đang giữ
  | "stop" // thủng cắt lỗ
  | "target" // chạm chốt lời
  | "exit" // luật thoát của chiến lược bật
  | "up" // mã tăng mạnh nhất rổ hôm nay
  | "down" // mã giảm mạnh nhất rổ hôm nay
  | "win" // trả bài: gợi ý chạm chốt
  | "loss" // trả bài: gợi ý thủng cắt lỗ
  | "flat" // trả bài: hết hạn, không chạm mốc nào
  | "bye"; // câu chốt, nhận trách nhiệm

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  /** Đuôi câu mở/chốt theo biến thể — người thứ 2, 3… cùng phong cách có chữ ký khác. */
  tails: string[];
  lines: Record<Slot, string[]>;
}

export const PERSONAS: Persona[] = [
  {
    id: "genz",
    name: "Bé Gen Z",
    emoji: "🫧",
    tails: ["", " ✨", " nha bestie", " khum đùa"],
    lines: {
      greet: ["Hé lu {n}, hôm nay có kèo nè, đọc liền khum là trôi", "{n} ơi, bảng điện vừa nhả vài mã đáng để ý nè", "Ê {n}, drop list mới nóng hổi đây"],
      buy: ["{t} đang vibe ổn áp", "{t} lên sóng, nhưng vẫn phải có cắt lỗ nha", "{t} hơi bị có gu đó"],
      held: ["{n} đang ôm {t} rồi đó, đừng mua thêm vì thấy quen mặt", "{t} có trong ví rồi, gợi ý này không phải lời rủ trung bình giá", "{t} là người quen cũ của {n}, khỏi rước thêm"],
      stop: ["U là trời, {t} thủng cắt lỗ rồi {n} ơi", "{t} rơi qua mức cắt lỗ, xỉu ngang", "{t} vừa flop qua vạch cắt lỗ, căng đét"],
      target: ["{t} chạm chốt lời, slay quá {n}", "{t} tới đích rồi, đừng quẩy quá đà nha", "{t} ăn điểm mười ở mức chốt"],
      exit: ["{t} gãy nhịp theo luật chiến lược, hết vibe rồi", "{t} lệch mood so với luật chiến lược", "{t} bị luật chiến lược cho ra rìa"],
      up: ["{t} hôm nay bay nhất rổ, flex nhẹ thôi", "{t} là main character của rổ hôm nay", "{t} đang slay nhất rổ"],
      down: ["{t} hôm nay đuối nhất rổ, ôm nhẹ tâm hồn", "{t} hôm nay hơi tụt mood", "{t} là đứa buồn nhất rổ hôm nay"],
      win: ["Kèo {t} hôm trước về đích, tụi mình đúng lần này", "Kèo {t} hôm trước ăn rồi nha", "{t} hôm trước chốt đẹp, xịn xò"],
      loss: ["Kèo {t} hôm trước toang, app nhận sai nha, không lươn", "Kèo {t} hôm trước flop, lỗi app", "{t} hôm trước sai kèo, app xin lỗi thiệt"],
      flat: ["Kèo {t} hết hạn mà chưa chạm mốc nào, hơi nhạt", "{t} hôm trước đứng hình tới hết giờ", "Kèo {t} nhạt như nước ốc"],
      bye: ["Gợi ý sai app tự khai, không lặn mất tăm đâu", "App sẽ báo lại kết quả từng kèo, đúng sai gì cũng kể", "Kèo nào hỏng app tự nhận, khum đổ thừa"],
    },
  },
  {
    id: "blv",
    name: "BLV Sân Cỏ",
    emoji: "⚽",
    tails: ["", ", thưa quý vị", ", khán đài dậy sóng", ", xin mời theo dõi"],
    lines: {
      greet: ["Xin chào khán giả {n}, trận đấu hôm nay có vài pha đáng xem", "{n} ơi, còi khai cuộc vang lên, đội hình gợi ý đây", "Chào {n}, sân cỏ chứng khoán hôm nay khá sôi động"],
      buy: ["{t} đang dắt bóng vào vòng cấm", "{t} có pha tăng tốc đáng chú ý bên cánh", "{t} vừa có đường chuyền mở rất đẹp"],
      held: ["{t} đã có trong đội hình của {n}, đừng tung thêm người vào cùng vị trí", "{t} đang đá chính cho {n} rồi, không cần mua thêm dự bị", "{n} đã có {t} trên sân, đừng thay người trùng vị trí"],
      stop: ["Ôi không! {t} thủng lưới, qua vạch cắt lỗ", "{t} để lọt bóng qua mức cắt lỗ, khán đài lặng im", "Bàn thua cho {t}, đã qua vạch cắt lỗ"],
      target: ["Vàooo! {t} ghi bàn ở mức chốt lời", "{t} sút tung lưới mục tiêu, nhưng trận chưa kết thúc", "{t} lập công ở mức chốt lời"],
      exit: ["{t} nhận thẻ theo luật chiến lược, trọng tài đã rút", "{t} việt vị theo luật chiến lược", "{t} phạm lỗi, luật chiến lược thổi còi"],
      up: ["{t} là cầu thủ xuất sắc nhất rổ hôm nay", "{t} chạy khỏe nhất sân hôm nay", "{t} đang chơi lên đồng hôm nay"],
      down: ["{t} đá tệ nhất rổ hôm nay, cần xem lại băng hình", "{t} hôm nay chơi dưới sức", "{t} là mắt xích yếu nhất hôm nay"],
      win: ["Pha gợi ý {t} hôm trước đã thành bàn", "{t} hôm trước kết thúc bằng bàn thắng", "Đường chuyền {t} hôm trước có kiến tạo"],
      loss: ["Pha gợi ý {t} hôm trước hỏng ăn, BLV xin nhận lỗi", "{t} hôm trước phản lưới nhà, lỗi thuộc về app", "Pha {t} hôm trước là sai lầm của ban huấn luyện app"],
      flat: ["Pha {t} hết giờ mà tỉ số vẫn hòa", "{t} hôm trước hòa không bàn thắng", "{t} hôm trước đá tới phút cuối vẫn chưa có bàn"],
      bye: ["Trọng tài app chỉ thổi còi, không đá hộ. Sai thì sẽ phát lại cho coi", "Hết hiệp, bàn thua nào app cũng chiếu lại, không cắt", "Ban huấn luyện app chịu trách nhiệm đội hình đã chọn"],
    },
  },
  {
    id: "bep",
    name: "Đầu Bếp Chứng",
    emoji: "👨‍🍳",
    tails: ["", ", nêm vừa ăn", ", bếp nóng đây", ", mời dùng"],
    lines: {
      greet: ["{n} ơi, bếp vừa ra lò vài món, nếm thử nhưng đừng ăn cả nồi", "Thực đơn hôm nay của {n} đây, nguyên liệu tươi từ bảng điện", "Bếp mở rồi {n}, món mới lên mâm"],
      buy: ["{t} đang chín tới", "{t} vừa lửa, nêm cắt lỗ trước khi ăn", "{t} thơm phức, nhưng nhớ nếm từ từ"],
      held: ["{t} đã có trên bàn {n} rồi, gọi thêm đĩa nữa là bội thực", "{n} đang ăn {t} rồi, đừng gọi thêm để kéo giá vốn", "{t} còn trên mâm {n}, khỏi dọn thêm"],
      stop: ["{t} khét rồi {n} ơi, qua mức cắt lỗ", "Nồi {t} trào qua vạch cắt lỗ", "{t} cháy đáy, dưới mức cắt lỗ rồi"],
      target: ["{t} chín vàng đúng mức chốt lời", "{t} ra lò ở mức chốt, đừng để nguội", "{t} đạt độ ngon ở mức chốt"],
      exit: ["{t} quá lửa theo công thức chiến lược", "{t} lệch công thức chiến lược", "{t} bị công thức chiến lược loại khỏi mâm"],
      up: ["{t} là món ngon nhất mâm hôm nay", "{t} được khen nhiều nhất mâm hôm nay", "{t} đậm vị nhất mâm hôm nay"],
      down: ["{t} là món mặn nhất mâm hôm nay", "{t} hôm nay hơi nhạt", "{t} là món nguội nhất mâm hôm nay"],
      win: ["Món {t} gợi ý hôm trước đã chín đúng mức chốt", "{t} hôm trước ra món đẹp", "Món {t} hôm trước được chấm điểm cao"],
      loss: ["Món {t} gợi ý hôm trước bị cháy, bếp trưởng nhận lỗi", "{t} hôm trước hỏng món, lỗi của bếp", "Món {t} hôm trước khét, bếp xin lỗi"],
      flat: ["Món {t} để lâu quá mà chưa chín, cũng chưa cháy", "{t} hôm trước sống nhăn tới hết giờ", "Món {t} hôm trước nguội mà chưa ai ăn"],
      bye: ["Món nào dở bếp sẽ báo lại, không giấu dưới gầm bếp", "Bếp nhận trách nhiệm từng món, ngon dở gì cũng báo", "Món hỏng bếp tự khai, không đổ cho nguyên liệu"],
    },
  },
  {
    id: "game",
    name: "Game Thủ Kim Cương",
    emoji: "🎮",
    tails: ["", " GG", " no cap", ", respawn thôi"],
    lines: {
      greet: ["GG {n}, vừa spawn vài con mồi mới trên map", "{n} ơi, queue xong rồi, vào trận thôi", "Loot mới rơi rồi {n}, check túi đồ đi"],
      buy: ["{t} vừa lên level", "{t} đang có buff, nhưng máu mỏng vẫn phải cắm cắt lỗ", "{t} vừa mở khóa skill mới"],
      held: ["{t} có trong túi đồ {n} rồi, farm thêm là quá tải", "{n} đang cầm {t}, đừng stack thêm cùng item", "{t} đã equip rồi, khỏi mua bản trùng"],
      stop: ["{t} hết máu, rớt qua mức cắt lỗ", "{t} bị combo, thủng cắt lỗ rồi {n}", "{t} dính one-shot qua vạch cắt lỗ"],
      target: ["{t} phá trụ chốt lời, victory", "{t} lên tới mốc chốt, đừng AFK", "{t} clear boss ở mức chốt"],
      exit: ["{t} dính debuff theo luật chiến lược", "{t} bị luật chiến lược kick khỏi party", "{t} out meta theo luật chiến lược"],
      up: ["{t} MVP rổ hôm nay", "{t} đang carry cả rổ hôm nay", "{t} hôm nay rank cao nhất"],
      down: ["{t} feed nhất rổ hôm nay", "{t} hôm nay lag nặng nhất", "{t} là đồng đội báo nhất hôm nay"],
      win: ["Kèo {t} hôm trước clear màn", "{t} hôm trước ăn trọn EXP", "Nhiệm vụ {t} hôm trước hoàn thành"],
      loss: ["Kèo {t} hôm trước game over, app nhận thua", "{t} hôm trước wipe team, lỗi app gọi sai", "Kèo {t} hôm trước thua, app nhận trách nhiệm shotcall"],
      flat: ["Kèo {t} hết giờ, hòa kỹ thuật", "{t} hôm trước timeout, không ai thắng", "{t} hôm trước đứng farm tới hết trận"],
      bye: ["Thua ván nào app replay ván đó, không xóa lịch sử đấu", "App ghi đủ bảng thành tích, thắng thua đều công khai", "Shotcall sai app nhận, không đổ cho mạng lag"],
    },
  },
  {
    id: "coTruong",
    name: "Cơ Trưởng",
    emoji: "✈️",
    tails: ["", ", xin cảm ơn", ", over", ", tổ bay xin thông báo"],
    lines: {
      greet: ["Kính chào hành khách {n}, đây là cơ trưởng, có vài chuyến bay mới", "{n} thân mến, tháp điều khiển vừa cấp phép vài đường băng", "Chào {n}, lịch bay hôm nay đã cập nhật"],
      buy: ["{t} được cấp phép cất cánh", "{t} sẵn sàng lăn bánh, nhớ thắt dây an toàn cắt lỗ", "{t} đã vào đường băng chờ"],
      held: ["{t} đã có ghế trên chuyến của {n}, không cần mua thêm vé", "{n} đang bay cùng {t}, đừng xếp thêm hành lý cùng khoang", "{t} đã lên máy bay của {n} rồi"],
      stop: ["Cảnh báo nhiễu động: {t} xuống dưới độ cao cắt lỗ", "{t} hạ độ cao qua mức cắt lỗ, {n} kiểm tra dây an toàn", "{t} mất độ cao, dưới mức cắt lỗ"],
      target: ["{t} đã tới độ cao chốt lời", "{t} hạ cánh an toàn ở mức chốt", "{t} đạt độ cao hành trình ở mức chốt"],
      exit: ["{t} lệch đường bay theo luật chiến lược", "{t} bị kiểm soát không lưu yêu cầu đổi hướng", "{t} không còn trong hành lang bay của chiến lược"],
      up: ["{t} bay cao nhất đội bay hôm nay", "{t} có gió xuôi mạnh nhất hôm nay", "{t} leo cao nhanh nhất hôm nay"],
      down: ["{t} gặp gió ngược mạnh nhất hôm nay", "{t} hôm nay rung lắc nhất", "{t} hạ độ cao nhiều nhất hôm nay"],
      win: ["Chuyến {t} hôm trước hạ cánh đúng điểm chốt", "{t} hôm trước tới nơi đúng giờ", "Chuyến {t} hôm trước an toàn tới đích"],
      loss: ["Chuyến {t} hôm trước phải hạ cánh khẩn ở mức cắt lỗ, tổ bay xin lỗi", "{t} hôm trước chuyển hướng khẩn, lỗi thuộc tổ bay", "Chuyến {t} hôm trước không tới đích, tổ bay nhận trách nhiệm"],
      flat: ["Chuyến {t} bay vòng chờ hết giờ, chưa tới đâu", "{t} hôm trước nằm chờ trên đường băng", "Chuyến {t} hôm trước hoãn tới hết giờ"],
      bye: ["Tổ bay chịu trách nhiệm từng chuyến, trễ hay rơi đều báo cáo", "Hộp đen app lưu mọi gợi ý, sai là mở ra đọc lại", "Chuyến nào trục trặc tổ bay đều báo cáo công khai"],
    },
  },
  {
    id: "thayBoi",
    name: "Thầy Bói Thất Nghiệp",
    emoji: "🔮",
    tails: ["", ", thầy nói thật", ", mô phật", ", tin hay không tùy con"],
    lines: {
      greet: ["Quả cầu pha lê hết pin nên thầy dùng số liệu, {n} xem nè", "{n} ngồi xuống, thầy không bói, thầy đọc biểu đồ", "Thầy xem quẻ số liệu cho {n} đây"],
      buy: ["{t} hiện hình trong quả cầu, kèm vạch cắt lỗ", "Thẻ bài lật ra {t}, nhưng thầy không cam kết gì", "{t} có tướng khá, vẫn phải có cắt lỗ"],
      held: ["Thầy thấy {n} đã cầm {t}, số không bảo mua thêm", "{t} đã nằm trong mệnh {n} rồi, đừng gánh thêm", "{n} với {t} đã có duyên, đừng ép thêm"],
      stop: ["Quẻ xấu: {t} thủng cắt lỗ", "Thầy đã thấy trước, {t} rơi qua mức cắt lỗ, tiếc là không cản được", "{t} phạm hạn, dưới mức cắt lỗ rồi"],
      target: ["Quẻ đẹp: {t} chạm chốt lời", "{t} tới mức chốt, thầy xin phép vuốt râu", "{t} gặp quý nhân ở mức chốt"],
      exit: ["{t} phạm luật chiến lược, quẻ đổi", "{t} xung khắc với luật chiến lược", "Quẻ {t} lật mặt theo luật chiến lược"],
      up: ["Sao chiếu mệnh hôm nay là {t}", "{t} hôm nay gặp vận hanh thông", "{t} hôm nay được thần tài gõ cửa"],
      down: ["{t} hôm nay gặp hạn nặng nhất rổ", "{t} hôm nay sao xấu chiếu", "{t} hôm nay vận hơi đen"],
      win: ["Quẻ {t} hôm trước ứng nghiệm ở mức chốt", "{t} hôm trước linh nghiệm", "Thầy phán {t} hôm trước trúng"],
      loss: ["Quẻ {t} hôm trước sai, thầy nhận, không đổ tại trời", "{t} hôm trước thầy phán trật, xin lỗi con", "Quẻ {t} hôm trước hỏng, lỗi thầy"],
      flat: ["Quẻ {t} hết hạn, chưa ứng cũng chưa hỏng", "{t} hôm trước lửng lơ tới hết giờ", "Quẻ {t} hôm trước im re"],
      bye: ["Thầy thất nghiệp vì hay nói thật: quẻ sai thầy vẫn báo", "Bói trúng thầy khoe, bói trật thầy cũng khai", "Quẻ nào sai thầy ghi sổ, không giấu"],
    },
  },
  {
    id: "rapper",
    name: "MC Vần Vè",
    emoji: "🎤",
    tails: ["", ", yo", ", drop the beat", ", peace"],
    lines: {
      greet: ["Yo {n}, bảng điện lên đèn, vài mã lên hình, nghe qua cho rành", "{n} ơi check mic, gợi ý mới trong list, đọc kỹ đừng liều", "{n} à nghe nè, bảng điện có vài bài mới toe"],
      buy: ["{t} lên beat, cắt lỗ phải set", "{t} vào nhịp, nhớ phanh kịp", "{t} có flow, nhưng đừng dồn hết vốn vô show"],
      held: ["{t} đã trong ví, mua thêm là phí", "{n} giữ {t} rồi, gom thêm là rối", "{t} đang trong tay, thêm nữa là cay"],
      stop: ["{t} rơi qua vạch, lỗ đã có mạch", "{t} thủng cắt lỗ, đừng cố gỡ", "{t} xuống đáy, cắt lỗ đã vượt ngưỡng này"],
      target: ["{t} chạm chốt, lãi trên giấy chưa phải tiền trong tủ", "{t} tới đích, đừng quên ghi điểm", "{t} lên đỉnh, chốt lời đã định"],
      exit: ["{t} lệch beat theo luật chiến lược", "{t} sai nhịp, luật chiến lược nhắc kịp", "{t} off beat, luật chiến lược gõ nhẹ"],
      up: ["{t} hôm nay lên cao, rổ reo ào ào", "{t} hôm nay hot nhất show", "{t} hôm nay lên top, không stop"],
      down: ["{t} hôm nay rơi sâu, rổ hơi buồn rầu", "{t} hôm nay xuống tone", "{t} hôm nay trầm như ballad"],
      win: ["Bài {t} hôm trước ra hit, chạm chốt", "{t} hôm trước lên top chart", "Track {t} hôm trước nổ đúng lúc"],
      loss: ["Bài {t} hôm trước flop, app nhận lỗi, không đổ cho beat", "{t} hôm trước lạc nhịp, lỗi app", "Track {t} hôm trước fail, app nhận sai"],
      flat: ["Bài {t} hết giờ phát, chưa hit chưa flop", "{t} hôm trước lặng thinh tới hết bài", "{t} hôm trước chưa kịp lên chart"],
      bye: ["Nói sai app nhận, không lặn không lẩn", "Đúng sai đều thu âm, không xóa track nào", "Bài hỏng app tự hát lại, không giấu"],
    },
  },
  {
    id: "me",
    name: "Mẹ Bỉm Tài Chính",
    emoji: "🍼",
    tails: ["", " nghe con", ", thương con", ", mẹ dặn rồi đó"],
    lines: {
      greet: ["{n} ơi, mẹ lọc vài mã cho con nè, nhớ mặc áo cắt lỗ", "Con {n}, mẹ nhắc: xem gợi ý thôi, tiền là của con", "{n} à, mẹ vừa đi chợ bảng điện về nè"],
      buy: ["{t} trông cũng ngoan", "{t} có nết, nhưng vẫn phải đặt cắt lỗ con nhé", "{t} nhìn được đó con"],
      held: ["Con đang giữ {t} rồi, mua thêm mẹ không cho", "{t} có trong nhà rồi, đừng rước thêm cho chật", "{t} con có rồi, mẹ không duyệt mua thêm"],
      stop: ["Mẹ đã dặn rồi, {t} thủng cắt lỗ kìa {n}", "{t} rơi qua mức cắt lỗ, con bình tĩnh nghe mẹ", "{t} xuống dưới cắt lỗ rồi con ơi"],
      target: ["{t} chạm chốt lời, giỏi quá con", "{t} tới mức chốt rồi, đừng tham nha con", "{t} lên tới mức chốt, mẹ mừng"],
      exit: ["{t} hư theo luật chiến lược, mẹ báo con biết", "{t} không nghe lời luật chiến lược", "{t} trái luật chiến lược rồi con"],
      up: ["{t} là đứa ngoan nhất nhà hôm nay", "{t} hôm nay được điểm mười", "{t} hôm nay học giỏi nhất nhà"],
      down: ["{t} hôm nay quấy nhất nhà", "{t} hôm nay bị điểm kém", "{t} hôm nay dỗi nhất nhà"],
      win: ["Mã {t} mẹ gợi ý hôm trước chạm chốt, mẹ vui", "{t} hôm trước ngoan, về đúng mức chốt", "Mã {t} hôm trước làm mẹ tự hào"],
      loss: ["Mã {t} mẹ gợi ý hôm trước thủng cắt lỗ, mẹ xin lỗi con", "{t} hôm trước mẹ chọn sai, mẹ nhận", "Mã {t} hôm trước làm con buồn, lỗi của mẹ"],
      flat: ["Mã {t} mẹ gợi ý hết hạn mà chưa đi đâu", "{t} hôm trước cứ đứng yên hoài", "Mã {t} hôm trước lì quá, chưa nhúc nhích"],
      bye: ["Mẹ gợi ý sai mẹ nhận, không đổ cho thị trường", "Mẹ sẽ báo lại từng mã, không giấu con điều gì", "Mã nào mẹ chọn sai, mẹ nói thẳng"],
    },
  },
  {
    id: "daiHiep",
    name: "Đại Hiệp Chứng Sĩ",
    emoji: "⚔️",
    tails: ["", ", cáo từ", ", hậu hội hữu kỳ", ", xin lĩnh giáo"],
    lines: {
      greet: ["Bái kiến {n} thiếu hiệp, giang hồ vừa lộ vài bí kíp", "{n} huynh, võ lâm hôm nay có vài chiêu đáng luyện", "Tin giang hồ gửi {n}: vài môn phái vừa ra chiêu"],
      buy: ["{t} vừa đả thông kinh mạch", "{t} ra chiêu, nhưng hộ thân cắt lỗ phải có", "{t} nội lực đang lên"],
      held: ["{t} đã trong tay áo {n}, luyện thêm dễ tẩu hỏa", "{n} đang giữ {t}, chớ tham gom thêm chiêu cũ", "{t} đã là bảo kiếm của {n}, đừng rèn thêm"],
      stop: ["{t} trúng chưởng, thủng cắt lỗ", "Nội công {t} tán loạn, qua mức cắt lỗ", "{t} lỡ bước, rơi dưới vạch cắt lỗ"],
      target: ["{t} luyện thành, chạm mức chốt lời", "{t} lên tầng chốt lời, thu kiếm được rồi", "{t} đại công cáo thành ở mức chốt"],
      exit: ["{t} phạm môn quy của chiến lược", "{t} bị trục xuất theo môn quy chiến lược", "{t} trái đạo chiến lược"],
      up: ["{t} là cao thủ số một hôm nay", "{t} hôm nay xưng bá", "{t} hôm nay độc bộ giang hồ"],
      down: ["{t} hôm nay nội thương nặng nhất", "{t} hôm nay tẩu hỏa nhập ma", "{t} hôm nay yếu thế nhất"],
      win: ["Chiêu {t} truyền hôm trước đã thành công", "{t} hôm trước đắc thắng", "Bí kíp {t} hôm trước linh nghiệm"],
      loss: ["Chiêu {t} truyền hôm trước thất bại, tại hạ xin chịu tội", "{t} hôm trước thua trận, tại hạ nhận lỗi", "Bí kíp {t} hôm trước sai, tại hạ không chối"],
      flat: ["Chiêu {t} luyện hết hạn, chưa thành chưa bại", "{t} hôm trước bất phân thắng bại", "{t} hôm trước luyện mãi chưa xong"],
      bye: ["Quân tử nhất ngôn: chiêu hỏng tại hạ tự khai", "Giang hồ trọng chữ tín, gợi ý sai app báo lại", "Tại hạ chịu trách nhiệm từng chiêu đã truyền"],
    },
  },
  {
    id: "dev",
    name: "Dev Debug Danh Mục",
    emoji: "💻",
    tails: ["", " // TODO: đọc kỹ", ", LGTM", ", ship it"],
    lines: {
      greet: ["{n}, build mới vừa xanh, có vài mã trong changelog", "git pull cho {n}: mấy tín hiệu mới vừa merge", "{n} ơi, release note hôm nay đây"],
      buy: ["{t} pass test giá + khối lượng", "{t} đã deploy, nhớ có rollback cắt lỗ", "{t} review xong, chờ {n} approve"],
      held: ["{t} đã chạy trong prod của {n}, đừng deploy thêm bản trùng", "{n} đang giữ {t}, mua thêm là duplicate key", "{t} đã có trong repo của {n}, khỏi fork thêm"],
      stop: ["Exception: {t} thủng cắt lỗ", "{t} crash qua mức cắt lỗ, log đỏ lòm", "{t} throw error dưới vạch cắt lỗ"],
      target: ["{t} hit target, test pass", "{t} chạm mức chốt, merge thôi", "{t} reach target, build xanh"],
      exit: ["{t} fail assertion của chiến lược", "{t} vi phạm lint rule của chiến lược", "{t} bị chiến lược revert"],
      up: ["{t} là commit đẹp nhất rổ hôm nay", "{t} hôm nay perf tốt nhất", "{t} hôm nay zero bug"],
      down: ["{t} là bug nặng nhất rổ hôm nay", "{t} hôm nay memory leak", "{t} hôm nay latency cao nhất"],
      win: ["Ticket {t} hôm trước đóng ở mức chốt", "{t} hôm trước merge thành công", "PR {t} hôm trước được approve"],
      loss: ["Ticket {t} hôm trước fail ở mức cắt lỗ, app nhận bug", "{t} hôm trước rollback, lỗi của app", "PR {t} hôm trước gãy prod, app nhận"],
      flat: ["Ticket {t} timeout, chưa pass chưa fail", "{t} hôm trước pending review tới hết giờ", "{t} hôm trước stuck ở CI"],
      bye: ["Postmortem công khai: gợi ý sai app ghi lại", "Không silent fail: đúng sai gì app cũng log ra", "Bug nào app gây ra app tự mở ticket"],
    },
  },
];

const BY_ID = new Map(PERSONAS.map((p) => [p.id, p]));

export const personaById = (id: string | null | undefined): Persona => BY_ID.get(id ?? "") ?? PERSONAS[0];

/** Hash chuỗi → số không âm (FNV-1a) — chọn câu ổn định theo ngày/mã, không random. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Câu theo phong cách. `variant` = thứ tự của user trong nhóm cùng phong cách — cùng seed mà khác variant
 * thì ra câu khác (tới số câu của slot), greet/bye còn đổi đuôi câu. {t} = mã, {n} = tên, chưa escape.
 */
export function say(p: Persona, slot: Slot, vars: { t?: string; n?: string } = {}, seed = "", variant = 0): string {
  const xs = p.lines[slot];
  const v = Math.max(0, Math.floor(variant));
  let line = xs[(seedOf(`${p.id}|${slot}|${seed}`) + v) % xs.length];
  // Số câu 3 × số đuôi 4 nguyên tố cùng nhau → 12 người cùng phong cách vẫn ra câu mở/chốt khác nhau
  if (slot === "greet" || slot === "bye") line += p.tails[v % p.tails.length];
  return line.replace(/\{t\}/g, vars.t ?? "").replace(/\{n\}/g, vars.n ?? "bạn");
}

/** Biến thể của user trong nhóm cùng phong cách: thứ tự theo id (owner cũng tính). */
export function variantOf(users: { id: number; persona: string | null }[], userId: number, persona: string): number {
  const ids = users.filter((u) => (u.persona ?? PERSONAS[0].id) === persona).map((u) => u.id).sort((a, b) => a - b);
  return Math.max(0, ids.indexOf(userId));
}

/** Phong cách mặc định cho user mới: ít người dùng nhất (trải đều). User vẫn tự chọn trùng được. */
export function pickPersona(used: (string | null)[], userId: number): string {
  const count = new Map(PERSONAS.map((p) => [p.id, 0]));
  for (const u of used) if (u && count.has(u)) count.set(u, count.get(u)! + 1);
  const min = Math.min(...count.values());
  const free = PERSONAS.filter((p) => count.get(p.id) === min);
  return free[userId % free.length].id;
}
