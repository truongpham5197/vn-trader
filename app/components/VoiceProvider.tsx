"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { adviceStyle, type AdviceStyle } from "@/lib/persona-style";

type Voice = { persona: string | null; variant: number };
const Ctx = createContext<{ style: AdviceStyle; setVoice: (v: Voice) => void }>({
  style: adviceStyle(null),
  setVoice: () => {},
});

/** Giọng của user đang xem — mọi lời khuyên/giải thích trên web đổi theo (đổi ở Cài đặt là đổi ngay). */
export function VoiceProvider({ initial, children }: { initial: Voice; children: ReactNode }) {
  const [v, setVoice] = useState(initial);
  const value = useMemo(() => ({ style: adviceStyle(v.persona, v.variant), setVoice }), [v]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useVoice = () => useContext(Ctx);
