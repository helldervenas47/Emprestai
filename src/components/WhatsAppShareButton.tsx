import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useMyProfilePhone } from "@/hooks/useMyProfilePhone";

interface Props {
  /** Async function that returns the text to send. */
  getText: () => Promise<string | null | undefined>;
  /** Optional label override. */
  label?: string;
  /** Disable the button. */
  disabled?: boolean;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
  /** Optional override of destination phone (E.164 digits). Defaults to profile phone. */
  phoneOverride?: string;
}

function normalizePhone(raw: string): string {
  // wa.me requires digits only (no +, no spaces, no separators).
  const digits = (raw || "").replace(/\D+/g, "");
  // If user typed local Brazilian number (10–11 digits), assume +55.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function WhatsAppShareButton({
  getText,
  label = "Enviar ao WhatsApp",
  disabled,
  size = "sm",
  variant = "outline",
  phoneOverride,
}: Props) {
  const { phone } = useMyProfilePhone();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    const target = normalizePhone(phoneOverride ?? phone);
    if (!target || target.length < 8) {
      toast.error("Cadastre seu telefone no perfil para usar este botão.");
      return;
    }
    setLoading(true);
    try {
      const text = await getText();
      if (!text) {
        toast.error("Não foi possível gerar o resumo agora.", {
          description:
            "A função de resumo no servidor pode estar desatualizada. Faça o deploy mais recente das funções (./scripts/deploy-telegram-functions.sh) e tente novamente.",
        });
        return;
      }
      const url = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error("Erro ao gerar resumo para WhatsApp", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handleClick}
      disabled={disabled || loading}
      title={label}
    >
      <MessageCircle className="h-3.5 w-3.5 mr-1 text-[#25D366]" />
      {loading ? "Gerando..." : label}
    </Button>
  );
}
