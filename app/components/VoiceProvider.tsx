"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { adviceStyle, type AdviceStyle } from "@/lib/persona-style";
import { ADVICE_DEFAULTS, type AdviceParams } from "@/lib/advice-params";

type Voice = { persona: string | null; variant: number };
const Ctx = createContext<{ style: AdviceStyle; params: AdviceParams; setVoice: (v: Voice) => void }>({
  style: adviceStyle(null),
  params: ADVICE_DEFAULTS,
  setVoice: () => {},
});

/**
 * Giọng + tham số lời khuyên/nhãn của user đang xem — mọi lời khuyên, giải thích,
 * nhãn trạng thái gợi ý trên web đổi theo. `params` nạp từ server (Setting
 * "adviceParams" do tự học chỉnh) — tải lại trang là áp giá trị mới nhất.
 */
export function VoiceProvider({ initial, params, children }: { initial: Voice; params?: AdviceParams; children: ReactNode }) {
  const [v, setVoice] = useState(initial);
  const value = useMemo(() => ({ style: adviceStyle(v.persona, v.variant), params: params ?? ADVICE_DEFAULTS, setVoice }), [v, params]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useVoice = () => useContext(Ctx);
