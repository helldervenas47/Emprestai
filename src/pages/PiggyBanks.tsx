import { useNavigate } from "react-router-dom";
import { ArrowLeft, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PiggyBankList } from "@/features/piggyBanks/components/PiggyBankList";

export default function PiggyBanksPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
    <div className="mx-auto w-full max-w-[1920px] p-4 pb-24 md:p-6 lg:p-8 space-y-4 md:space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" /> Cofrinhos
          </h1>
        </div>
        <PiggyBankList fullWidth />
      </div>
    </div>

  );
}
