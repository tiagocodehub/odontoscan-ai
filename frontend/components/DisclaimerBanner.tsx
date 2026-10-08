import { FALLBACK_DISCLAIMER } from "@/lib/disclaimer";

interface DisclaimerBannerProps {
  /** Disclaimer vindo do servidor (`analysis.disclaimer`). Fallback no estado inicial. */
  text?: string | null;
  className?: string;
}

/**
 * Aviso legal SEMPRE visivel e NAO dismissivel.
 * Fonte unica: o servidor envia o texto no payload da analise.
 */
export default function DisclaimerBanner({ text, className }: DisclaimerBannerProps) {
  const message = text && text.trim().length > 0 ? text : FALLBACK_DISCLAIMER;

  return (
    <aside
      aria-label="Aviso legal e limitações do protótipo"
      className={[
        "flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:p-4",
        "text-amber-950 shadow-sm",
        className ?? "",
      ].join(" ")}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="mt-0.5 h-5 w-5 flex-none fill-amber-600"
      >
        <path d="M12 2 1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-7h-2v5h2V9Z" />
      </svg>
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
          Aviso importante — leia antes de usar
        </p>
        <p className="text-sm leading-relaxed">{message}</p>
      </div>
    </aside>
  );
}
