import { Input } from "@/components/ui/input";

export interface DashboardChartEditorColumn {
  key: string;
  label: string;
  labelClass?: string;
  getValue: (month: string) => string;
  onChange: (month: string, value: string) => void;
}

interface Props {
  rows: { month: string }[];
  columns: DashboardChartEditorColumn[];
}

/**
 * Tabela inline de edição de overrides para gráficos do Dashboard.
 * Apenas apresentação — recebe colunas via configuração.
 */
export function DashboardChartEditor({ rows, columns }: Props) {
  return (
    <div className="mb-4 max-h-60 overflow-y-auto border rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="text-left p-2 font-medium text-muted-foreground">Mês</th>
            {columns.map((c) => (
              <th key={c.key} className={`text-right p-2 font-medium ${c.labelClass ?? ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.month} className="border-t border-border/50">
              <td className="p-2 font-medium">{m.month}</td>
              {columns.map((c) => (
                <td key={c.key} className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={c.getValue(m.month)}
                    onChange={(e) => c.onChange(m.month, e.target.value)}
                    className="h-7 w-28 text-xs text-right ml-auto"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
