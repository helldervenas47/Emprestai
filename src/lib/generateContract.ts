import { Sale, Client } from "@/types/loan";
import { format, addMonths, addWeeks, addDays } from "date-fns";
import { LocadorInfo } from "@/features/vehicles/hooks/useLocadorInfo";
import { VehicleInfo } from "@/features/vehicles/hooks/useVehicleRegistry";
import { parseNotesWithMerchandise } from "@/features/sales/lib/saleMerchandise";
import { formatCPF, formatRG } from "@/lib/brDocuments";


function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (["Diário", "Diária", "Diario", "Diaria", "daily"].includes(frequency)) return addDays(date, n);
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  return addMonths(date, n);
}

function formatCurrencyBR(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// Escape any user-controlled string before injecting into HTML to prevent XSS.
function escapeHtml(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const e = escapeHtml;

function numberToWords(n: number): string {
  const units = ["", "Um", "Dois", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove"];
  const teens = ["Dez", "Onze", "Doze", "Treze", "Quatorze", "Quinze", "Dezesseis", "Dezessete", "Dezoito", "Dezenove"];
  const tens = ["", "", "Vinte", "Trinta", "Quarenta", "Cinquenta", "Sessenta", "Setenta", "Oitenta", "Noventa"];
  const hundreds = ["", "Cento", "Duzentos", "Trezentos", "Quatrocentos", "Quinhentos", "Seiscentos", "Setecentos", "Oitocentos", "Novecentos"];

  if (n === 0) return "Zero";
  if (n === 100) return "Cem";

  const parts: string[] = [];
  const intPart = Math.floor(n);
  const centsPart = Math.round((n - intPart) * 100);

  if (intPart >= 1000) {
    const thousands = Math.floor(intPart / 1000);
    if (thousands === 1) parts.push("Mil");
    else if (thousands < 10) parts.push(units[thousands] + " Mil");
    else parts.push(String(thousands) + " Mil");
  }

  const remainder = intPart % 1000;
  if (remainder >= 100) {
    if (remainder === 100) parts.push("Cem");
    else parts.push(hundreds[Math.floor(remainder / 100)]);
  }
  const lastTwo = remainder % 100;
  if (lastTwo >= 10 && lastTwo < 20) {
    parts.push(teens[lastTwo - 10]);
  } else {
    if (lastTwo >= 20) parts.push(tens[Math.floor(lastTwo / 10)]);
    if (lastTwo % 10 > 0) parts.push(units[lastTwo % 10]);
  }

  let result = parts.join(" e ") + " Reais";
  if (centsPart > 0) {
    if (centsPart < 10) result += " e " + units[centsPart] + " Centavos";
    else if (centsPart < 20) result += " e " + teens[centsPart - 10] + " Centavos";
    else {
      const t = tens[Math.floor(centsPart / 10)];
      const u = centsPart % 10 > 0 ? " e " + units[centsPart % 10] : "";
      result += " e " + t + u + " Centavos";
    }
  }
  return result;
}

export async function generateContract(sale: Sale, client?: Client, locador?: LocadorInfo, vehicle?: VehicleInfo) {
  // Open window synchronously (during click) to avoid popup blockers
  const win = window.open("", "_blank");
  if (!win) {
    alert("Não foi possível abrir o contrato. Permita pop-ups para este site e tente novamente.");
    return;
  }
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Gerando contrato...</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;">Gerando contrato...</body></html>');

  // Branding intencionalmente omitido nos contratos
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const defaultValorParcela = sale.installments > 0
    ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments
    : sale.total;

  const parcelas = Array.from({ length: sale.installments }, (_, i) => {
    const instBaseDate = new Date(sale.date + "T00:00:00");
    const customDate = sale.installmentDates && sale.installmentDates[i];
    const dueDate = customDate
      ? new Date(customDate + "T00:00:00")
      : isRecorrente
        ? addByFrequency(instBaseDate, sale.frequency || "Mensal", i)
        : instBaseDate;
    const amounts = sale.installmentAmounts;
    const value = amounts && amounts[i] != null ? amounts[i] : defaultValorParcela;
    return { number: i + 1, date: format(dueDate, "dd/MM/yyyy"), value };
  });

  const today = format(new Date(), "dd/MM/yyyy");
  const startDate = format(new Date(sale.date + "T00:00:00"), "dd/MM/yyyy");

  // Calculate end date: 1 period after the last installment
  const lastParcelaDate = parcelas.length > 0
    ? new Date(parcelas[parcelas.length - 1].date.split("/").reverse().join("-") + "T00:00:00")
    : new Date(sale.date + "T00:00:00");
  const endDateObj = addByFrequency(lastParcelaDate, sale.frequency || "Mensal", 1);
  const endDate = format(endDateObj, "dd/MM/yyyy");

  const valorParcela = parcelas.length > 0 ? parcelas[0].value : sale.total;
  const valorLocacao = formatCurrencyBR(valorParcela);
  const valorLocacaoExtenso = numberToWords(valorParcela);

  const frequencyLabel = sale.frequency === "Semanal" ? "semana" : sale.frequency === "Quinzenal" ? "quinzena" : sale.frequency === "Diário" ? "dia" : "mês";

  const rawForo = (sale.foroCity || "").trim();
  const clientCity = client?.city ? `${client.city}${client.state ? ` - ${client.state}` : ""}` : "";
  const locadorCity = locador?.cidade ? `${locador.cidade}${locador.estado ? ` - ${locador.estado}` : ""}` : "";
  const foroCity = rawForo || clientCity || locadorCity || "São Gonçalo dos Campos - BA";


  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contrato - ${e(sale.customerName) || e(sale.description)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Times, serif;
    color: #000;
    padding: 50px 60px;
    max-width: 800px;
    margin: 0 auto;
    line-height: 1.7;
    font-size: 14px;
  }
  h1 {
    text-align: center;
    font-size: 18px;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 28px;
    letter-spacing: 1px;
  }
  p { margin-bottom: 12px; text-align: justify; }
  .intro { margin-bottom: 20px; }
  .party { margin-bottom: 6px; }
  .party strong { font-weight: bold; }
  h2 {
    font-size: 14px;
    font-weight: bold;
    margin: 22px 0 8px;
    text-transform: uppercase;
  }
  h3 {
    font-size: 14px;
    font-weight: bold;
    margin: 16px 0 8px;
  }
  ul { margin: 8px 0 12px 20px; list-style: none; }
  ul li { margin-bottom: 4px; }
  ul li::before { content: "- "; }
  .clause-list { margin: 8px 0 12px 0; }
  .clause-list p { margin-bottom: 6px; padding-left: 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0 16px; font-size: 13px; }
  th, td { border: 1px solid #666; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; font-weight: bold; font-size: 12px; text-transform: uppercase; }
  td.right { text-align: right; }
  .signatures { margin-top: 50px; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 50px; gap: 40px; }
  .sig-block { flex: 1; text-align: center; }
  .sig-line { border-top: 1px solid #000; padding-top: 6px; font-size: 13px; }
  .witnesses { margin-top: 40px; }
  .witness-row { display: flex; justify-content: space-between; margin-top: 40px; gap: 40px; }
  .witness-block { flex: 1; }
  .witness-line { border-top: 1px solid #000; padding-top: 6px; font-size: 13px; }
  .location-date { margin-top: 30px; text-align: left; font-size: 14px; }
  .action-bar {
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    gap: 8px;
    z-index: 9999;
  }
  .action-btn {
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .pdf-btn { background: #2563eb; }
  .pdf-btn:hover { background: #1d4ed8; }
  .pdf-btn:disabled { background: #94a3b8; cursor: wait; }
  .print-btn { background: #16a34a; }
  .print-btn:hover { background: #15803d; }
  .close-btn { background: #e53e3e; }
  .close-btn:hover { background: #c53030; }
  @media print {
    .action-bar { display: none; }
    body { padding: 30px 40px; }
    @page { margin: 1.5cm; }
  }
</style>
</head>
<body>

<div class="action-bar">
  <button class="action-btn pdf-btn" id="downloadPdfBtn">⬇ Baixar PDF</button>
  <button class="action-btn print-btn" onclick="window.print()">🖨 Imprimir</button>
  <button class="action-btn close-btn" onclick="window.close()">✕ Fechar</button>
</div>

<div id="contractContent">


<h1>CONTRATO DE LOCAÇÃO DE MOTOCICLETA</h1>

<p class="intro">Pelo presente instrumento particular, de um lado:</p>

<p class="party"><strong>LOCADOR:</strong> ${e(locador?.nome) || "____________________________________________"}, ${e(locador?.nacionalidade) || "Brasileiro(a)"}, ${e(locador?.profissao) || "________________"}, portador(a) do RG nº ${e(formatRG(locador?.rg)) || "__________________"}, CPF nº ${e(formatCPF(locador?.cpf)) || "__________________"}, residente e domiciliado(a) à ${locador?.endereco ? `${e(locador.endereco)}${locador.cidade ? `, ${e(locador.cidade)}` : ""}` : "____________________________________________"}.</p>

<p class="party"><strong>LOCATÁRIO:</strong> ${e(sale.customerName) || "____________________________________________"}, ${e(client?.nacionalidade) || "Brasileiro(a)"}, ${e(client?.estadoCivil) || "________________"}, ${e(client?.profissao) || "________________"}, portador(a) do RG nº ${e(formatRG(client?.rg)) || "__________________"}, CPF nº ${e(formatCPF(client?.cpf)) || "__________________"}, residente e domiciliado(a) à ${client?.address ? `${e(client.address)}${client.bairro ? `, ${e(client.bairro)}` : ""}${client.city ? `, ${e(client.city)}` : ""}` : "____________________________________________"}.</p>

<p>As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Locação de Motocicleta, que será regido pelas cláusulas seguintes:</p>

<h2>CLÁUSULA 1ª – DO OBJETO</h2>
<p>O LOCADOR entrega ao LOCATÁRIO, em perfeito estado de uso e conservação, a motocicleta descrita abaixo:</p>
<ul>
  <li>Marca/Modelo: ${e(vehicle?.marcaModelo) || e(sale.description) || e(sale.productName) || "________________"}</li>
  <li>Ano/Fabricação: ${e(vehicle?.ano) || "________________"}</li>
  <li>Cor: ${e(vehicle?.cor) || "________________"}</li>
  <li>Placa: ${e(vehicle?.placa) || "________________"}</li>
  <li>Renavam: ${e(vehicle?.renavam) || "________________"}</li>
</ul>

<h2>CLÁUSULA 2ª – DO PRAZO</h2>
<p>O presente contrato terá início em ${startDate} e término em ${endDate}, podendo ser renovado mediante novo acordo entre as partes.</p>

<h2>CLÁUSULA 3ª – DO VALOR E FORMA DE PAGAMENTO</h2>
<p>O valor da locação será de ${valorLocacao} (${valorLocacaoExtenso}) por ${frequencyLabel}, a ser pago pelo LOCATÁRIO ao LOCADOR no momento de cada período contratado.</p>


<h2>CLÁUSULA 4ª – DAS OBRIGAÇÕES DO LOCADOR</h2>
<p>O LOCADOR se obriga a:</p>
<div class="clause-list">
  <p>a) Entregar a motocicleta em bom estado de uso e funcionamento;</p>
  <p>b) Manter em dia a documentação obrigatória para circulação;</p>
  <p>c) Fornecer ao LOCATÁRIO os documentos necessários para uso legal do veículo.</p>
</div>

<h2>CLÁUSULA 5ª – DAS OBRIGAÇÕES DO LOCATÁRIO</h2>
<p>O LOCATÁRIO se obriga a:</p>
<div class="clause-list">
  <p>a) Utilizar a motocicleta exclusivamente para fins lícitos;</p>
  <p>b) Zelar pela conservação do veículo, responsabilizando-se por eventuais danos;</p>
  <p>c) Arcar com despesas de combustível e eventuais multas de trânsito durante o período de locação;</p>
  <p>d) Restituir a motocicleta ao LOCADOR no prazo estipulado e no mesmo estado em que a recebeu, salvo desgaste natural.</p>
</div>

<h2>CLÁUSULA 6ª – DA RESPONSABILIDADE</h2>
<p>O LOCATÁRIO será responsável por quaisquer acidentes, multas ou infrações cometidas durante o período de locação, bem como por danos causados a terceiros.</p>

<h2>CLÁUSULA 7ª – DA RESCISÃO</h2>
<p>O presente contrato poderá ser rescindido por qualquer das partes em caso de descumprimento das cláusulas aqui estabelecidas, mediante comunicação por escrito.</p>

<h2>CLÁUSULA 8ª – DO FORO</h2>
<p>Fica eleito o foro da comarca de ${e(foroCity)} para dirimir quaisquer controvérsias oriundas deste contrato.</p>

${sale.notes ? `<h2>OBSERVAÇÕES</h2><p>${e(sale.notes).replace(/\n/g, "<br>")}</p>` : ""}

<p class="location-date">${e(foroCity)}, ${today}.</p>

<div class="signatures">
  <div class="sig-row">
    <div class="sig-block">
      <div class="sig-line"><strong>LOCADOR:</strong> ___________________________<br>${e(locador?.nome) || ""}</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"><strong>LOCATÁRIO:</strong> ___________________________<br>${e(sale.customerName) || ""}</div>
    </div>
  </div>

  <div class="witnesses">
    <div class="witness-row">
      <div class="witness-block">
        <div class="witness-line"><strong>TESTEMUNHA 1:</strong> ___________________________ CPF: _______________</div>
      </div>
      <div class="witness-block">
        <div class="witness-line"><strong>TESTEMUNHA 2:</strong> ___________________________ CPF: _______________</div>
      </div>
    </div>
</div>

</div><!-- /contractContent -->

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
  (function() {
    var btn = document.getElementById('downloadPdfBtn');
    var safeName = ${JSON.stringify((sale.customerName || sale.description || "contrato").replace(/[^\w\-]+/g, "_"))};
    btn.addEventListener('click', function() {
      if (typeof html2pdf === 'undefined') {
        alert('Biblioteca de PDF ainda não carregou. Tente novamente em instantes.');
        return;
      }
      btn.disabled = true;
      var originalText = btn.textContent;
      btn.textContent = 'Gerando...';
      var element = document.getElementById('contractContent');
      var opt = {
        margin: [10, 12, 10, 12],
        filename: 'Contrato_' + safeName + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };
      html2pdf().set(opt).from(element).save().then(function() {
        btn.disabled = false;
        btn.textContent = originalText;
      }).catch(function(err) {
        console.error(err);
        alert('Erro ao gerar PDF: ' + (err && err.message ? err.message : 'desconhecido'));
        btn.disabled = false;
        btn.textContent = originalText;
      });
    });
  })();
</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
